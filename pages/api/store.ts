import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin, TABLES } from '../../lib/supabase'
import { requireSession, isSuperAdmin } from '../../lib/api/session'
import bcrypt from 'bcryptjs'

// Helper to generate store initials (e.g., "Trendy Wear Main" -> "TWM")
function getStoreInitials(storeName: string): string {
  return storeName
    .trim()
    .split(/\s+/)
    .map(word => word[0]?.toUpperCase() || '')
    .join('')
    .slice(0, 3) // Max 3 initials
}

// Helper to generate simple password (e.g., "Owner123")
function generatePassword(ownerName: string): string {
  const name = ownerName.trim().split(/\s+/)[0] // First name
  return `${name}123`
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const session = await requireSession(req, res)
    if (!session) return

    if (req.method === 'GET') {
      // Fetch stores with their owner and account info via store_owners relationship
      const { data: stores, error: storesError } = await supabaseAdmin
        .from(TABLES.STORES)
        .select(`
          id,
          name,
          commission,
          store_owners (
            id,
            owner_name,
            contact,
            account,
            associate_owner,
            owners:associate_owner ( id, name )
          )
        `)
        .order('created_at', { ascending: true })

      if (storesError) {
        console.error('Error fetching stores:', storesError)
        return res.status(500).json({ error: 'Failed to fetch stores' })
      }

      // Fetch accounts that are linked to store owners
      const accountIds = stores
        .map((s: any) => s.store_owners?.account)
        .filter(Boolean)

        const { data: accounts, error: accountsError } = await supabaseAdmin
        .from(TABLES.ACCOUNTS)
        .select('id, username, role, scope, managed_stores, is_active')
        .in('id', accountIds.length > 0 ? accountIds : ['00000000-0000-0000-0000-000000000000']) // Dummy UUID if no accounts
        .order('created_at', { ascending: true })

      if (accountsError) {
        console.error('Error fetching accounts:', accountsError)
        return res.status(500).json({ error: 'Failed to fetch accounts' })
      }

      // Build stores map
      const storesMap: Record<string, any> = {}
      stores.forEach((store: any) => {
        storesMap[store.name] = {
          name: store.name,
          commission: Number(store.commission) || 0,
          associateOwnerId: store.store_owners?.associate_owner ?? null,
          associateOwnerName: store.store_owners?.owners?.name ?? null,
        }
      })

      // Build accounts map with store names
      const accountsMap: Record<string, any> = {}
      stores.forEach((store: any) => {
        if (!store.store_owners?.account) return
        
        const account = accounts.find((a: any) => a.id === store.store_owners.account)
        if (!account) return

        accountsMap[account.username] = {
          password: '••••••••',
          role: account.role,
          scope: account.scope,
          storeName: store.name,
          managedStores: account.managed_stores || [],
          isActive: account.is_active ?? true
        }
      })

      // Also include all super-admin accounts under "Trendy Wear Main"
      const { data: adminAccounts } = await supabaseAdmin
        .from(TABLES.ACCOUNTS)
        .select('id, username, role, scope, managed_stores, is_active')
        .eq('role', 'admin')
        .eq('scope', 'all')
        .order('created_at', { ascending: true })

      ;(adminAccounts || []).forEach((admin: any) => {
        if (accountsMap[admin.username]) return // already included via store_owners
        accountsMap[admin.username] = {
          password: '••••••••',
          role: admin.role,
          scope: admin.scope,
          storeName: 'Trendy Wear Main',
          managedStores: admin.managed_stores || [],
          isActive: admin.is_active ?? true
        }
      })

      // Sort: Trendy Wear Main accounts first, then store accounts by store name
      const sortedAccountsMap: Record<string, any> = {}
      const adminEntries = Object.entries(accountsMap).filter(([, v]: [string, any]) => v.storeName === 'Trendy Wear Main')
      const storeEntries = Object.entries(accountsMap).filter(([, v]: [string, any]) => v.storeName !== 'Trendy Wear Main')
      ;[...adminEntries, ...storeEntries].forEach(([k, v]) => { sortedAccountsMap[k] = v })

      return res.json({
        accounts: sortedAccountsMap,
        stores: storesMap,
        settings: { storeCommissionPercent: 10 }
      })
    }

    if (req.method === 'POST') {
      if (!isSuperAdmin(session)) {
        return res.status(403).json({ error: 'Only super admin can create stores' })
      }

      const { name, partnerName, partnerContact, commission } = req.body || {}

      if (!name || !partnerName) {
        return res.status(400).json({ error: 'Store name and partner name are required' })
      }

      // Step 1: Generate account credentials and create account first
      const storeInitials = getStoreInitials(name)
      const username = `${partnerName.trim().replace(/\s+/g, '')}${storeInitials}`.toLowerCase()
      const plainPassword = generatePassword(partnerName)
      const passwordHash = await bcrypt.hash(plainPassword, 10)

      const { data: account, error: accountError } = await supabaseAdmin
        .from(TABLES.ACCOUNTS)
        .insert({
          username: username,
          password_hash: passwordHash,
          role: 'store',
          managed_stores: [],
          is_active: true
        })
        .select('id, username')
        .single()

      if (accountError) {
        console.error('Error creating account:', accountError)
        return res.status(500).json({ error: 'Failed to create account' })
      }

      // Step 2: Create store owner with account link
      const { data: owner, error: ownerError } = await supabaseAdmin
        .from(TABLES.STORE_OWNERS)
        .insert({ 
          owner_name: partnerName.trim(),
          contact: partnerContact?.trim() || null,
          account: account.id
        })
        .select('id')
        .single()

      if (ownerError) {
        console.error('Error creating store owner:', ownerError)
        return res.status(500).json({ error: 'Failed to create store owner' })
      }

      // Step 3: Create store
      const { data: store, error: storeError } = await supabaseAdmin
        .from(TABLES.STORES)
        .insert({
          name: name.trim(),
          owner_id: owner.id,
          commission: Number(commission) || 10
        })
        .select('*')
        .single()

      if (storeError) {
        console.error('Error creating store:', storeError)
        return res.status(500).json({ error: 'Failed to create store' })
      }

      // Step 4: Patch the account with the now-known store_id
      const { error: accountUpdateError } = await supabaseAdmin
        .from(TABLES.ACCOUNTS)
        .update({ store_id: store.id })
        .eq('id', account.id)

      if (accountUpdateError) {
        console.error('Error setting store_id on account:', accountUpdateError)
        // Store was created successfully; log and continue rather than failing the whole request
      }

      return res.status(201).json({ 
        success: true,
        store: {
          id: store.id,
          name: store.name,
          commission: store.commission
        },
        credentials: {
          username: account.username,
          password: plainPassword
        }
      })
    }

    if (req.method === 'DELETE') {
      if (!isSuperAdmin(session)) {
        return res.status(403).json({ error: 'Only super admin can delete a store partner' })
      }

      const { name } = req.body || {}
      if (!name || !String(name).trim()) {
        return res.status(400).json({ error: 'Store name is required' })
      }

      // Look up the store row so we can also clean up its store_owners row if it becomes orphaned
      const { data: store, error: findError } = await supabaseAdmin
        .from(TABLES.STORES)
        .select('id, owner_id')
        .eq('name', String(name).trim())
        .maybeSingle()

      if (findError) {
        console.error('Error looking up store to delete:', findError)
        return res.status(500).json({ error: 'Failed to look up store' })
      }
      if (!store) {
        return res.status(404).json({ error: `Store "${name}" not found` })
      }

      const { error: deleteError } = await supabaseAdmin
        .from(TABLES.STORES)
        .delete()
        .eq('id', store.id)

      if (deleteError) {
        // Postgres FK "restrict" violation — this store still has orders on record
        if (deleteError.code === '23503') {
          return res.status(409).json({ error: `Cannot delete "${name}" — it still has orders on record. Remove or reassign those orders first.` })
        }
        console.error('Error deleting store:', deleteError)
        return res.status(500).json({ error: 'Failed to delete store' })
      }

      // Best-effort cleanup: if this store's owner row isn't linked to any other store, remove it too.
      // We never touch the accounts table here, so no login credentials are ever silently deleted.
      if (store.owner_id) {
        try {
          const { data: stillLinked } = await supabaseAdmin
            .from(TABLES.STORES)
            .select('id')
            .eq('owner_id', store.owner_id)
            .limit(1)

          if (!stillLinked || stillLinked.length === 0) {
            await supabaseAdmin
              .from(TABLES.STORE_OWNERS)
              .delete()
              .eq('id', store.owner_id)
          }
        } catch (cleanupErr) {
          console.warn('Non-fatal: failed to clean up orphaned store_owners row:', cleanupErr)
        }
      }

      return res.json({ success: true })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (e: any) {
    console.error('Store API error:', e)
    return res.status(500).json({ error: e?.message || 'Internal server error' })
  }
}

