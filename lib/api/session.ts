import type { NextApiRequest, NextApiResponse } from 'next'
import crypto from 'crypto'
import { supabaseAdmin, TABLES } from '../supabase'
import { parseCookies, serializeCookie } from './cookies'

export const SESSION_COOKIE_NAME = 'tw_session'

const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30 // 30 days

export type Role = 'admin' | 'store'

export interface SessionContext {
  accountId: string
  username: string
  role: Role
  scope: 'all' | null
  storeId: string | null
  storeName: string | null
  managedStores: string[]
}

export function isAdmin(session: SessionContext): boolean {
  return session.role === 'admin'
}

export function isSuperAdmin(session: SessionContext): boolean {
  return session.role === 'admin' && session.scope === 'all'
}

function sha256Hex(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex')
}

function nowIso(): string {
  return new Date().toISOString()
}

function getClientIp(req: NextApiRequest): string | null {
  const fwd = req.headers['x-forwarded-for']
  if (typeof fwd === 'string' && fwd.trim()) return fwd.split(',')[0].trim()
  return null
}

export function clearSessionCookie(res: NextApiResponse) {
  const secure = process.env.NODE_ENV === 'production'
  res.setHeader(
    'Set-Cookie',
    serializeCookie(SESSION_COOKIE_NAME, '', {
      httpOnly: true,
      secure,
      sameSite: 'Lax',
      path: '/',
      maxAge: 0,
      expires: new Date(0)
    })
  )
}

export async function createSession(res: NextApiResponse, req: NextApiRequest, accountId: string) {
  const token = crypto.randomBytes(32).toString('base64url')
  const tokenHash = sha256Hex(token)
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000)

  const { error } = await supabaseAdmin.from(TABLES.SESSIONS).insert({
    account_id: accountId,
    token_hash: tokenHash,
    expires_at: expiresAt.toISOString(),
    user_agent: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : null,
    ip: getClientIp(req)
  })

  if (error) throw error

  const secure = process.env.NODE_ENV === 'production'
  res.setHeader(
    'Set-Cookie',
    serializeCookie(SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      secure,
      sameSite: 'Lax',
      path: '/',
      maxAge: SESSION_MAX_AGE_SECONDS
    })
  )
}

export function getSessionToken(req: NextApiRequest): string | null {
  const cookies = parseCookies(req.headers.cookie)
  const token = cookies[SESSION_COOKIE_NAME]
  return token && token.trim() ? token : null
}

export async function revokeSessionByToken(req: NextApiRequest) {
  const token = getSessionToken(req)
  if (!token) return
  const tokenHash = sha256Hex(token)
  await supabaseAdmin
    .from(TABLES.SESSIONS)
    .update({ revoked_at: nowIso() })
    .eq('token_hash', tokenHash)
}

export async function getSessionContext(req: NextApiRequest): Promise<SessionContext | null> {
  const token = getSessionToken(req)
  if (!token) return null
  const tokenHash = sha256Hex(token)

  const { data: sessionRow, error: sessErr } = await supabaseAdmin
    .from(TABLES.SESSIONS)
    .select('id, account_id, expires_at, revoked_at')
    .eq('token_hash', tokenHash)
    .maybeSingle()

  if (sessErr) throw sessErr
  if (!sessionRow) return null
  if (sessionRow.revoked_at) return null
  if (new Date(sessionRow.expires_at).getTime() <= Date.now()) return null

  const { data: account, error: accErr } = await supabaseAdmin
    .from(TABLES.ACCOUNTS)
    .select('id, username, role, scope, store_id, managed_stores, is_active, stores(name)')
    .eq('id', sessionRow.account_id)
    .maybeSingle()

  if (accErr) throw accErr
  if (!account || account.is_active === false) return null

  return {
    accountId: account.id,
    username: account.username,
    role: account.role as Role,
    scope: (account.scope as 'all' | null) ?? null,
    storeId: account.store_id ?? null,
    storeName: (account as any).stores?.name ?? null,
    managedStores: (account.managed_stores as string[]) ?? []
  }
}

export async function requireSession(req: NextApiRequest, res: NextApiResponse): Promise<SessionContext | null> {
  try {
    const session = await getSessionContext(req)
    if (!session) {
      res.status(401).json({ error: 'Unauthorized' })
      return null
    }
    return session
  } catch (e: any) {
    console.error('session error:', e)
    res.status(500).json({ error: e?.message || 'Internal server error' })
    return null
  }
}

export async function requireAdmin(req: NextApiRequest, res: NextApiResponse): Promise<SessionContext | null> {
  const session = await requireSession(req, res)
  if (!session) return null
  if (!isAdmin(session)) {
    res.status(403).json({ error: 'Forbidden' })
    return null
  }
  return session
}

export async function getAllowedStoreIds(session: SessionContext): Promise<string[] | null> {
  if (session.role === 'store') return session.storeId ? [session.storeId] : []
  if (session.role === 'admin' && session.scope === 'all') return null
  if (session.role === 'admin' && session.managedStores && session.managedStores.length > 0) {
    const { data, error } = await supabaseAdmin
      .from(TABLES.STORES)
      .select('id')
      .in('name', session.managedStores)
    if (error) throw error
    return (data ?? []).map((r: any) => r.id)
  }
  return null
}

export function toUserPayload(session: SessionContext) {
  return {
    role: session.role,
    storeName: session.storeName,
    username: session.username,
    scope: session.scope,
    managedStores: session.managedStores ?? []
  }
}
