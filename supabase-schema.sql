-- Trendy Wear ERP - Complete Supabase Schema
-- Run this in your Supabase SQL Editor

-- Enable Row Level Security (RLS) 
-- This will be configured after table creation

-- ===================================================================
-- ACCOUNTS TABLE - User authentication and permissions
-- ===================================================================
CREATE TABLE accounts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  username VARCHAR(50) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL, -- Store hashed passwords, not plain text
  role VARCHAR(20) NOT NULL CHECK (role IN ('admin', 'store')),
  scope VARCHAR(10) CHECK (scope IN ('all')), -- For super admin
  store_name VARCHAR(100), -- For store users
  managed_stores TEXT[], -- Array of store names for admin users
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ===================================================================
-- STORES TABLE - Store information and commission settings
-- ===================================================================
CREATE TABLE stores (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name VARCHAR(100) UNIQUE NOT NULL,
  commission DECIMAL(5,2) NOT NULL DEFAULT 10.00, -- Percentage
  paid_amount DECIMAL(10,2) DEFAULT 0.00,
  paid BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  paid_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ===================================================================
-- CLIENTS TABLE - Customer information
-- ===================================================================
CREATE TABLE clients (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  phone VARCHAR(20),
  email VARCHAR(100),
  address TEXT,
  payments_received DECIMAL(10,2) DEFAULT 0.00,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ===================================================================
-- INVENTORY TABLE - Master inventory items
-- ===================================================================
CREATE TABLE inventory (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  product_name VARCHAR(200) NOT NULL,
  category VARCHAR(50),
  brand VARCHAR(50),
  size_options TEXT[], -- Array of sizes
  color_options TEXT[], -- Array of colors
  other_variants JSONB, -- For storing additional data like images, alloted stores
  batch_number VARCHAR(50) UNIQUE NOT NULL,
  cost_price DECIMAL(10,2) NOT NULL,
  selling_price DECIMAL(10,2),
  quantity_available INTEGER NOT NULL DEFAULT 0,
  low_stock_warning INTEGER DEFAULT 5,
  owner VARCHAR(50), -- Username of owner
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ===================================================================
-- PURCHASES TABLE - Purchase records
-- ===================================================================
CREATE TABLE purchases (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  product_name VARCHAR(200) NOT NULL,
  category VARCHAR(50),
  brand VARCHAR(50),
  size_options TEXT[], -- Array of sizes
  color_options TEXT[], -- Array of colors
  other_variants JSONB, -- For storing additional data
  batch_number VARCHAR(50) NOT NULL,
  cost_price DECIMAL(10,2) NOT NULL,
  selling_price DECIMAL(10,2),
  quantity INTEGER NOT NULL,
  low_stock_warning INTEGER DEFAULT 5,
  owner VARCHAR(50), -- Username of owner
  date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Foreign key to inventory
  inventory_id UUID REFERENCES inventory(id) ON DELETE CASCADE,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ===================================================================
-- ORDERS TABLE - Sales orders
-- ===================================================================
CREATE TABLE orders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id VARCHAR(50) UNIQUE NOT NULL, -- Your custom order ID format
  product_name VARCHAR(200) NOT NULL,
  quantity INTEGER NOT NULL,
  selling_price DECIMAL(10,2) NOT NULL,
  shipment_cost DECIMAL(10,2) DEFAULT 0.00,
  store_name VARCHAR(100) NOT NULL,
  client_name VARCHAR(100),
  order_type VARCHAR(20), -- "Sale", etc.
  date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  included_in_payout BOOLEAN DEFAULT false,
  commission_percent DECIMAL(5,2) NOT NULL,
  cost_price DECIMAL(10,2) NOT NULL,
  commission_amount DECIMAL(10,2) NOT NULL,
  admin_take DECIMAL(10,2) NOT NULL,
  profit DECIMAL(10,2) NOT NULL,
  
  -- Foreign keys
  store_id UUID REFERENCES stores(id) ON DELETE RESTRICT,
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  inventory_id UUID REFERENCES inventory(id) ON DELETE RESTRICT,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ===================================================================
-- STORE_INVENTORY TABLE - Items assigned to specific stores
-- ===================================================================
CREATE TABLE store_inventory (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  store_name VARCHAR(100) NOT NULL,
  product_name VARCHAR(200) NOT NULL,
  owner_supply_price DECIMAL(10,2) NOT NULL,
  commission_percent DECIMAL(5,2) NOT NULL,
  store_selling_price DECIMAL(10,2),
  quantity_assigned INTEGER NOT NULL DEFAULT 0,
  quantity_remaining INTEGER NOT NULL DEFAULT 0,
  owner VARCHAR(50), -- Username of owner
  
  -- Foreign keys
  store_id UUID REFERENCES stores(id) ON DELETE CASCADE,
  inventory_id UUID REFERENCES inventory(id) ON DELETE CASCADE,
  
  -- Unique constraint to prevent duplicate assignments
  UNIQUE(store_name, product_name),
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ===================================================================
-- EXPENSES TABLE - Business expenses
-- ===================================================================
CREATE TABLE expenses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  expense_id VARCHAR(50) UNIQUE, -- Your custom expense ID if needed
  title VARCHAR(200) NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  category VARCHAR(50),
  description TEXT,
  created_by VARCHAR(50), -- Username
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ===================================================================
-- SETTINGS TABLE - App configuration
-- ===================================================================
CREATE TABLE settings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  setting_key VARCHAR(50) UNIQUE NOT NULL,
  setting_value TEXT NOT NULL,
  data_type VARCHAR(20) DEFAULT 'string' CHECK (data_type IN ('string', 'number', 'boolean', 'json')),
  description TEXT,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ===================================================================
-- AUDIT_LOGS TABLE - Track changes for accountability
-- ===================================================================
CREATE TABLE audit_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  table_name VARCHAR(50) NOT NULL,
  record_id UUID,
  action VARCHAR(20) NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE')),
  old_values JSONB,
  new_values JSONB,
  changed_by VARCHAR(50), -- Username
  changed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Index for performance
  CONSTRAINT idx_audit_logs_table_record UNIQUE (table_name, record_id, changed_at)
);

-- ===================================================================
-- INSERT DEFAULT DATA
-- ===================================================================

-- Insert default settings
INSERT INTO settings (setting_key, setting_value, data_type, description) VALUES
('defaultCommission', '10', 'number', 'Default commission percentage for new stores'),
('lowStockThreshold', '5', 'number', 'Default low stock warning threshold');

-- Insert default accounts (with hashed passwords)
-- NOTE: You should hash these passwords properly in your app
INSERT INTO accounts (username, password_hash, role, scope) VALUES
('yahya', '$2b$10$placeholder_hash_for_yahya123', 'admin', 'all'),
('bilal', '$2b$10$placeholder_hash_for_bilal123', 'admin', null);

-- Insert stores
INSERT INTO stores (name, commission, paid_amount, paid, created_at) VALUES
('Trendy Wear', 15.00, 210.00, true, '2026-02-19T23:45:00Z'),
('Grenz Wear', 10.00, 0.00, false, '2026-02-19T23:45:00Z'),
('Thrift Wear', 12.00, 0.00, false, '2026-02-19T23:45:00Z'),
('Preloved Wear', 10.00, 0.00, false, '2026-02-19T23:45:00Z'),
('BNB Vintage', 10.00, 0.00, false, '2026-02-19T23:45:00Z'),
('Vinted', 20.00, 0.00, false, '2026-02-19T23:45:00Z');

-- Update accounts with store associations after stores are created
UPDATE accounts SET 
  store_name = 'Trendy Wear',
  password_hash = '$2b$10$placeholder_hash_for_shop123'
WHERE username = 'trendy_shop';

-- Add other store accounts
INSERT INTO accounts (username, password_hash, role, store_name) VALUES
('grenz_shop', '$2b$10$placeholder_hash_for_shop123', 'store', 'Grenz Wear'),
('thrift_shop', '$2b$10$placeholder_hash_for_shop123', 'store', 'Thrift Wear'),
('preloved_shop', '$2b$10$placeholder_hash_for_shop123', 'store', 'Preloved Wear'),
('bnb_shop', '$2b$10$placeholder_hash_for_shop123', 'store', 'BNB Vintage'),
('vinted_shop', '$2b$10$placeholder_hash_for_shop123', 'store', 'Vinted');

-- Update bilal's managed stores
UPDATE accounts SET managed_stores = ARRAY['Vinted'] WHERE username = 'bilal';

-- ===================================================================
-- INDEXES FOR PERFORMANCE
-- ===================================================================

-- Accounts indexes
CREATE INDEX idx_accounts_username ON accounts(username);
CREATE INDEX idx_accounts_role ON accounts(role);
CREATE INDEX idx_accounts_store_name ON accounts(store_name);

-- Stores indexes
CREATE INDEX idx_stores_name ON stores(name);
CREATE INDEX idx_stores_paid ON stores(paid);

-- Inventory indexes
CREATE INDEX idx_inventory_product_name ON inventory(product_name);
CREATE INDEX idx_inventory_batch_number ON inventory(batch_number);
CREATE INDEX idx_inventory_owner ON inventory(owner);
CREATE INDEX idx_inventory_category ON inventory(category);
CREATE INDEX idx_inventory_brand ON inventory(brand);

-- Orders indexes
CREATE INDEX idx_orders_order_id ON orders(order_id);
CREATE INDEX idx_orders_store_name ON orders(store_name);
CREATE INDEX idx_orders_client_name ON orders(client_name);
CREATE INDEX idx_orders_date ON orders(date);
CREATE INDEX idx_orders_included_in_payout ON orders(included_in_payout);

-- Store inventory indexes
CREATE INDEX idx_store_inventory_store_name ON store_inventory(store_name);
CREATE INDEX idx_store_inventory_product_name ON store_inventory(product_name);
CREATE INDEX idx_store_inventory_owner ON store_inventory(owner);

-- Expenses indexes
CREATE INDEX idx_expenses_date ON expenses(date);
CREATE INDEX idx_expenses_category ON expenses(category);
CREATE INDEX idx_expenses_created_by ON expenses(created_by);

-- Clients indexes
CREATE INDEX idx_clients_name ON clients(name);
CREATE INDEX idx_clients_phone ON clients(phone);

-- ===================================================================
-- FUNCTIONS AND TRIGGERS
-- ===================================================================

-- Function to update the updated_at column
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply updated_at triggers to tables that need them
CREATE TRIGGER update_accounts_updated_at BEFORE UPDATE ON accounts 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_stores_updated_at BEFORE UPDATE ON stores 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_inventory_updated_at BEFORE UPDATE ON inventory 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_orders_updated_at BEFORE UPDATE ON orders 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_store_inventory_updated_at BEFORE UPDATE ON store_inventory 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_expenses_updated_at BEFORE UPDATE ON expenses 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_clients_updated_at BEFORE UPDATE ON clients 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_settings_updated_at BEFORE UPDATE ON settings 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ===================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ===================================================================

-- Enable RLS on all tables
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE stores ENABLE ROW LEVEL SECURITY; 
ALTER TABLE inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE store_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Basic RLS policies (you can customize these based on your needs)

-- Accounts: Users can read their own account, admins can read all
CREATE POLICY "accounts_read_policy" ON accounts FOR SELECT 
  USING (
    auth.jwt() ->> 'username' = username 
    OR 
    (auth.jwt() ->> 'role' = 'admin')
  );

-- Stores: All authenticated users can read stores
CREATE POLICY "stores_read_policy" ON stores FOR SELECT 
  USING (auth.jwt() IS NOT NULL);

-- Inventory: Users can see inventory they own or are assigned to manage
CREATE POLICY "inventory_read_policy" ON inventory FOR SELECT 
  USING (
    owner = auth.jwt() ->> 'username'
    OR 
    auth.jwt() ->> 'role' = 'admin'
  );

-- Orders: Users can see orders from their stores or all if admin
CREATE POLICY "orders_read_policy" ON orders FOR SELECT 
  USING (
    store_name = auth.jwt() ->> 'store_name'
    OR 
    auth.jwt() ->> 'role' = 'admin'
  );

-- Add more policies as needed...

-- ===================================================================
-- VIEWS FOR COMMON QUERIES
-- ===================================================================

-- View for order analytics
CREATE VIEW order_analytics AS
SELECT 
  DATE_TRUNC('day', date) as order_date,
  store_name,
  COUNT(*) as total_orders,
  SUM(selling_price * quantity) as total_revenue,
  SUM(commission_amount) as total_commission,
  SUM(admin_take) as total_admin_take,
  SUM(profit) as total_profit
FROM orders
GROUP BY DATE_TRUNC('day', date), store_name
ORDER BY order_date DESC, total_revenue DESC;

-- View for inventory status
CREATE VIEW inventory_status AS
SELECT 
  product_name,
  batch_number,
  brand,
  category,
  quantity_available,
  low_stock_warning,
  CASE 
    WHEN quantity_available = 0 THEN 'OUT_OF_STOCK'
    WHEN quantity_available <= low_stock_warning THEN 'LOW_STOCK'
    ELSE 'IN_STOCK'
  END as stock_status,
  owner
FROM inventory
ORDER BY 
  CASE 
    WHEN quantity_available = 0 THEN 1
    WHEN quantity_available <= low_stock_warning THEN 2
    ELSE 3
  END,
  product_name;

-- View for store performance
CREATE VIEW store_performance AS
SELECT 
  s.name as store_name,
  s.commission,
  COUNT(o.id) as total_orders,
  COALESCE(SUM(o.selling_price * o.quantity), 0) as total_sales,
  COALESCE(SUM(o.commission_amount), 0) as total_earned_commission,
  s.paid_amount,
  s.paid,
  s.created_at
FROM stores s
LEFT JOIN orders o ON s.name = o.store_name
GROUP BY s.id, s.name, s.commission, s.paid_amount, s.paid, s.created_at
ORDER BY total_sales DESC;

-- ===================================================================
-- COMMENTS ON TABLES
-- ===================================================================

COMMENT ON TABLE accounts IS 'User accounts with authentication and role-based permissions';
COMMENT ON TABLE stores IS 'Store information including commission settings and payout status';
COMMENT ON TABLE inventory IS 'Master inventory items with stock levels and product details';
COMMENT ON TABLE purchases IS 'Purchase records for tracking stock additions';
COMMENT ON TABLE orders IS 'Sales orders with detailed pricing and commission calculations';
COMMENT ON TABLE store_inventory IS 'Items assigned to specific stores with store-specific pricing';
COMMENT ON TABLE expenses IS 'Business expenses for financial tracking';
COMMENT ON TABLE clients IS 'Customer information and contact details';
COMMENT ON TABLE settings IS 'Application configuration settings';
COMMENT ON TABLE audit_logs IS 'Audit trail for tracking data changes';

-- ===================================================================
-- FINAL NOTES
-- ===================================================================

/*
IMPORTANT SETUP STEPS:

1. Run this script in your Supabase SQL Editor

2. Update your API endpoints to use Supabase instead of the file-based datastore

3. Set up environment variables:
   - NEXT_PUBLIC_SUPABASE_URL (your Supabase project URL)
   - NEXT_PUBLIC_SUPABASE_ANON_KEY (your Supabase anon public key)
   - SUPABASE_SERVICE_ROLE_KEY (for server-side operations)

4. Install Supabase client:
   npm install @supabase/supabase-js

5. Hash passwords properly using bcrypt before inserting (replace placeholder hashes)

6. Customize RLS policies based on your specific security requirements

7. Test all endpoints thoroughly after migration

8. Backup your current data.json before switching to Supabase
*/