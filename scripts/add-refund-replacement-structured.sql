-- Migration: Structured replacement identity for refund_type = 'replacement'
-- Requires add-refund-types-migration.sql to have been applied first (refund_type, replacement_item,
-- original_item_returned, refund_quantity, refund_*_quantities already exist).
--
-- The replacement identifies the actual PRODUCT/variant so the FIFO store_inventory deduction
-- mechanism can locate real stock. Do NOT store the replacement as free text only.
-- Store the product identity here; consumed store_inventory row(s) are a consequence of the
-- FIFO transaction, not a manually-selected batch.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS replacement_product_id uuid references public.products(id) on delete set null;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS replacement_quantity int;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS replacement_size text;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS replacement_color text;

COMMENT ON COLUMN public.orders.replacement_product_id IS
  'Actual product id sent to the customer when refund_type = ''replacement''. Real product/variant identity, not free text.';

COMMENT ON COLUMN public.orders.replacement_quantity IS
  'Quantity of the replacement product issued when refund_type = ''replacement''. Independent of the refunded original quantity.';

COMMENT ON COLUMN public.orders.replacement_size IS
  'Size of the replacement item when the replacement product uses size tracking.';

COMMENT ON COLUMN public.orders.replacement_color IS
  'Color of the replacement item when the replacement product uses color tracking.';