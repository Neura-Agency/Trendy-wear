// Application types for Trendy Wear ERP

export interface Owner {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  profitSharePercent: number;   // e.g. 33.34  — should sum to 100 across active owners
  notes?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  /** Aggregated from owner_payouts (returned by GET /api/owners) */
  totalPaidOut?: number;
  payoutCount?: number;
  lastPayoutAt?: string | null;
  /** Aggregated from owner_transactions type='owner_advance' (returned by GET /api/owners) */
  totalAdvances?: number;
}

export interface OwnerPayout {
  id: string;
  ownerId: string;
  ownerName?: string;
  amount: number;
  periodFrom: string;   // YYYY-MM-DD
  periodTo: string;     // YYYY-MM-DD
  notes?: string;
  paidAt: string;
  createdAt: string;
}

export interface User {
  username: string;
  role: 'admin' | 'store';
  scope?: 'all';
  storeName?: string;
  managedStores?: string[];
}

export interface Store {
  commission: number;
  paidAmount: number;
  paid: boolean;
  createdAt: string;
  paidAt?: string;
}

export interface Product {
  id: string;
  productName: string;
  brandName: string;
  productType: string;
  pricePerPiece: number;
  colors: string[];
  sizes: string[];
  productImage?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface Order {
  id: string;
  productName: string;
  quantity: number;
  sellingPrice: number;
  shipmentCost: number;
  storeName: string;
  clientName: string;
  type: string;
  date: string;
  includedInPayout: boolean;
  commissionPercent: number;
  costPrice: number;
  commissionAmount: number;
  adminTake: number;
  profit: number;
  paymentStatus?: boolean | null;
  orderReturned?: boolean;
}

export interface Purchase {
  id: string;
  productId?: string;
  productName: string;
  category: string;
  brand: string;
  size: string | string[];
  color: string | string[];
  otherVariants?: any;
  batchNumber: string;
  costPrice: number;
  sellingPrice: number;
  quantity: number;
  lowStockWarning: number;
  date: string;
  owner?: string;
}

export interface InventoryItem {
  id?: string;          // inventory.id (UUID) — unique per batch row
  productId?: string;
  productName: string;
  category: string;
  brand: string;
  size: string | string[];
  color: string | string[];
  otherVariants?: any;
  productImage?: string | null;
  sizeQuantities?: Record<string, number> | null;
  batchNumber: string;
  costPrice: number;
  sellingPrice: number;
  quantityAvailable: number;
  lowStockWarning: number;
  owner?: string;
}

export interface StoreInventoryItem {
  id?: string;          // store_inventory.id (UUID)
  inventoryId?: string; // FK → inventory.id (batch FK)
  productId?: string;
  productName: string;
  ownerSupplyPrice: number;
  commissionPercent: number;
  storeSellingPrice: number;
  quantityAssigned: number;
  quantityRemaining: number;
  extraQty?: number;    // gift / display units allotted (not sold, expensed at cost)
  storeName?: string;   // populated when flattened out of the Record
  owner?: string;
}

export interface Expense {
  id: string;
  title: string;
  category: string;
  amount: number;
  expense_date: string; // date in YYYY-MM-DD format
  notes?: string | null;
  created_at?: string;
  paid_by_owner_id?: string | null;
  paid_by_owner_name?: string | null;
  from_acc?: string | null;
  expense_type?: string | null;
}

export interface OwnerTransaction {
  id: string;
  ownerId: string;
  ownerName?: string;
  transactionType: string;
  amount: number;
  description?: string | null;
  counterpartOwnerId?: string | null;
  counterpartOwnerName?: string | null;
  occurredAt: string;
  createdAt: string;
}

export interface Client {
  id: string;
  name: string;
  phone: string;
  orders?: Order[];
  paymentsReceived?: number;
}

export interface Account {
  password: string;
  role: 'admin' | 'store';
  scope?: 'all';
  storeName?: string;
  managedStores?: string[];
  isActive?: boolean;
}

export interface AppData {
  accounts: Record<string, Account>;
  stores: Record<string, Store>;
  orders: Order[];
  purchases: Purchase[];
  inventory: InventoryItem[];
  expenses: Expense[];
  clients: Client[];
  storeInventory: Record<string, Record<string, StoreInventoryItem>>;
  settings: {
    defaultCommission: number;
    lowStockThreshold: number;
  };
}

// Component prop types
export interface LayoutProps {
  children: React.ReactNode;
  user: User;
  onLogout: () => void;
}

export interface LoginProps {
  onLogin: (user: User) => void;
}

export interface PageProps {
  user?: User;
  onLogin?: (user: User) => void;
  onLogout?: () => void;
}

export interface BadgeProps {
  type?: 'green' | 'blue' | 'red' | 'orange' | 'purple' | 'gray';
  style?: React.CSSProperties;
  children: React.ReactNode;
}

export interface SectionCardProps {
  title: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
}

export interface ModalProps {
  open?: boolean;
  onClose: () => void;
}

export interface SaleModalProps extends ModalProps {
  onSave?: (order: Partial<Order>) => void;
  stores?: Record<string, Store>;
  inventory?: InventoryItem[];
  user?: User;
  isAdmin?: boolean;
  isSuperAdmin?: boolean;
}

export interface CreateStoreModalProps extends ModalProps {
  onSave: (store: { name: string; partnerName: string; partnerContact: string; commission: number; storeId: string }) => void;
}

export interface ReportModalProps extends ModalProps {
  data: AppData;
}

export interface AddInventoryModalProps extends ModalProps {
  onSave: (inventory: any) => void;
  stores: string[];
  products: Product[];
}

export interface AllotToStoreModalProps extends ModalProps {
  stores: string[];
  inventory: InventoryItem[];
  allotedQtyByProduct: Record<string, number>;
  storeCommissionByName: Record<string, number>;
  onSave: (payload: {
    storeName: string;
    batchNumber: string;
    quantity: number;
    ownerSupplyPrice: number;
    commissionPercent: number;
    extraQty: number;
    sizeQuantitiesAssigned?: Record<string, number> | undefined;
  }) => void;
}