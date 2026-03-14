'use strict'

const GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile'
const MAX_INPUT_CHARS = 6000

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

const PROMPT = `You are analyzing a document extracted from a large archive. The text has been programmatically parsed from a PDF and may contain OCR errors, garbled names, or formatting artifacts.

Analyze the text and return a JSON object with these fields:
{
  "cleaned_text": "First 2000 chars of cleaned-up text (fix obvious OCR errors, normalize names)",
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

async function groqCleanup (text) {
  const client = getGroq()
  const truncated = text.slice(0, MAX_INPUT_CHARS)

  const response = await client.chat.completions.create({
    model: GROQ_MODEL,
    messages: [
      { role: 'system', content: PROMPT },
      { role: 'user', content: truncated }
    ],
    temperature: 0.1,
    max_tokens: 3000,
    response_format: { type: 'json_object' }
  })

  const content = response.choices[0]?.message?.content
  if (!content) return null

  try {
    return JSON.parse(content)
  } catch {
    console.warn('Failed to parse Groq response as JSON')
    return null
  }
}

module.exports = { groqCleanup }
