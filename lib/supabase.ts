// Supabase client configuration for Trendy Wear
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// Client-side Supabase client (for browser)
export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Server-side Supabase client (for API routes)
export const supabaseAdmin = createClient(
  supabaseUrl,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
)

// Database table names
export const TABLES = {
  APP_USERS: 'app_users',
  APP_USER_MANAGED_STORES: 'app_user_managed_stores',
  STORES: 'stores', 
  INVENTORY: 'inventory',
  PURCHASES: 'purchases',
  ORDERS: 'orders',
  STORE_INVENTORY: 'store_inventory',
  EXPENSES: 'expenses',
  CLIENTS: 'clients',
  SETTINGS: 'settings',
  AUDIT_LOGS: 'audit_logs'
} as const

// Helper function to handle Supabase errors
export function handleSupabaseError(error: any, operation: string) {
  console.error(`Supabase ${operation} error:`, error)
  throw new Error(`Database ${operation} failed: ${error.message}`)
}