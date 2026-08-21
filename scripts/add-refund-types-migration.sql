-- Migration: Add structured refund type and replacement tracking
-- Date: 2026-08-15
-- Description: Adds refund_type, replacement_item, original_item_returned, and related fields to orders table
--              to support three refund outcomes: quantity (default), fixed amount, and replacement item.
--              This maintains backward compatibility while enabling structured replacement workflows.

-- Step 1: Add refund type and replacement metadata columns
ALTER TABLE public.orders
ADD COLUMN IF NOT EXISTS refund_type text check (refund_type in ('quantity', 'amount', 'replacement') or refund_type is null);

ALTER TABLE public.orders
ADD COLUMN IF NOT EXISTS replacement_item text;

ALTER TABLE public.orders
ADD COLUMN IF NOT EXISTS original_item_returned boolean;

-- Step 2: Add refund amount and reason tracking columns
ALTER TABLE public.orders
ADD COLUMN IF NOT EXISTS refund_amount numeric(12,2);

ALTER TABLE public.orders
ADD COLUMN IF NOT EXISTS refund_reason text;

-- Step 3: Add refund proof tracking
ALTER TABLE public.orders
ADD COLUMN IF NOT EXISTS refund_proof_url text;

-- Step 4: Add refund size/color/variant breakdown columns
ALTER TABLE public.orders
ADD COLUMN IF NOT EXISTS refund_size_quantities jsonb;

ALTER TABLE public.orders
ADD COLUMN IF NOT EXISTS refund_color_quantities jsonb;

ALTER TABLE public.orders
ADD COLUMN IF NOT EXISTS refund_variant_quantities jsonb;

-- Step 5: Add timestamp for refund completion
ALTER TABLE public.orders
ADD COLUMN IF NOT EXISTS refunded_at timestamptz;

-- Add comments for clarity
COMMENT ON COLUMN public.orders.refund_type IS
  'Type of refund: ''quantity'' (default, refund = selling_price × refund_quantity), ''amount'' (fixed £ refund), or ''replacement'' (no cash, replacement item only). NULL means legacy quantity refund.';

COMMENT ON COLUMN public.orders.replacement_item IS
  'Name of replacement item when refund_type = ''replacement''. NULL for quantity or amount refunds.';

COMMENT ON COLUMN public.orders.original_item_returned IS
  'Flag for replacement refunds: true = original item was returned and re-stocked, false = customer kept original. Only relevant when refund_type = ''replacement''.';

COMMENT ON COLUMN public.orders.refund_amount IS
  'Calculated refund amount in £. For ''quantity'' = selling_price × refund_quantity. For ''amount'' = fixed amount. For ''replacement'' = 0 (no cash refund).';

COMMENT ON COLUMN public.orders.refund_reason IS
  'Business reason for refund (e.g., "Customer Dissatisfied") and refund type details (e.g., "Replacement: Joggers").';

COMMENT ON COLUMN public.orders.refund_proof_url IS
  'URL to proof image (e.g., damaged item photo) uploaded during refund processing.';

COMMENT ON COLUMN public.orders.refund_size_quantities IS
  'JSONB object tracking refunded quantities by size. Used when refund is partial by size. NULL if not applicable.';

COMMENT ON COLUMN public.orders.refund_color_quantities IS
  'JSONB object tracking refunded quantities by color. Used when refund is partial by color. NULL if not applicable.';

COMMENT ON COLUMN public.orders.refund_variant_quantities IS
  'Nested JSONB tracking refunded quantities by color and size. Used for variant-based refunds. Nested structure {"color":{"size":qty}}.';

COMMENT ON COLUMN public.orders.refunded_at IS
  'Timestamp when refund was processed. Used to track refund completion time.';

-- Create index for efficient refund lookups
CREATE INDEX IF NOT EXISTS idx_orders_refund_type ON public.orders(refund_type);

-- Verification query (commented out - uncomment to check migration applied)
-- SELECT COUNT(*) as total_orders, 
--        COUNT(refund_type) as with_refund_type,
--        COUNT(replacement_item) as with_replacement,
--        COUNT(original_item_returned) as with_original_returned
-- FROM public.orders;

-- Note: Existing records will have NULL for all new refund fields.
-- This maintains backward compatibility. Legacy quantity refunds are treated as refund_type = NULL (interpreted as 'quantity').
