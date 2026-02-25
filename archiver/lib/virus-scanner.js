const net = require('net')
const fs = require('fs')

const CLAMAV_HOST = process.env.CLAMAV_HOST || 'clamav'
const CLAMAV_PORT = parseInt(process.env.CLAMAV_PORT || '3310', 10)
const CHUNK_SIZE = 8192

class VirusScanner {
  constructor (options = {}) {
    this.host = options.host || CLAMAV_HOST
    this.port = options.port || CLAMAV_PORT
  }

  ping () {
    return new Promise((resolve, reject) => {
      const socket = net.createConnection(this.port, this.host, () => {
        socket.write('zPING\0')
      })
      let response = ''
      socket.on('data', (data) => { response += data.toString() })
      socket.on('end', () => {
        resolve(response.trim() === 'PONG')
      })
      socket.on('error', reject)
      socket.setTimeout(5000, () => {
        socket.destroy()
        reject(new Error('ClamAV ping timeout'))
      })
    })
  }

  scan (filePath) {
    return new Promise((resolve, reject) => {
      if (!fs.existsSync(filePath)) {
        return reject(new Error(`File not found: ${filePath}`))
      }

      const socket = net.createConnection(this.port, this.host, () => {
        // INSTREAM protocol: send zINSTREAM\0, then chunks as [uint32 length][data], end with [uint32 0]
        socket.write('zINSTREAM\0')

        const stream = fs.createReadStream(filePath, { highWaterMark: CHUNK_SIZE })
        stream.on('data', (chunk) => {
          const header = Buffer.alloc(4)
          header.writeUInt32BE(chunk.length, 0)
          socket.write(header)
          socket.write(chunk)
        })
        stream.on('end', () => {
          const end = Buffer.alloc(4, 0)
          socket.write(end)
        })
        stream.on('error', (err) => {
          socket.destroy()
          reject(err)
        })
      })

      let response = ''
      socket.on('data', (data) => { response += data.toString() })
      socket.on('end', () => {
        const trimmed = response.trim().replace(/\0/g, '')
        if (trimmed.endsWith('OK')) {
          resolve({ clean: true })
        } else if (trimmed.includes('FOUND')) {
          const virus = trimmed.replace('stream: ', '').replace(' FOUND', '')
          resolve({ clean: false, virus })
        } else {
          reject(new Error(`Unexpected ClamAV response: ${trimmed}`))
        }
      })
      socket.on('error', reject)
      socket.setTimeout(120000, () => {
        socket.destroy()
        reject(new Error('ClamAV scan timeout'))
      })
    })
  }
}

module.exports = VirusScanner
