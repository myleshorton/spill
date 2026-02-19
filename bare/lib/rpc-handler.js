/**
 * JSON-RPC 2.0 handler for IPC communication with Flutter.
 *
 * Receives JSON-RPC requests from Flutter via IPC, dispatches to registered
 * handlers, and sends responses back. Also supports sending notifications
 * (no id) from JS to Flutter.
 */
class RpcHandler {
  constructor (ipc) {
    this.ipc = ipc
    this.methods = new Map()

    ipc.on('data', (buf) => this._handleMessage(buf))
  }

  register (method, handler) {
    this.methods.set(method, handler)
  }

  notify (method, params) {
    const msg = JSON.stringify({
      jsonrpc: '2.0',
      method,
      params
    })
    this.ipc.write(Buffer.from(msg))
  }

  async _handleMessage (buf) {
    const str = buf.toString()

    // IPC may deliver multiple JSON messages concatenated in one buffer.
    // Split them by scanning for top-level JSON object boundaries.
    const messages = this._splitJsonMessages(str)

    for (const msgStr of messages) {
      await this._dispatchMessage(msgStr)
    }
  }

  _splitJsonMessages (str) {
    const results = []
    let i = 0
    while (i < str.length) {
      while (i < str.length && ' \n\r\t'.includes(str[i])) i++
      if (i >= str.length) break
      if (str[i] !== '{') {
        const next = str.indexOf('{', i)
        if (next === -1) break
        i = next
      }
      let depth = 0
      let start = i
      let inString = false
      let escaped = false
      for (let j = i; j < str.length; j++) {
        const c = str[j]
        if (escaped) { escaped = false; continue }
        if (c === '\\' && inString) { escaped = true; continue }
        if (c === '"') { inString = !inString; continue }
        if (inString) continue
        if (c === '{') depth++
        if (c === '}') {
          depth--
          if (depth === 0) {
            results.push(str.substring(start, j + 1))
            i = j + 1
            break
          }
        }
      }
      if (depth !== 0) break
    }
    return results
  }

  async _dispatchMessage (msgStr) {
    let request
    try {
      request = JSON.parse(msgStr)
    } catch (err) {
      console.error('[rpc] Failed to parse message:', err.message)
      return
    }

    // If no id, this is a notification from Flutter (no response expected)
    if (request.id === undefined || request.id === null) {
      const handler = this.methods.get(request.method)
      if (handler) {
        try {
          await handler(request.params || {})
        } catch (err) {
          console.error('[rpc] Notification handler error:', request.method, err.message)
        }
      }
      return
    }

    // It's a request — dispatch and respond
    const handler = this.methods.get(request.method)
    if (!handler) {
      this._sendError(request.id, -32601, `Method not found: ${request.method}`)
      return
    }

    try {
      const result = await handler(request.params || {})
      this._sendResult(request.id, result)
    } catch (err) {
      this._sendError(request.id, -32000, err.message)
    }
  }

  _sendResult (id, result) {
    const msg = JSON.stringify({
      jsonrpc: '2.0',
      result: result !== undefined ? result : null,
      id
    })
    this.ipc.write(Buffer.from(msg))
  }

  _sendError (id, code, message) {
    const msg = JSON.stringify({
      jsonrpc: '2.0',
      error: { code, message },
      id
    })
    this.ipc.write(Buffer.from(msg))
  }
}

module.exports = RpcHandler
