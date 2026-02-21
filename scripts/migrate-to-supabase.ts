// Data migration script from data.json to Supabase
// Run this once to migrate your existing data

import fs from 'fs'
import { supabaseAdmin, TABLES } from '../lib/supabase'

// Read current data.json
const currentData = JSON.parse(fs.readFileSync('./data.json', 'utf8'))

async function migrateData() {
  console.log('🚀 Starting data migration to Supabase...')

  try {
    // 1. Migrate Settings
    console.log('📝 Migrating settings...')
    const settingsData = [
      {
        key: 'defaultCommission',
        value: currentData.settings.defaultCommission
      },
      {
        key: 'lowStockThreshold',
        value: currentData.settings.lowStockThreshold
      }
    ]
    
    const { error: settingsError } = await supabaseAdmin
      .from(TABLES.SETTINGS)
      .upsert(settingsData, { onConflict: 'key' })
    
    if (settingsError) throw settingsError

    // 2. Migrate Stores
    console.log('🏪 Migrating stores...')
    const storesData = Object.entries(currentData.stores).map(([name, store]: [string, any]) => ({
      name,
      commission: store.commission,
      paid_amount: store.paidAmount || 0,
      paid: store.paid || false,
      created_at: store.createdAt || new Date().toISOString(),
      paid_at: store.paidAt || null
    }))

    const { data: insertedStores, error: storesError } = await supabaseAdmin
      .from(TABLES.STORES)
      .upsert(storesData, { onConflict: 'name' })
      .select()

    if (storesError) throw storesError

    // 3. Migrate Clients
    console.log('👥 Migrating clients...')
    if (currentData.clients && currentData.clients.length > 0) {
      const clientsData = currentData.clients.map((client: any) => ({
        name: client.name,
        phone: client.phone,
        payments_received: client.paymentsReceived || 0
      }))

      const { error: clientsError } = await supabaseAdmin
        .from(TABLES.CLIENTS)
        .insert(clientsData)

      if (clientsError) throw clientsError
    }

    // 4. Migrate Inventory
    console.log('📦 Migrating inventory...')
    const inventoryData = currentData.inventory.map((item: any) => ({
      product_name: item.productName,
      category: item.category,
      brand: item.brand,
      size_options: Array.isArray(item.size) ? item.size : [item.size],
      color_options: Array.isArray(item.color) ? item.color : [item.color],
      other_variants: item.otherVariants || {},
      batch_number: item.batchNumber,
      cost_price: item.costPrice,
      selling_price: item.sellingPrice,
      quantity_available: item.quantityAvailable,
      low_stock_warning: item.lowStockWarning || 5
    }))

    const { data: insertedInventory, error: inventoryError } = await supabaseAdmin
      .from(TABLES.INVENTORY)
      .upsert(inventoryData, { onConflict: 'batch_number' })
      .select()

    if (inventoryError) throw inventoryError

    // 5. Migrate Purchases
    console.log('💰 Migrating purchases...')
    const purchasesData = currentData.purchases.map((purchase: any, index: number) => {
      // Find corresponding inventory item
      const inventoryItem = insertedInventory?.find(
        (item: any) => item.batch_number === purchase.batchNumber
      )
      
      return {
        inventory_id: inventoryItem?.id || null,
        product_name: purchase.productName,
        category: purchase.category,
        brand: purchase.brand,
        size_options: Array.isArray(purchase.size) ? purchase.size : [purchase.size],
        color_options: Array.isArray(purchase.color) ? purchase.color : [purchase.color],
        other_variants: purchase.otherVariants || {},
        batch_number: purchase.batchNumber,
        cost_price: purchase.costPrice,
        selling_price: purchase.sellingPrice,
        quantity: purchase.quantity,
        low_stock_warning: purchase.lowStockWarning || 5,
        purchased_at: purchase.date || new Date().toISOString()
      }
    })

    const { error: purchasesError } = await supabaseAdmin
      .from(TABLES.PURCHASES)
      .insert(purchasesData)

    if (purchasesError) throw purchasesError

    // 6. Migrate Orders
    console.log('📋 Migrating orders...')
    const ordersData = currentData.orders
      .map((order: any) => {
      // Find corresponding store and inventory
      const store = insertedStores?.find((s: any) => s.name === order.storeName)
      const inventoryItem = insertedInventory?.find((item: any) => 
        item.product_name === order.productName
      )

      if (!store?.id) {
        console.warn(`⚠️  Skipping order ${order.id}: store not found (${order.storeName})`)
        return null
      }
      
      return {
        order_code: order.id,
        store_id: store?.id,
        product_name: order.productName,
        quantity: order.quantity,
        selling_price: order.sellingPrice,
        shipment_cost: order.shipmentCost || 0,
        client_name: order.clientName,
        order_type: order.type,
        occurred_at: order.date,
        included_in_payout: order.includedInPayout || false,
        commission_percent: order.commissionPercent,
        cost_price: order.costPrice,
        commission_amount: order.commissionAmount,
        admin_take: order.adminTake,
        profit: order.profit,
        inventory_id: inventoryItem?.id || null
      }
    })
      .filter(Boolean)

    const { error: ordersError } = await supabaseAdmin
      .from(TABLES.ORDERS)
      .insert(ordersData)

    if (ordersError) throw ordersError

    // 7. Migrate Store Inventory
    console.log('🏪📦 Migrating store inventory...')
    const storeInventoryData = []
    
    for (const [storeName, products] of Object.entries(currentData.storeInventory)) {
      const store = insertedStores?.find((s: any) => s.name === storeName)
      
      for (const [productName, item] of Object.entries(products as Record<string, any>)) {
        const storeItem = item as {
          ownerSupplyPrice: number;
          commissionPercent: number;
          storeSellingPrice: number;
          quantityAssigned: number;
          quantityRemaining: number;
          owner?: string;
        };
        const inventoryItem = insertedInventory?.find((inv: any) => 
          inv.product_name === productName
        )
        
        if (!store?.id) {
          console.warn(`⚠️  Skipping store inventory for ${storeName}: store not found`)
          continue
        }

        storeInventoryData.push({
          store_id: store.id,
          product_name: productName,
          owner_supply_price: storeItem.ownerSupplyPrice,
          commission_percent: storeItem.commissionPercent,
          store_selling_price: storeItem.storeSellingPrice,
          quantity_assigned: storeItem.quantityAssigned,
          quantity_remaining: storeItem.quantityRemaining,
          inventory_id: inventoryItem?.id || null
        })
      }
    }

    if (storeInventoryData.length > 0) {
      const { error: storeInventoryError } = await supabaseAdmin
        .from(TABLES.STORE_INVENTORY)
        .insert(storeInventoryData)

      if (storeInventoryError) throw storeInventoryError
    }

    // 8. Migrate Expenses
    console.log('💸 Migrating expenses...')
    if (currentData.expenses && currentData.expenses.length > 0) {
      const expensesData = currentData.expenses.map((expense: any) => ({
        expense_code: expense.id,
        title: expense.title,
        amount: expense.amount,
        occurred_at: expense.date,
        category: expense.category || null,
      }))

      const { error: expensesError } = await supabaseAdmin
        .from(TABLES.EXPENSES)
        .insert(expensesData)

      if (expensesError) throw expensesError
    }

    console.log('✅ Data migration completed successfully!')
    console.log('📝 Remember to:')
    console.log('   1. Update your API endpoints to use Supabase')
    console.log('   2. Test authentication with the new system')
    console.log('   3. Backup your data.json file')
    console.log('   4. Update environment variables in Vercel')

  } catch (error) {
    console.error('❌ Migration failed:', error)
    process.exit(1)
  }
}

// Run migration if this file is executed directly
if (require.main === module) {
  migrateData()
}

export default migrateData