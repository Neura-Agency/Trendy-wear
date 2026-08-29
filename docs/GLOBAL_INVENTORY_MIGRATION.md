# Global Shared Inventory Migration

This document records the approved implementation specification for removing store-owned/allotted inventory. It is intentionally retained as an implementation and operational reference while the migration is staged.

## Core invariant
A store is a sales/reporting entity, not an inventory-ownership entity.

Physical inventory is global. Purchases and legitimate stock movements increase it; sales decrease it; physical returns and other legitimate additions increase it; adjustments are explicit.

## Safety rules
- Never modify `main`; all work belongs on `remove-store-allotment-global-inventory`.
- Do not modify the invoice-image/OCR/vendor-invoice extraction pipeline.
- Prefer surgical changes over wholesale rewrites of large UI files.
- Never fabricate historical batch relationships.
- Migrate, verify, monitor, then retire legacy allocation code/schema.
- Backend/database transactions are authoritative.

## Target behavior
- All stores sell from global inventory.
- `orders.store_id` identifies who made the sale; it does not imply inventory ownership.
- Commission is snapshotted on the order.
- COGS is based on actual consumed inventory batches.
- Physical returns and replacements use global inventory.
- Financial-only refunds do not change stock.
- No supported path may create a new inventory allotment.

## Migration sequence
1. Repository audit and dependency map.
2. Extract allotment modal and store-inventory UI without behavior changes.
3. Establish real API/Supabase integration coverage and capture the current sales/returns/refunds/replacements/permissions/payout baseline.
4. Confirm the commission rule before changing the commission engine.
5. Backfill reliable historical `orders.inventory_id` and batch allocations only where determinable.
6. Version the inventory engine and fail loudly on application/RPC version drift.
7. Generalize the existing direct FIFO inventory path into a reusable engine.
8. Implement atomic `sell_from_inventory()` with deterministic locking, validation, idempotency, server-resolved store authorization, order creation, allocation creation and required financial records in one transaction.
9. Migrate sales, returns, refunds and replacements to global inventory.
10. Migrate dashboards, inventory UI, reports, COGS, payouts and WhatsApp semantics.
11. Reconcile remaining legacy store allocations with a dry-run first, then restore each remaining quantity exactly once at batch level.
12. Controlled cutover: stop stock-changing operations, baseline, dry-run/reconcile, disable allotment creation, enable global sales, run controlled checks, verify reports/payouts.
13. Monitor through at least one complete production payout cycle.
14. Only after the payout-cycle gate passes, retire obsolete application code and then evaluate legacy schema retirement.
15. Perform a final repository and user-facing terminology audit.
16. Update `PROJECT_HANDOVER.md` and in-app contextual help in both English and Roman Urdu. Verify rendered help, not only source strings.

## Required inventory transaction properties
`sell_from_inventory()` must use PostgreSQL transactional semantics with server-side validation, deterministic locking, named exceptions, explicit error handling, documented deployment and version checking.

For a single-batch sale, use an atomic conditional decrement equivalent to:

```sql
UPDATE inventory
SET quantity_available = quantity_available - requested_quantity
WHERE id = batch_id
  AND quantity_available >= requested_quantity
RETURNING quantity_available;
```

For multi-batch FIFO, lock selected rows using `FOR UPDATE` in deterministic order. Inventory must never become negative.

Duplicate requests must resolve to one logical order, one deduction and one financial transaction set, including concurrent retries.

Store authorization must derive the store from the authenticated session/server context rather than trusting an arbitrary client-supplied store ID.

## Allocation traceability
Use `order_inventory_allocations` to record each inventory batch consumed by an order. This is the source for COGS analysis, return/replacement traceability and auditability.

## Reconciliation
Dry-run reporting must include allocated quantity, remaining quantity, inventory batch, unmatched records, negative quantities, invalid references and discrepancies. No dry-run mutation is allowed.

For each remaining `store_inventory.quantity_remaining`, restore it to its corresponding global inventory batch exactly once. Never use a blanket global adjustment and never double count.

## Required tests
- Direct and store sales, one/multi-batch FIFO, insufficient stock, `extraQty`, commission, pricing, discounts, customer/store/payment/status/notes and existing financial records.
- Full/partial returns, invalid quantities and batch behavior.
- Refund-only versus refund + physical return.
- Replacement and insufficient replacement stock.
- Store authorization/impersonation protection.
- Failure injection at deduction, order, order-item, allocation and financial-record stages; expected result is full rollback with no orphan order or unexplained stock movement.
- Real API concurrency: 1 unit vs two stores; 10 units vs two 7-unit purchases.
- Concurrent duplicate request: one logical order and one deduction.
- Version drift: request rejected, stock/order unchanged and clear operational error.
- Full UAT: 100 starting units, Store A sells 20, Store B sells 30, Store A returns 5, replacement, both stores see 55, final-unit concurrency and retry verification.

## UI/help terminology audit
Search executable code, documentation, configuration, seed/content files and help catalogs for `allot`, `allotment`, `allocated`, `allocation`, `store inventory`, `store stock`, `partner inventory`, `shop inventory`, `pending_return`, `quantity_remaining`, and related concepts.

`lib/help/content.ts` must be audited in both `en` and `roman-ur`. Remove old instructions such as “allot stock”, “Allot to Store”, “allotted quantity”, “shop's inventory” and “Allot more stock”; replace them with guidance consistent with global inventory. Then manually verify the rendered contextual-help locations in both languages.

## Payout-cycle gate
Do not retire legacy allocation code until one complete production payout cycle has closed successfully and Sales, Commission, COGS, Returns, Refunds, Replacements, Profit, Payouts, `included_in_payout`, owner profit split and Global Inventory have all been verified.

## Rollback
Before cutover, disable the new engine and restore the previous application behavior. After cutover but before legacy deletion, retain enough legacy information to diagnose/reverse the migration. Before irreversible schema deletion, create and verify a database backup/export; schema deletion is not a simple feature toggle rollback.
