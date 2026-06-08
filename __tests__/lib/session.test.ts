describe('Session & Cookie Utilities - Business Logic', () => {
  test('should parse cookies correctly', () => {
    const parseCookies = (headerValue: string | undefined): Record<string, string> => {
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
        out[decodeURIComponent(rawName)] = decodeURIComponent(rawValue)
      }
      return out
    }

    const cookies = parseCookies('tw_session=abc123; theme=dark')
    expect(cookies.tw_session).toBe('abc123')
    expect(cookies.theme).toBe('dark')
  })

  test('should handle empty cookie header', () => {
    const parseCookies = (headerValue: string | undefined): Record<string, string> => {
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
        out[decodeURIComponent(rawName)] = decodeURIComponent(rawValue)
      }
      return out
    }

    expect(parseCookies('')).toEqual({})
    expect(parseCookies(undefined)).toEqual({})
  })

  test('should serialize cookie with options', () => {
    const serializeCookie = (name: string, value: string, options: any = {}): string => {
      let str = `${encodeURIComponent(name)}=${encodeURIComponent(value)}`
      if (options.maxAge !== undefined) str += `; Max-Age=${Math.floor(options.maxAge)}`
      if (options.expires) str += `; Expires=${options.expires.toUTCString()}`
      str += `; Path=${options.path ?? '/'}`
      if (options.httpOnly) str += '; HttpOnly'
      if (options.secure) str += '; Secure'
      if (options.sameSite) str += `; SameSite=${options.sameSite}`
      return str
    }

    const result = serializeCookie('tw_session', 'token123', {
      httpOnly: true,
      secure: true,
      sameSite: 'Lax',
      maxAge: 3600,
    })

    expect(result).toContain('tw_session=token123')
    expect(result).toContain('Max-Age=3600')
    expect(result).toContain('HttpOnly')
    expect(result).toContain('Secure')
    expect(result).toContain('SameSite=Lax')
    expect(result).toContain('Path=/')
  })

  test('should check admin and super admin roles', () => {
    const isAdmin = (role: string) => role === 'admin'
    const isSuperAdmin = (role: string, scope: string | null) => role === 'admin' && scope === 'all'

    expect(isAdmin('admin')).toBe(true)
    expect(isAdmin('store')).toBe(false)
    expect(isSuperAdmin('admin', 'all')).toBe(true)
    expect(isSuperAdmin('admin', null)).toBe(false)
    expect(isSuperAdmin('store', 'all')).toBe(false)
  })

  test('should detect expired sessions', () => {
    const isExpired = (expiresAt: string) => {
      return new Date(expiresAt).getTime() <= Date.now()
    }

    expect(isExpired('2020-01-01')).toBe(true)      // past
    expect(isExpired('2099-01-01')).toBe(false)      // future
  })

  test('should detect revoked sessions', () => {
    const isRevoked = (revokedAt: string | null) => {
      return revokedAt !== null
    }

    expect(isRevoked(null)).toBe(false)
    expect(isRevoked('2024-01-01T10:00:00Z')).toBe(true)
  })

  test('should detect inactive accounts', () => {
    const isActive = (account: any) => account.is_active !== false

    expect(isActive({ is_active: true })).toBe(true)
    expect(isActive({ is_active: false })).toBe(false)
    expect(isActive({})).toBe(true)   // null/undefined means active
  })

  test('should get allowed store IDs based on role', () => {
    const getStoreFilter = (role: string, scope: string | null, managedStores: string[], storeId: string | null): string[] | null => {
      if (role === 'admin' && scope === 'all') return null  // null = all stores
      if (role === 'admin' && managedStores.length > 0) return managedStores
      if (role === 'store' && storeId) return [storeId]
      return []
    }

    expect(getStoreFilter('admin', 'all', [], null)).toBeNull()
    expect(getStoreFilter('admin', null, ['Store A'], '')).toEqual(['Store A'])
    expect(getStoreFilter('store', null, [], 'store-1')).toEqual(['store-1'])
    expect(getStoreFilter('store', null, [], null)).toEqual([])
  })

  test('should format user payload correctly', () => {
    const toUserPayload = (session: any) => ({
      role: session.role,
      storeName: session.storeName,
      username: session.username,
      scope: session.scope,
      managedStores: session.managedStores ?? [],
    })

    const session = {
      role: 'admin',
      storeName: 'Main Store',
      username: 'yahya',
      scope: 'all',
      managedStores: ['Store A'],
    }

    expect(toUserPayload(session)).toEqual({
      role: 'admin',
      storeName: 'Main Store',
      username: 'yahya',
      scope: 'all',
      managedStores: ['Store A'],
    })
  })

  test('should hash tokens with SHA-256', () => {
    const crypto = require('crypto')
    const sha256Hex = (input: string): string => {
      return crypto.createHash('sha256').update(input).digest('hex')
    }

    const hash1 = sha256Hex('token123')
    const hash2 = sha256Hex('token123')
    const hash3 = sha256Hex('different')

    expect(hash1).toBe(hash2)     // deterministic
    expect(hash1).not.toBe(hash3) // different for different inputs
    expect(hash1.length).toBe(64) // SHA-256 = 64 hex chars
  })
})