export type SameSite = 'Strict' | 'Lax' | 'None'

export interface CookieOptions {
  maxAge?: number
  expires?: Date
  path?: string
  httpOnly?: boolean
  secure?: boolean
  sameSite?: SameSite
}

export function parseCookies(headerValue: string | undefined): Record<string, string> {
  const header = headerValue ?? ''
  const out: Record<string, string> = {}
  if (!header) return out

  for (const part of header.split(';')) {
    const trimmed = part.trim()
    if (!trimmed) continue
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx === -1) continue
    const rawName = trimmed.slice(0, eqIdx).trim()
    const rawValue = trimmed.slice(eqIdx + 1).trim()
    if (!rawName) continue
    try {
      out[decodeURIComponent(rawName)] = decodeURIComponent(rawValue)
    } catch {
      out[rawName] = rawValue
    }
  }
  return out
}

export function serializeCookie(name: string, value: string, options: CookieOptions = {}): string {
  let str = `${encodeURIComponent(name)}=${encodeURIComponent(value)}`
  if (options.maxAge !== undefined) str += `; Max-Age=${Math.floor(options.maxAge)}`
  if (options.expires) str += `; Expires=${options.expires.toUTCString()}`
  str += `; Path=${options.path ?? '/'}`
  if (options.httpOnly) str += '; HttpOnly'
  if (options.secure) str += '; Secure'
  if (options.sameSite) str += `; SameSite=${options.sameSite}`
  return str
}
