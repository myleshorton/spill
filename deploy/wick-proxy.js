#!/usr/bin/env node
/**
 * Tiny HTTP proxy that wraps wick CLI for use by Docker containers.
 * Listens on port 9876 and accepts GET /fetch?url=<encoded-url>&format=<format>
 * Returns wick's output as the response body.
 */
const http = require('http')
const { execFile } = require('child_process')
const { URL } = require('url')

const PORT = parseInt(process.env.WICK_PROXY_PORT || '9876')
const WICK_PATH = process.env.WICK_PATH || '/opt/wick/wick'
const TIMEOUT = 60000

const server = http.createServer((req, res) => {
  if (req.method !== 'GET' || !req.url.startsWith('/fetch')) {
    res.writeHead(404)
    res.end('Not found')
    return
  }

  const parsed = new URL(req.url, `http://localhost:${PORT}`)
  const targetUrl = parsed.searchParams.get('url')
  const format = parsed.searchParams.get('format') || 'html'

  if (!targetUrl) {
    res.writeHead(400)
    res.end('Missing url parameter')
    return
  }

  const args = ['fetch', targetUrl, '--format', format, '--no-robots']
  if (parsed.searchParams.get('render-js') === 'true') {
    args.push('--render-js')
  }

  execFile(WICK_PATH, args, {
    timeout: TIMEOUT,
    maxBuffer: 50 * 1024 * 1024,
    env: { ...process.env, LD_LIBRARY_PATH: '/opt/wick:' + (process.env.LD_LIBRARY_PATH || '') }
  }, (err, stdout, stderr) => {
    if (err) {
      res.writeHead(502)
      res.end(JSON.stringify({ error: err.message, stderr }))
      return
    }
    res.writeHead(200, { 'Content-Type': format === 'html' ? 'text/html' : 'text/plain' })
    res.end(stdout)
  })
})

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Wick proxy listening on port ${PORT}`)
})
