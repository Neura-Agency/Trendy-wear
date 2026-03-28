-- Migration: Add size-based quantity tracking
-- Date: 2026-03-28
-- Description: Adds JSONB columns for size-specific quantity tracking across inventory, store_inventory, and orders tables

-- Step 1: Add size_quantities column to inventory table
ALTER TABLE public.inventory 
ADD COLUMN IF NOT EXISTS size_quantities jsonb;

COMMENT ON COLUMN public.inventory.size_quantities IS 'JSONB object storing quantities per size, e.g., {"S": 10, "M": 15, "L": 20}. NULL for legacy records.';

-- Step 2: Add size quantity columns to store_inventory table
ALTER TABLE public.store_inventory 
ADD COLUMN IF NOT EXISTS size_quantities_assigned jsonb;

ALTER TABLE public.store_inventory 
ADD COLUMN IF NOT EXISTS size_quantities_remaining jsonb;

COMMENT ON COLUMN public.store_inventory.size_quantities_assigned IS 'JSONB object storing initially assigned quantities per size. NULL for legacy records.';
COMMENT ON COLUMN public.store_inventory.size_quantities_remaining IS 'JSONB object storing remaining quantities per size. NULL for legacy records.';

-- Step 3: Add size column to orders table
ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS size text;

COMMENT ON COLUMN public.orders.size IS 'Size of the item sold (e.g., "S", "M", "L", "XL"). NULL for legacy orders without size tracking.';

-- Step 4: Create index on orders.size for efficient filtering
CREATE INDEX IF NOT EXISTS idx_orders_size ON public.orders(size);

-- Verification queries (commented out - uncomment to run checks)
-- SELECT COUNT(*) as total_inventory, COUNT(size_quantities) as with_sizes FROM public.inventory;
-- SELECT COUNT(*) as total_store_inventory, COUNT(size_quantities_assigned) as with_sizes FROM public.store_inventory;
-- SELECT COUNT(*) as total_orders, COUNT(size) as with_sizes FROM public.orders;

-- Note: Existing records will have NULL for size-related fields
-- This maintains backward compatibility while enabling new size-tracking features
