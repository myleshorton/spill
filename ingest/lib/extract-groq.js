'use strict'

const GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile'
const MAX_INPUT_CHARS = 6000
const CLEANUP_CHUNK_SIZE = 4000
const MAX_CLEANUP_CHUNKS = 3 // ~12K chars cleaned by LLM, rest kept as-is

let groqClient = null

function getGroq () {
  if (!groqClient) {
    const OpenAI = require('openai')
    groqClient = new OpenAI({
      apiKey: process.env.GROQ_API_KEY,
      baseURL: 'https://api.groq.com/openai/v1'
    })
  }
  return groqClient
}

const METADATA_PROMPT = `You are analyzing a document extracted from a large archive. The text was programmatically parsed from a PDF and may contain OCR errors or garbled names.

Return a JSON object with these fields:
{
  "people": ["List of people mentioned (full names, normalized)"],
  "organizations": ["List of organizations mentioned"],
  "document_type": "email_thread | embedded_html | metadata_rich | structured_table | correspondence | legal | financial | other",
  "summary": "2-3 sentence summary of what this document contains",
  "email_count": 0,
  "senders": ["email senders if applicable"],
  "recipients": ["email recipients if applicable"],
  "date_range_start": "ISO date or null",
  "date_range_end": "ISO date or null",
  "confidence": 0.8
}

Return ONLY valid JSON, no other text.`

const CLEANUP_PROMPT = `Clean up the following text that was extracted from a PDF via OCR. Fix:
- Garbled names and words (e.g. "SURMA" → "Starmer", "HATERHAL" → likely a name)
- Remove leftover HTML artifacts and formatting noise
- Fix broken email headers (From:, To:, Subject:, Date:)
- Preserve the actual content and meaning
- Keep it as plain readable text

CRITICAL: Return ONLY the cleaned text. Do NOT add commentary, explanations, or notes about the text quality. Do NOT say things like "the text appears to be corrupted" or "unable to extract". If the text is too garbled to clean, return it unchanged. Never replace the original content with your own description of it.`

async function groqMetadata (text) {
  const client = getGroq()
  const truncated = text.slice(0, MAX_INPUT_CHARS)

  const response = await client.chat.completions.create({
    model: GROQ_MODEL,
    messages: [
      { role: 'system', content: METADATA_PROMPT },
      { role: 'user', content: truncated }
    ],
    temperature: 0.1,
    max_tokens: 2000,
    response_format: { type: 'json_object' }
  })

  const content = response.choices[0]?.message?.content
  if (!content) return null

  try {
    return JSON.parse(content)
  } catch {
    console.warn('Failed to parse Groq metadata response as JSON')
    return null
  }
}

async function groqCleanupText (text) {
  const client = getGroq()
  const chunks = []

  // Split text into chunks
  for (let i = 0; i < text.length && chunks.length < MAX_CLEANUP_CHUNKS; i += CLEANUP_CHUNK_SIZE) {
    chunks.push(text.slice(i, i + CLEANUP_CHUNK_SIZE))
  }

  const cleanedParts = []
  for (const chunk of chunks) {
    let retries = 2
    let success = false
    while (retries >= 0 && !success) {
      try {
        const response = await client.chat.completions.create({
          model: GROQ_MODEL,
          messages: [
            { role: 'system', content: CLEANUP_PROMPT },
            { role: 'user', content: chunk }
          ],
          temperature: 0.1,
          max_tokens: 6000
        })

        const content = response.choices[0]?.message?.content
        if (content) {
          cleanedParts.push(content)
        } else {
          cleanedParts.push(chunk)
        }
        success = true
        await sleep(200) // pace between chunks
      } catch (err) {
        retries--
        if (retries >= 0 && err.status === 429) {
          await sleep(1000) // wait on rate limit
        } else {
          cleanedParts.push(chunk) // fallback to original
          success = true
        }
      }
    }
  }

  // If text was longer than what we cleaned, append the remainder
  const cleanedLength = chunks.length * CLEANUP_CHUNK_SIZE
  if (text.length > cleanedLength) {
    cleanedParts.push(text.slice(cleanedLength))
  }

  return cleanedParts.join('\n')
}

function sleep (ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// Combined: get metadata + clean text (sequential to avoid rate limits)
async function groqCleanup (text) {
  let metadata = null
  try {
    metadata = await groqMetadata(text)
  } catch { /* metadata is optional */ }

  await sleep(300) // breathing room between calls

  let cleanedText = text
  try {
    cleanedText = await groqCleanupText(text)
  } catch { /* fall back to original text */ }

  return { metadata, cleanedText }
}

module.exports = { groqCleanup, groqMetadata, groqCleanupText }
