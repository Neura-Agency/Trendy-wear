# Trendy Wear ERP - Project Handover Document

**Project Name:** Trendy Wear - Multi-Store Fashion ERP System  
**Version:** 1.0  
**Handover Date:** April 6, 2026  
**Developed By:** Neura Agency

---

## 📋 Table of Contents

1. [System Overview](#system-overview)
2. [Login Credentials](#login-credentials)
3. [Feature Guide](#feature-guide)
4. [Important Notes](#important-notes)
5. [Support & Troubleshooting](#support--troubleshooting)

---

## 🎯 System Overview

Trendy Wear ERP is a comprehensive multi-store management system designed for fashion retail businesses. The platform manages one shared global inventory, sales tracking by store, profit distribution, and financial reporting across multiple retail locations.

**Technology Stack:**
- Frontend: Next.js, React, TypeScript
- Backend: Next.js API Routes
- Database: Supabase (PostgreSQL)
- Hosting: Vercel

---

## 🔐 Login Credentials

### Super Admin Account

**Username:** `yahya`  
**Password:** `Yahya123`  
**Role:** Super Admin  
**Access Level:** Full system access - can manage all stores, partners, inventory, and settings

---

### Admin Accounts

#### 1. Bilal (Admin Manager)
**Username:** `bilal`  
**Password:** `bilal123`  
**Role:** Admin  
**Access Level:** Manages specific stores (Trendy Wear, GenZ Wear)

---

### Store Partner Accounts

#### 1. GenZ Wear
**Username:** `bilaltw`  
**Password:** `Bilal123`  
**Role:** Store  
**Store Name:** GenZ Wear

#### 2. BNB Vintage
**Username:** `talhabv`  
**Password:** `Talha123`  
**Role:** Store  
**Store Name:** BNB Vintage

#### 3. Preloved Wear
**Username:** `anaspw`  
**Password:** `Anas123`  
**Role:** Store  
**Store Name:** Preloved Wear

#### 4. Thrift Wear
**Username:** `pateltw`  
**Password:** `Patel123`  
**Role:** Store  
**Store Name:** Thrift Wear

---

## 📱 Feature Guide

### 1. Main Dashboard

![Main Dashboard](./docs/handover-images/01-main-dashboard.png)

**Purpose:** Overview of business performance and key metrics

**Features:**
- **Revenue Tracking:** Real-time gross sales tracking
- **Expense Monitoring:** Total expenses including COGS, shipping, and commissions
- **Profit Display:** Net profit calculations after all deductions
- **Stock Overview:** Current warehouse inventory count
- **Store Count:** Number of active partner stores
- **Product Performance Chart:** Visual analytics of top-selling products over time
- **Store Performance Chart:** Comparative revenue and profit analysis by store
- **Quick Filters:** Filter data by week, month, or custom date range
- **Generate Report:** Export comprehensive business reports (PDF)

**Who Can Access:** Super Admin, Admins

**How to Use:**
1. Login with admin credentials
2. View real-time metrics in the stat cards at the top
3. Use the "FILTER" dropdown to select time period (By Week, By Month, etc.)
4. Select specific date ranges using the date picker
5. Review performance charts for detailed insights
6. Click "Generate Report" to export PDF reports

---

### 2. Stock & Inventory Management

![Stock & Inventory](./docs/handover-images/02-stock-inventory.png)

**Purpose:** Manage the shared global inventory used by every store

**Features:**

#### Warehouse Inventory Section:
- **Add Inventory:** Purchase and add new products to warehouse
- **Track Quantities:** Monitor available stock levels
- **Cost Tracking:** Record cost price per piece
- **Batch Status:** See how much physical inventory is currently available
- **Stock Alerts:** Low stock warnings

#### Shared Global Inventory:
- **Global Stock:** All stores use the same physical inventory pool
- **Batch Tracking:** Inventory remains traceable to its purchase batch
- **Commission Percentage:** Store commission is recorded on sales
- **Store Sales:** Track quantities and performance through orders, not inventory ownership

**Who Can Access:** Super Admin, Admins

**How to Use:**

**Adding New Inventory:**
1. Click "+ Add Inventory" button
2. Select or create product from catalog
3. Enter purchase details (quantity, cost price, selling price)
4. Set low stock warning threshold
5. Save to warehouse

**Store sales:**
1. Open the sales flow
2. Select the product from global inventory
3. Enter quantity, selling price and customer details
4. Select the store when recording on behalf of a store, or use the authenticated store account
5. Save the sale — global stock is deducted atomically

---

### 3. Shop Credentials Management

![Shop Credentials](./docs/handover-images/03-shop-credentials.png)

**Purpose:** Manage login access and permissions for all store partners

**Features:**
- **View All Accounts:** See complete list of store and admin accounts
- **Account Details:** Username, password, role, and status for each account
- **Edit Credentials:** Update passwords, change roles, activate/deactivate accounts
- **Role Management:** Switch between 'admin' and 'store' roles
- **Status Control:** Activate or deactivate user access

**Who Can Access:** Super Admin only

**How to Use:**

**Viewing Credentials:**
- Navigate to "Shop Credentials" from sidebar
- View table with all store accounts
- Passwords are visible for easy sharing with partners

**Editing an Account:**
1. Click "Edit" button next to any account
2. Modal will open with current account details
3. Update any of the following:
   - **Password:** Enter new password (leave blank to keep current)
   - **Role:** Change between Admin or Store
   - **Status:** Set to Active or Inactive
4. Click "Save Changes"

**Creating New Store Partner:**
1. First create the store from Main Dashboard
2. System automatically generates credentials
3. Share credentials with store partner
4. Manage from this page if changes needed

---

### 4. Direct Warehouse Sales

![Direct Sales](./docs/handover-images/04-direct-sales.png)

**Purpose:** Record sales made directly from warehouse (not through partner stores)

**Features:**
- **Total Received:** Gross sales amount from direct customers
- **Expenses Tracking:** Shipment costs for direct sales
- **Net Profit Calculation:** Profit after deducting expenses
- **Units Sold:** Count of items sold directly
- **Sales History:** Complete record of all direct warehouse sales
- **Customer Tracking:** Record customer names and details
- **Filter by Period:** View sales for specific date ranges

**Who Can Access:** Super Admin, Admins

**How to Use:**

**Recording a Direct Sale:**
1. Click "+ Record Sale" button
2. Fill in sale details:
   - Select product from inventory
   - Enter customer name
   - Set quantity
   - Enter sale price
   - Add shipment cost if applicable
3. System automatically calculates profit
4. Save transaction

**Viewing Sales History:**
- Use "All" dropdown to filter by store or view all
- Check sales table for complete transaction history
- View totals at bottom: Items, Gross, Profit

---

### 5. Profit Partners Management

![Profit Partners](./docs/handover-images/05-profit-partners.png)

**Purpose:** Manage business ownership, profit sharing, and financial distributions

**Features:**

#### Overview Cards:
- **Total Net Profit:** All-time profit from orders
- **Total Paid Out:** Amount distributed to partners (0 payouts recorded)
- **Personal Advances:** Owner expenses to reimburse
- **Over-Paid Tracking:** Monitor overpayment situations
- **Active Partners:** Number of profit-sharing owners (3: Bilal, Yahya, Hammad)

#### Profit Split Overview:
- **Equal Distribution:** 33.33% to 33.34% split between three partners
- **Earned Share:** Profit allocated to each owner
- **Paid Out:** Distributions made to date
- **Personal Advances:** Money owed to owners
- **Fully Settled:** Final balance after all adjustments

#### Individual Partner Cards:
- **Bilal:** 33.34% share
  - Stores: Trendy Wear, GenZ Wear
- **Hammad:** 33.33% share
  - Stores: Trendy Wear Main, BNB Vintage
- **Yahya:** 33.33% share
  - Stores: None assigned (super admin role)

#### Financial Operations:
- **+ Payout:** Record profit distributions to partners
- **Transfer:** Move money between partner accounts
- **Edit:** Modify partner profit share percentages

**Who Can Access:** Super Admin only

**How to Use:**

**Recording a Payout:**
1. Scroll to partner card
2. Click "+ Payout" button
3. Enter payout amount
4. Select period (date range)
5. Add notes if needed
6. Confirm payout

**Making Owner Transfers:**
1. Click "Transfer" button on source partner
2. Select destination partner
3. Enter amount
4. Add description
5. Confirm transfer

**Viewing Payout History:**
- Scroll down to "All Payout Records" section
- View complete history of all distributions
- Click "+ Record Payout" for new distribution

**Managing Partner Advances:**
- Record owner personal expenses in "Owner Transfers" section
- System tracks amounts owed to partners
- Deducted from future profit distributions

---

### 6. Store Partner Dashboard

![Store Dashboard](./docs/handover-images/06-store-view.png)

**Purpose:** Partner stores view shared global inventory, their sales, and commissions

**Features:**
- **Global Inventory:** View the same physical stock pool as other stores
- **Stock Levels:** Monitor globally available quantities
- **Sales Recording:** Record customer sales against global inventory
- **Commission Tracking:** See earned commissions
- **Limited Access:** Store identity scopes sales and reporting; it does not create inventory ownership

**Who Can Access:** Store role accounts only

**How to Use (for Store Partners):**
1. Login with store credentials
2. View the shared global inventory
3. Record sales as they happen
4. Monitor globally available stock
5. Track commission earnings

---


## 🔄 Global Inventory Architecture

The system no longer treats a store as an inventory owner. There is one physical global inventory pool shared by all stores.

- **Inventory:** Global physical stock and purchase batches
- **Stores:** Sales/reporting identity only
- **Sales:** Deduct from global inventory using the transactional inventory engine
- **Returns:** Physical returns increase global inventory
- **Refunds:** Financial-only refunds do not change stock
- **Replacements:** Replacement stock comes from global inventory
- **COGS:** Based on actual consumed inventory batches
- **Commission:** Snapshotted on each order
- **Allotment:** Retired; no supported API/UI path may create a new allotment

The database migration and reconciliation procedures are documented in docs/GLOBAL_INVENTORY_MIGRATION.md and the scripts/ migration files.

## 📌 Important Notes

### Security
- **Change Default Passwords:** It's recommended to change all default passwords after first login
- **Admin Access:** Only share admin credentials with trusted personnel
- **Store Credentials:** Provide store partners with their specific login only

### Database Management
- **Backup Required:** Run the migration SQL script in Supabase before first use
- **Plain Password Column:** The `plain_password` column must exist in accounts table
- **Environment Variables:** Ensure all Supabase credentials are configured in `.env.local`

### Profit Partners
- **Ownership Percentages:** Currently set to equal split (33.33% each)
- **Store Assignment:** Partners can be associated with specific stores
- **Profit Calculations:** Automatically distributed based on defined percentages

### System Requirements
- **Browser:** Latest Chrome, Firefox, Safari, or Edge
- **Internet:** Stable connection required
- **Screen Resolution:** Minimum 1280x720 recommended

---

## 🛠 Support & Troubleshooting

### Common Issues

**Cannot Login:**
- Verify username and password (case-sensitive)
- Check if account status is "Active" in Shop Credentials
- Clear browser cache and cookies

**Inventory Not Showing:**
- Ensure inventory was added to global inventory first
- Check that the product has available global stock
- Verify the correct store filter is selected for sales reporting

**Permission Denied:**
- Confirm user role matches required access level
- Super Admin: Full access
- Admin: Limited to managed stores
- Store: Own store only

**Reports Not Generating:**
- Check if there is data for selected date range
- Ensure browser allows pop-ups
- Try a different browser if issues persist

### Database Migration

Before first use, run this SQL in Supabase:

```sql
-- Add plain_password column if not exists
ALTER TABLE public.accounts 
ADD COLUMN IF NOT EXISTS plain_password text;

-- Update existing accounts
UPDATE public.accounts 
SET plain_password = 'ChangeMe123' 
WHERE plain_password IS NULL OR plain_password = '';
```

### Getting Help

**Technical Support:** Contact Neura Agency development team  
**Documentation:** Refer to README.md in project repository  
**Database Issues:** Check Supabase dashboard for logs and errors

---

## 📊 System Statistics

- **Total Stores:** 6 active partner stores
- **Admin Accounts:** 2 (yahya - super admin, bilal - admin)
- **Store Accounts:** 4 partner store accounts
- **Profit Partners:** 3 business owners (Bilal, Yahya, Hammad)
- **Profit Split:** Equal distribution (33.33% - 33.34%)

---

## 🔄 Next Steps After Handover

1. **Login Test:** Test all credentials to ensure access
2. **Change Passwords:** Update default passwords for security
3. **Add Real Data:** Input actual inventory and products
4. **Configure Stores:** Set up store-specific commission rates
5. **Train Staff:** Provide training to store partners
6. **Regular Backups:** Set up automated database backups
7. **Monitor Performance:** Review analytics and reports weekly

---

## 📞 Contact Information

**Development Team:** Neura Agency  
**Repository:** Neura-Agency/Trendy-wear  
**Database:** Supabase Project  
**Hosting:** Vercel Deployment

---

**Document Version:** 2.0 — Global Shared Inventory  
**Last Updated:** August 29, 2026  
**Created By:** Neura Agency Development Team

---

*This document contains sensitive credentials. Keep it secure and only share with authorized personnel.*


---

## Global Shared Inventory Migration — 2026-08

The inventory architecture is now one shared physical pool. inventory.quantity_available is the current global available quantity and orders.store_id identifies the store that made the sale.

New sales use sell_from_inventory() with deterministic FIFO locking and order_inventory_allocations. allocation_type='sale' records original sale consumption and allocation_type='replacement' records replacement consumption. Returns restore original sale allocations. Refund-only operations do not change stock. Replacement operations deduct global replacement stock and can restore the original item atomically. Order deletion reverses the complete global transaction atomically.

New store-allotment mutations return 410 STORE_ALLOTMENT_RETIRED. The legacy store_inventory endpoint is read-only during the migration window and is not used by active sales, returns, replacements, dashboards, or inventory UI.

Engine version: inventoryEngineVersion = 2. Version mismatch fails with INVENTORY_ENGINE_VERSION_MISMATCH.

Primary RPCs:
- sell_from_inventory
- process_global_order_return
- undo_global_order_return
- process_global_refund
- undo_global_refund
- delete_global_order

Deploy scripts/2026-08-global-inventory-engine.sql before enabling the application commit. Run reconcile-global-inventory-dry-run.sql, resolve discrepancies, then run reconcile-global-inventory-apply.sql while stock-changing operations are paused. Keep global_inventory_reconciliation as the audit record.

Before legacy schema retirement, verify a database backup and monitor one complete production payout cycle for sales, commission, COGS, returns, refunds, replacements, profit, payouts, included_in_payout, owner profit split, and global inventory.
