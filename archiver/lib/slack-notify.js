const fetch = require('node-fetch')

const WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL || null

async function sendSlackNotification (text, blocks) {
  if (!WEBHOOK_URL) return
  try {
    const body = blocks ? { text, blocks } : { text }
    await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      timeout: 5000,
    })
  } catch (err) {
    console.warn('[slack] Notification failed:', err.message)
  }
}

function notifyComment (docTitle, displayName, commentBody, docId, siteUrl) {
  const url = `${siteUrl}/doc/${docId}`
  const truncated = commentBody.length > 200 ? commentBody.slice(0, 200) + '...' : commentBody
  sendSlackNotification(
    `💬 New comment by ${displayName} on "${docTitle}":\n${truncated}\n${url}`,
    [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `💬 *New comment* by *${displayName}*\non <${url}|${docTitle}>\n>${truncated.replace(/\n/g, '\n>')}`
        }
      }
    ]
  )
}

function notifyUpload (fileName, docId, siteUrl) {
  const url = docId ? `${siteUrl}/doc/${docId}` : siteUrl
  sendSlackNotification(
    `📄 New document uploaded: ${fileName}\n${url}`,
    [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `📄 *New document uploaded*\n<${url}|${fileName}>`
        }
      }
    ]
  )
}

module.exports = { sendSlackNotification, notifyComment, notifyUpload }
