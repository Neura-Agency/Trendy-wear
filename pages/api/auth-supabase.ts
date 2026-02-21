// Updated auth API route to use Supabase
import type { NextApiRequest, NextApiResponse } from 'next'
import bcrypt from 'bcryptjs'
import { supabaseAdmin, TABLES } from '../../lib/supabase'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const { username, password } = req.body

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' })
    }

    // Get account from Supabase
    const { data: account, error } = await supabaseAdmin
      .from(TABLES.ACCOUNTS)
      .select('*')
      .eq('username', username)
      .eq('is_active', true)
      .single()

    if (error || !account) {
      return res.status(401).json({ error: 'Invalid credentials' })
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, account.password_hash)
    
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid credentials' })
    }

    // Return user object (excluding password)
    const user = {
      username: account.username,
      role: account.role,
      storeName: account.store_name,
      scope: account.scope,
      managedStores: account.managed_stores || []
    }

    res.json(user)

  } catch (error) {
    console.error('Auth error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
}