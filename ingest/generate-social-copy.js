#!/usr/bin/env node
/**
 * Generate social media copy for top entities.
 * Uses Groq to create compelling, shareable posts for X/Bluesky/Reddit.
 */

const fs = require('fs')
const path = require('path')

const GROQ_API_KEY = process.env.GROQ_API_KEY
if (!GROQ_API_KEY) {
  console.error('GROQ_API_KEY required')
  process.exit(1)
}

const SITE_URL = 'https://unredact.org'

// Curated list of the most socially-relevant entities
const ENTITIES = [
  { id: 11, name: 'Jeffrey Epstein', type: 'person', docs: 284518, connections: ['Ghislaine Maxwell', 'Lesley Groff', 'Prince Andrew'] },
  { id: null, name: 'Ghislaine Maxwell', type: 'person', docs: 15118, connections: ['Jeffrey Epstein', 'Lesley Groff', 'Larry Visoski'] },
  { id: null, name: 'Prince Andrew', type: 'person', docs: 1846, connections: ['Jeffrey Epstein', 'David Stem'] },
  { id: null, name: 'Bill Clinton', type: 'person', docs: 1380, connections: ['Clinton Foundation', 'George W. Bush'] },
  { id: null, name: 'Donald Trump', type: 'person', docs: 94, connections: ['Jeffrey Epstein'] },
  { id: null, name: 'Lesley Groff', type: 'person', docs: 17443, connections: ['Jeffrey Epstein', 'Ghislaine Maxwell'] },
  { id: null, name: 'Larry Visoski', type: 'person', docs: 2643, connections: ['Jeffrey Epstein', 'FAA'] },
  { id: null, name: 'Karyna Shuliak', type: 'person', docs: 8485, connections: ['Jeffrey Epstein'] },
  { id: null, name: 'Alison J. Nathan', type: 'person', docs: 10020, connections: ['United States v. Ghislaine Maxwell'] },
  { id: null, name: 'Richard Kahn', type: 'person', docs: 1759, connections: ['Peggy Siegal', 'Jeffrey Epstein'] },
  { id: null, name: 'Bella Klein', type: 'person', docs: 2914, connections: ['Jeffrey Epstein'] },
  { id: null, name: 'Kathy Ruemmler', type: 'person', docs: 866, connections: ['Jeffrey Epstein', 'IRS'] },
  { id: null, name: 'Story Cowles', type: 'person', docs: 904, connections: ['Jeffrey Epstein', 'Google Alerts'] },
  { id: null, name: 'Ann Rodriquez', type: 'person', docs: 1343, connections: ['Jeffrey Epstein'] },
  { id: null, name: 'Daphne Wallace', type: 'person', docs: 990, connections: ['Jeffrey Epstein', 'Admiral Farragut Academy'] },
  { id: null, name: 'Jojo Fontanilla', type: 'person', docs: 1158, connections: ['Jeffrey Epstein'] },
  { id: null, name: 'Leo Loking', type: 'person', docs: 1189, connections: ['Lesley Groff', 'Karyna Shuliak'] },
  { id: null, name: 'Merwin Dela Cruz', type: 'person', docs: 2216, connections: ['Jeffrey Epstein'] },
  { id: null, name: 'Sarah K', type: 'person', docs: 950, connections: ['Jeffrey Epstein'] },
  { id: null, name: 'G. Max', type: 'person', docs: 1048, connections: ['Doug Band', 'David Dorman'] },
  { id: null, name: 'Nicholas Tartaglione', type: 'person', docs: 18, connections: ['Jeffrey Epstein'] },
  { id: null, name: 'Metropolitan Correctional Center (MCC) New York', type: 'organization', docs: 1672, connections: ['Jeffrey Epstein', 'FBI'] },
  { id: null, name: 'Federal Bureau of Prisons', type: 'organization', docs: 1687, connections: ['U.S. Department of Justice'] },
  { id: null, name: 'FBI', type: 'organization', docs: 1369, connections: ['Jeffrey Epstein'] },
  { id: null, name: 'HBRK Associates Inc.', type: 'organization', docs: 927, connections: ['Richard Kahn', 'Brice Gordon'] },
  { id: null, name: 'Palm Beach', type: 'location', docs: 1384, connections: ['Jeffrey Epstein'] },
  { id: null, name: 'Teterboro', type: 'location', docs: 1148, connections: ['Jeffrey Epstein', 'Flight Options'] },
  { id: null, name: 'St. Thomas', type: 'location', docs: 975, connections: ['Jeffrey Epstein'] },
  { id: null, name: 'JFK', type: 'location', docs: 1210, connections: ['Jeffrey Epstein'] },
]

async function generateCopy(entity) {
  const searchName = encodeURIComponent(entity.name)
  const entityUrl = `${SITE_URL}/entities?q=${searchName}`
  const searchUrl = `${SITE_URL}/search?q=${searchName}`
  const chatUrl = `${SITE_URL}/chat?q=What+do+the+documents+reveal+about+${searchName}`

  const prompt = `You are writing social media posts for an anonymous transparency collective that operates a searchable archive of 1.4 million DOJ Epstein documents at unredact.org.

Entity: ${entity.name}
Type: ${entity.type}
Documents mentioning them: ${entity.docs.toLocaleString()}
Known connections: ${entity.connections.join(', ')}

Entity page URL: ${entityUrl}
Search URL: ${searchUrl}
AI chat URL: ${chatUrl}

Write 3 social media posts for different platforms. Each should:
- Be genuinely informative, not clickbaity
- Reference a specific, intriguing fact or angle about this entity's role in the Epstein case
- Include one URL (vary which one you use)
- Feel like it comes from a knowledgeable researcher, not a bot
- NOT use hashtags excessively (max 2)
- NOT use emojis

Format your response as JSON:
{
  "twitter": "Post for X/Twitter (max 280 chars, include URL)",
  "bluesky": "Post for Bluesky (max 300 chars, include URL)",
  "reddit_title": "Reddit post title for r/Epstein or r/EpsteinAndFriends",
  "reddit_body": "Reddit post body (2-4 sentences, include URL)"
}

Return ONLY the JSON, no markdown fences, no explanation.`

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${GROQ_API_KEY}`
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      max_tokens: 500,
      temperature: 0.7,
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' }
    })
  })

  const data = await res.json()
  if (data.error) throw new Error(data.error.message)

  let text = data.choices[0].message.content
  text = text.replace(/<think>[\s\S]*?<\/think>/g, '').trim()
  return JSON.parse(text)
}

async function main() {
  const results = []

  for (let i = 0; i < ENTITIES.length; i++) {
    const entity = ENTITIES[i]
    process.stderr.write(`[${i + 1}/${ENTITIES.length}] ${entity.name}...`)

    try {
      const copy = await generateCopy(entity)
      results.push({
        entity: entity.name,
        type: entity.type,
        docs: entity.docs,
        connections: entity.connections,
        urls: {
          entity: `${SITE_URL}/entities?q=${encodeURIComponent(entity.name)}`,
          search: `${SITE_URL}/search?q=${encodeURIComponent(entity.name)}`,
          chat: `${SITE_URL}/chat?q=What+do+the+documents+reveal+about+${encodeURIComponent(entity.name)}`
        },
        copy
      })
      process.stderr.write(' done\n')

      // Rate limit
      await new Promise(r => setTimeout(r, 200))
    } catch (err) {
      process.stderr.write(` ERROR: ${err.message}\n`)
    }
  }

  process.stdout.write(JSON.stringify(results, null, 2))
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
