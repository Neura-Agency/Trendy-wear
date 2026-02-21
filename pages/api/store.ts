import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin, TABLES } from '../../lib/supabase'
import { serverEvents } from '../../lib/serverEvents'
import {
  getSettings,
  getStoreByName,
  storeRowsToRecord,
  storeRowToAppStore
} from '../../lib/api/supabaseHelpers'
import { isAdmin, isSuperAdmin, requireSession } from '../../lib/api/session'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const session = await requireSession(req, res)
    if (!session) return

    if (req.method === 'GET') {
      const settings = await getSettings()
      let q = supabaseAdmin
        .from(TABLES.STORES)
        .select('id,name,commission,paid_amount,paid,created_at,paid_at')
        .order('created_at', { ascending: true })

      if (session.role === 'store') {
        if (session.storeId) q = q.eq('id', session.storeId)
        else if (session.storeName) q = q.eq('name', session.storeName)
        else return res.status(403).json({ error: 'Forbidden' })
      } else if (session.role === 'admin' && session.scope !== 'all' && session.managedStores?.length) {
        q = q.in('name', session.managedStores)
      }

      const { data: stores, error } = await q

      if (error) throw error

      return res.json({
        stores: storeRowsToRecord((stores ?? []) as any),
        settings,
        accounts: {}
      })
    }

    if (req.method === 'POST') {
      if (!isAdmin(session)) return res.status(403).json({ error: 'Forbidden' })

      const { action, storeName, commission } = req.body || {}
      if (!storeName) return res.status(400).json({ error: 'storeName is required' })

      if (session.scope !== 'all' && session.managedStores?.length) {
        if (!session.managedStores.includes(String(storeName))) {
          return res.status(403).json({ error: 'Forbidden' })
        }
        if (action === 'createStore' || action === 'create') {
          return res.status(403).json({ error: 'Forbidden' })
        }
      }

      const settings = await getSettings()
      const comm = commission !== undefined && commission !== null ? Number(commission) : settings.defaultCommission

      // Create store partner (UI currently sends action: 'create')
      if (action === 'createStore' || action === 'create') {
        if (!isSuperAdmin(session)) return res.status(403).json({ error: 'Forbidden' })
        const existing = await getStoreByName(storeName)
        if (existing) return res.status(400).json({ error: 'Store already exists' })

        const { data: created, error } = await supabaseAdmin
          .from(TABLES.STORES)
          .insert({ name: storeName, commission: comm })
          .select('id,name,commission,paid_amount,paid,created_at,paid_at')
          .single()

        if (error) throw error
        serverEvents.emit('change', { ts: Date.now(), type: 'stores' })
        return res.status(201).json({ storeName, commission: Number(created.commission) || 0 })
      }

      // Default: update commission (create if missing)
      const existing = await getStoreByName(storeName)
      if (!existing) {
        if (!isSuperAdmin(session)) return res.status(403).json({ error: 'Forbidden' })
        const { data: created, error } = await supabaseAdmin
          .from(TABLES.STORES)
          .insert({ name: storeName, commission: comm })
          .select('id,name,commission,paid_amount,paid,created_at,paid_at')
          .single()

        if (error) throw error
        serverEvents.emit('change', { ts: Date.now(), type: 'stores' })
        return res.json(storeRowToAppStore(created as any))
      }

      const { data: updated, error } = await supabaseAdmin
        .from(TABLES.STORES)
        .update({ commission: comm })
        .eq('id', existing.id)
        .select('id,name,commission,paid_amount,paid,created_at,paid_at')
        .single()

      if (error) throw error
      serverEvents.emit('change', { ts: Date.now(), type: 'stores' })
      return res.json(storeRowToAppStore(updated as any))
    }

    if (req.method === 'PATCH') {
      if (!isAdmin(session)) return res.status(403).json({ error: 'Forbidden' })

      const { storeName, amount } = req.body || {}
      if (!storeName) return res.status(400).json({ error: 'storeName is required' })

      if (session.scope !== 'all' && session.managedStores?.length && !session.managedStores.includes(String(storeName))) {
        return res.status(403).json({ error: 'Forbidden' })
      }

      const existing = await getStoreByName(storeName)
      if (!existing) return res.status(404).json({ error: 'Store not found' })

      const paidAmount = Number(amount) || 0
      const now = new Date().toISOString()

      const { data: updated, error: updErr } = await supabaseAdmin
        .from(TABLES.STORES)
        .update({ paid: true, paid_amount: paidAmount, paid_at: now })
        .eq('id', existing.id)
        .select('id,name,commission,paid_amount,paid,created_at,paid_at')
        .single()

      if (updErr) throw updErr

      // Archive included orders for this store
      const { error: ordErr } = await supabaseAdmin
        .from(TABLES.ORDERS)
        .update({ included_in_payout: false })
        .eq('store_id', existing.id)
        .eq('included_in_payout', true)

      if (ordErr) throw ordErr

      serverEvents.emit('change', { ts: Date.now(), type: 'payout' })
      return res.json(storeRowToAppStore(updated as any))
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (e: any) {
    console.error('store api error:', e)
    return res.status(500).json({ error: e?.message || 'Internal server error' })
  }
}

