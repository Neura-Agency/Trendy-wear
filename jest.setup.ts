// Load environment variables from .env.local and .env
import dotenv from 'dotenv'
import path from 'path'

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })
dotenv.config()

const nodeFetch = require('node-fetch')
if (!globalThis.fetch) {
  ;(globalThis as any).fetch = nodeFetch
}
if (!globalThis.Request) {
  ;(globalThis as any).Request = nodeFetch.Request
}
if (!globalThis.Response) {
  ;(globalThis as any).Response = nodeFetch.Response
}
if (!globalThis.Response.json) {
  ;(globalThis.Response as any).json = (data: any, init?: any) => {
    return new (globalThis.Response as any)(JSON.stringify(data), {
      ...init,
      headers: {
        'content-type': 'application/json',
        ...(init?.headers || {}),
      },
    })
  }
}
if (!globalThis.Headers) {
  ;(globalThis as any).Headers = nodeFetch.Headers
}

// jest-dom adds custom jest matchers for asserting on DOM nodes.
// We import it directly in each test file that needs DOM matchers.
export {}