/**
 * Thumbnail generation for various file types.
 * Uses sharp for images, ffmpeg for videos, and pdftoppm for PDFs.
 */
const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')

let sharp
try {
  sharp = require('sharp')
} catch {
  sharp = null
}

const THUMB_WIDTH = 400
const THUMB_HEIGHT = 300

async function generateThumbnail (filePath, outputPath, contentType) {
  const dir = path.dirname(outputPath)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })

  if (contentType === 'image') return thumbnailImage(filePath, outputPath)
  if (contentType === 'video') return thumbnailVideo(filePath, outputPath)
  if (contentType === 'pdf') return thumbnailPdf(filePath, outputPath)
  if (contentType === 'html') return thumbnailHtml(filePath, outputPath)

  return false
}

async function thumbnailImage (filePath, outputPath) {
  if (!sharp) {
    console.warn('[thumb] sharp not available, skipping thumbnail for', path.basename(filePath))
    return false
  }

  try {
    await sharp(filePath)
      .resize(THUMB_WIDTH, THUMB_HEIGHT, { fit: 'cover' })
      .jpeg({ quality: 75 })
      .toFile(outputPath)
    return true
  } catch (err) {
    console.error('[thumb] Image thumbnail failed for %s: %s', path.basename(filePath), err.message)
    return false
  }
}

function thumbnailVideo (filePath, outputPath) {
  try {
    execFileSync('ffmpeg', [
      '-i', filePath,
      '-vframes', '1',
      '-vf', `scale=${THUMB_WIDTH}:-1`,
      '-y',
      outputPath
    ], { timeout: 30000, stdio: 'pipe' })
    return fs.existsSync(outputPath)
  } catch (err) {
    console.error('[thumb] Video thumbnail failed for %s: %s', path.basename(filePath), err.message)
    return false
  }
}

async function thumbnailPdf (filePath, outputPath) {
  try {
    // Use pdftoppm to render first page, then resize with sharp (or just use the raw output)
    const tmpPath = outputPath + '.ppm'
    execFileSync('pdftoppm', [
      '-f', '1', '-l', '1',
      '-jpeg', '-r', '150',
      '-singlefile',
      filePath,
      outputPath.replace('.jpg', '')
    ], { timeout: 30000, stdio: ['pipe', 'pipe', 'ignore'] })

    // pdftoppm creates output with .jpg extension
    const generatedPath = outputPath.replace('.jpg', '') + '.jpg'
    if (fs.existsSync(generatedPath) && generatedPath !== outputPath) {
      fs.renameSync(generatedPath, outputPath)
    }

    if (sharp && fs.existsSync(outputPath)) {
      const buffer = await sharp(outputPath)
        .resize(THUMB_WIDTH, THUMB_HEIGHT, { fit: 'cover' })
        .jpeg({ quality: 75 })
        .toBuffer()
      fs.writeFileSync(outputPath, buffer)
    }

    return fs.existsSync(outputPath)
  } catch (err) {
    console.error('[thumb] PDF thumbnail failed for %s: %s', path.basename(filePath), err.message)
    return false
  }
}

async function thumbnailHtml (filePath, outputPath) {
  if (!sharp) {
    console.warn('[thumb] sharp not available, skipping thumbnail for', path.basename(filePath))
    return false
  }

  try {
    const html = fs.readFileSync(filePath, 'utf8')

    // Extract title
    const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i)
    let title = (titleMatch ? titleMatch[1] : path.basename(filePath, '.html')).trim()
    if (title.length > 60) title = title.slice(0, 57) + '...'

    // Extract body text (strip tags)
    let text = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&[a-z]+;/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    if (text.length > 300) text = text.slice(0, 300)

    // Wrap text into lines (~45 chars each)
    const lines = []
    const words = text.split(' ')
    let line = ''
    for (const word of words) {
      if ((line + ' ' + word).length > 45) {
        lines.push(line.trim())
        line = word
      } else {
        line += ' ' + word
      }
      if (lines.length >= 8) break
    }
    if (line.trim() && lines.length < 8) lines.push(line.trim())

    // Wrap title into lines (~35 chars)
    const titleLines = []
    const titleWords = title.split(' ')
    let tLine = ''
    for (const w of titleWords) {
      if ((tLine + ' ' + w).length > 35) {
        titleLines.push(tLine.trim())
        tLine = w
      } else {
        tLine += ' ' + w
      }
      if (titleLines.length >= 2) break
    }
    if (tLine.trim() && titleLines.length < 2) titleLines.push(tLine.trim())

    const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

    const titleSvg = titleLines
      .map((l, i) => `<text x="20" y="${28 + i * 22}" font-family="sans-serif" font-size="16" font-weight="bold" fill="#e2e8f0">${esc(l)}</text>`)
      .join('\n')
    const bodyY = 28 + titleLines.length * 22 + 16
    const bodySvg = lines
      .map((l, i) => `<text x="20" y="${bodyY + i * 18}" font-family="sans-serif" font-size="12" fill="#94a3b8">${esc(l)}</text>`)
      .join('\n')

    const svg = `<svg width="${THUMB_WIDTH}" height="${THUMB_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="#1e293b"/>
      <rect x="12" y="8" width="6" height="${THUMB_HEIGHT - 16}" rx="3" fill="#0ea5e9" opacity="0.5"/>
      ${titleSvg}
      ${bodySvg}
    </svg>`

    await sharp(Buffer.from(svg))
      .jpeg({ quality: 80 })
      .toFile(outputPath)
    return true
  } catch (err) {
    console.error('[thumb] HTML thumbnail failed for %s: %s', path.basename(filePath), err.message)
    return false
  }
}

module.exports = { generateThumbnail }
