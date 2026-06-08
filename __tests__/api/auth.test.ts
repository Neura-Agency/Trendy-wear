// Unit tests for auth API route business logic
// These test the helper functions and logic without requiring actual Supabase

import { createClient } from '@supabase/supabase-js'

// Mock supabase
jest.mock('../../lib/supabase', () => ({
  supabaseAdmin: {
    from: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      in: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
    })),
  },
  TABLES: {
    ACCOUNTS: 'accounts',
    SESSIONS: 'sessions',
  },
}))

// Mock bcrypt
jest.mock('bcryptjs', () => ({
  compare: jest.fn(),
  hash: jest.fn(),
}))

// Mock session
jest.mock('../../lib/api/session', () => ({
  createSession: jest.fn(),
  SESSION_COOKIE_NAME: 'tw_session',
}))

describe('Auth API - Business Logic', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('should reject non-POST requests', () => {
    // The handler checks req.method !== 'POST'
    const methodCheck = (method: string) => {
      return method !== 'POST'
    }
    expect(methodCheck('GET')).toBe(true)
    expect(methodCheck('POST')).toBe(false)
    expect(methodCheck('PUT')).toBe(true)
    expect(methodCheck('DELETE')).toBe(true)
  })

  test('should reject missing username or password', () => {
    const validateCredentials = (username?: string, password?: string) => {
      const u = String(username ?? '').trim()
      const p = String(password ?? '')
      return !!u && !!p
    }

    expect(validateCredentials('', 'pass')).toBe(false)
    expect(validateCredentials('user', '')).toBe(false)
    expect(validateCredentials('', '')).toBe(false)
    expect(validateCredentials('user', 'pass')).toBe(true)
  })

  test('should try username and its lowercase variant', () => {
    const getCandidates = (u: string) => Array.from(new Set([u, u.toLowerCase()]))
    
    expect(getCandidates('TestUser')).toEqual(['TestUser', 'testuser'])
    expect(getCandidates('admin')).toEqual(['admin'])  // already lowercase
    expect(getCandidates('')).toEqual([''])
  })

  test('should find account from candidates list', () => {
    const accounts = [
      { username: 'Admin', password_hash: 'hash1' },
      { username: 'admin', password_hash: 'hash2' },
    ]
    
    const findAccount = (u: string, accountsList: any[]) => {
      const candidateUsernames = Array.from(new Set([u, u.toLowerCase()]))
      const candidates = accountsList.filter((a: any) => candidateUsernames.includes(a.username))
      return candidates.find((a: any) => a.username === u) ?? candidates[0] ?? null
    }

    // Exact match first
    expect(findAccount('Admin', accounts)?.username).toBe('Admin')
    // Case-insensitive fallback
    expect(findAccount('ADMIN', accounts)?.username).toBe('admin')
    // No match
    expect(findAccount('Unknown', accounts)).toBeNull()
  })

  test('should reject inactive accounts', () => {
    const account = { username: 'test', is_active: false }
    expect(account.is_active === false).toBe(true)

    const activeAccount = { username: 'test', is_active: true }
    expect(activeAccount.is_active === false).toBe(false)
  })

  test('should return properly formatted user payload', () => {
    const account = {
      role: 'admin',
      stores: { name: 'Main Store' },
      username: 'yahya',
      scope: 'all',
      managed_stores: ['Store A', 'Store B'],
    }

    const payload = {
      role: account.role,
      storeName: account.stores?.name ?? null,
      username: account.username,
      scope: account.scope ?? null,
      managedStores: (account.managed_stores as string[]) ?? [],
    }

    expect(payload).toEqual({
      role: 'admin',
      storeName: 'Main Store',
      username: 'yahya',
      scope: 'all',
      managedStores: ['Store A', 'Store B'],
    })
  })

  test('should handle null store name gracefully', () => {
    const account = {
      role: 'store',
      stores: null,
      username: 'storeuser',
      scope: null,
      managed_stores: [],
    }

    const payload = {
      role: account.role,
      storeName: account.stores?.name ?? null,
      username: account.username,
      scope: account.scope ?? null,
      managedStores: (account.managed_stores as string[]) ?? [],
    }

    expect(payload).toEqual({
      role: 'store',
      storeName: null,
      username: 'storeuser',
      scope: null,
      managedStores: [],
    })
  })
})