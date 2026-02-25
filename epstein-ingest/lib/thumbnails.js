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

function thumbnailPdf (filePath, outputPath) {
  try {
    // Use pdftoppm to render first page, then resize with sharp (or just use the raw output)
    const tmpPath = outputPath + '.ppm'
    execFileSync('pdftoppm', [
      '-f', '1', '-l', '1',
      '-jpeg', '-r', '150',
      '-singlefile',
      filePath,
      outputPath.replace('.jpg', '')
    ], { timeout: 30000, stdio: 'pipe' })

    // pdftoppm creates output with .jpg extension
    const generatedPath = outputPath.replace('.jpg', '') + '.jpg'
    if (fs.existsSync(generatedPath) && generatedPath !== outputPath) {
      fs.renameSync(generatedPath, outputPath)
    }

    if (sharp && fs.existsSync(outputPath)) {
      const buffer = sharp(outputPath)
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

module.exports = { generateThumbnail }
