const fs = require('fs');
const path = require('path');
const EventEmitter = require('events');

const DATA_FILE = path.join(process.cwd(), 'data.json');

class DataStore extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(100);
    if (!fs.existsSync(DATA_FILE)) this._writeSeed();
    this._load();
  }

  _writeSeed() {
    fs.writeFileSync(DATA_FILE, JSON.stringify({
      accounts: {
        admin: { password: 'admin123', role: 'admin' },
        example_shop: { password: 'shop123', role: 'store', storeName: 'Example Store' }
      },
      stores: {
        'Example Store': { commission: 10, paidAmount: 0, paid: false, createdAt: new Date().toISOString() }
      },
      orders: [], purchases: [], inventory: [],
      expenses: [], clients: [], storeInventory: {},
      settings: { defaultCommission: 10, lowStockThreshold: 5 }
    }, null, 2));
  }

  _load() { this.data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); }

  _save() {
    fs.writeFileSync(DATA_FILE, JSON.stringify(this.data, null, 2));
    this.emit('change', { ts: Date.now() });
  }

  getAll() { this._load(); return this.data; }

  authenticate(username, password) {
    this._load();
    const acc = this.data.accounts?.[username];
    if (!acc || acc.password !== password) return null;
    return {
      role: acc.role,
      storeName: acc.storeName || null,
      username,
      scope: acc.scope || null,
      managedStores: acc.managedStores || []
    };
  }

  // ── ORDERS ──────────────────────────────────────────────
  addOrder(order) {
    this._load();
    order.id = 'o_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    order.date = order.date || new Date().toISOString();
    order.type = order.type || 'Sale';
    order.includedInPayout = order.type !== 'Gift';

    // Auto commission — store's share (what store EARNS for selling)
    if (order.commissionPercent === undefined || order.commissionPercent === null) {
      // If this order is sold from a store-assigned lot, prefer that lot's commission
      const si = this.data.storeInventory?.[order.storeName]?.[order.productName];
      if (si && si.commissionPercent !== undefined && si.commissionPercent !== null) {
        order.commissionPercent = si.commissionPercent;
      } else {
        order.commissionPercent = this.data.stores[order.storeName]?.commission ?? this.data.settings.defaultCommission;
      }
    }

    // Deduct from store inventory and set correct cost basis
    const si = this.data.storeInventory?.[order.storeName]?.[order.productName];
    if (si) {
      si.quantityRemaining = Math.max(0, si.quantityRemaining - (order.quantity || 1));
      order.costPrice = si.ownerSupplyPrice;
    } else {
      const inv = this.data.inventory.find(i => i.productName === order.productName);
      if (inv) {
        inv.quantityAvailable = Math.max(0, inv.quantityAvailable - (order.quantity || 1));
        if (!order.costPrice) order.costPrice = inv.costPrice;
      }
    }

    const gross = (order.sellingPrice || 0) * (order.quantity || 1);
    const cost = (order.costPrice || 0) * (order.quantity || 1);
    const shipment = parseFloat(order.shipmentCost || 0);
    const netAfterShipment = gross - shipment;

    const isDirectSale = !order.storeName || order.storeName === 'Direct';
    const comm = (order.type === 'Gift' || isDirectSale) ? 0 : (order.commissionPercent / 100) * netAfterShipment;

    order.commissionAmount = comm;
    order.adminTake = netAfterShipment - comm;
    order.profit = order.type === 'Gift' ? 0 : order.adminTake - cost;

    this.data.orders.push(order);

    // Don't auto-create store entry for direct/admin sales
    if (order.storeName && order.storeName !== 'Direct' && !this.data.stores[order.storeName]) {
      this.data.stores[order.storeName] = { commission: this.data.settings.defaultCommission, paidAmount: 0, paid: false };
    }
    this._save();
    return order;
  }

  updateOrderCommission(orderId, commissionPercent) {
    this._load();
    const order = this.data.orders.find(o => o.id === orderId);
    if (!order) return null;
    order.commissionPercent = commissionPercent;
    const gross = (order.sellingPrice || 0) * (order.quantity || 1);
    const cost = (order.costPrice || 0) * (order.quantity || 1);
    const shipment = parseFloat(order.shipmentCost || 0);
    const netAfterShipment = gross - shipment;

    const isDirectSale = !order.storeName || order.storeName === 'Direct';
    const comm = (order.type === 'Gift' || isDirectSale) ? 0 : (commissionPercent / 100) * netAfterShipment;

    order.commissionAmount = comm;
    order.adminTake = netAfterShipment - comm;
    order.profit = order.type === 'Gift' ? 0 : order.adminTake - cost;
    this._save();
    return order;
  }

  toggleOrderInPayout(orderId, included) {
    this._load();
    const order = this.data.orders.find(o => o.id === orderId);
    if (!order) return null;
    order.includedInPayout = included;
    this._save();
    return order;
  }

  // ── PURCHASES ─────────────────────────────────────────
  addPurchase(p) {
    this._load();
    p.id = 'p_' + Date.now();
    p.date = p.date || new Date().toISOString();
    this.data.purchases.push(p);

    let item = this.data.inventory.find(i => i.productName === p.productName && i.batchNumber === p.batchNumber);
    if (item) {
      item.quantityAvailable += (p.quantity || 0);
      item.costPrice = p.costPrice;
      if (p.sellingPrice) item.sellingPrice = p.sellingPrice;
    } else {
      this.data.inventory.push({
        productName: p.productName,
        category: p.category,
        brand: p.brand,
        size: p.size,
        color: p.color,
        otherVariants: p.otherVariants,
        batchNumber: p.batchNumber,
        costPrice: p.costPrice,
        sellingPrice: p.sellingPrice || 0,
        quantityAvailable: p.quantity,
        lowStockWarning: p.lowStockWarning || 5
      });
    }
    this._save();
    return p;
  }

  updateInventoryItem(productName, batchNumber, fields) {
    this._load();
    const item = this.data.inventory.find(i => i.productName === productName && i.batchNumber === batchNumber);
    if (!item) return null;
    Object.assign(item, fields);
    this._save();
    return item;
  }

  // ── EXPENSES ──────────────────────────────────────────
  addExpense(e) {
    this._load();
    e.id = 'e_' + Date.now();
    e.date = e.date || new Date().toISOString();
    this.data.expenses.push(e);
    this._save();
    return e;
  }

  // ── STORES / COMMISSION ───────────────────────────────
  updateStoreCommission(storeName, commission) {
    this._load();
    if (!this.data.stores[storeName]) this.data.stores[storeName] = { paidAmount: 0, paid: false };
    this.data.stores[storeName].commission = parseFloat(commission);
    this._save();
    return this.data.stores[storeName];
  }

  markStorePaid(storeName, amount) {
    this._load();
    if (!this.data.stores[storeName]) return null;

    // Update store status
    this.data.stores[storeName].paid = true;
    this.data.stores[storeName].paidAmount = amount;
    this.data.stores[storeName].paidAt = new Date().toISOString();

    // Mark all currently included orders as 'paid' (archived from current balance)
    this.data.orders.forEach(o => {
      if (o.storeName === storeName && o.includedInPayout !== false) {
        o.includedInPayout = false;
      }
    });

    this._save();
    return this.data.stores[storeName];
  }

  createStore(storeName, username, password, commission) {
    this._load();
    if (this.data.stores[storeName]) return { error: 'Store already exists' };
    if (this.data.accounts[username]) return { error: 'Username already taken' };
    commission = parseFloat(commission) || this.data.settings.defaultCommission;
    this.data.stores[storeName] = { commission, paidAmount: 0, paid: false, createdAt: new Date().toISOString() };
    this.data.accounts[username] = { password, role: 'store', storeName };
    this._save();
    return { storeName, username, commission };
  }

  resetPayouts() {
    this._load();
    Object.keys(this.data.stores).forEach(s => {
      this.data.stores[s].paid = false;
      this.data.stores[s].paidAmount = 0;
    });
    this._save();
  }

  reset() {
    this._writeSeed();
    this._load();
    this.emit('change', { ts: Date.now(), reset: true });
  }

  // ── STORE INVENTORY ──────────────────────────────────────
  assignItemToStore(storeName, productName, ownerSupplyPrice, quantity, commissionPercent) {
    this._load();
    quantity = parseInt(quantity) || 0;
    ownerSupplyPrice = parseFloat(ownerSupplyPrice) || 0;
    if (!this.data.storeInventory) this.data.storeInventory = {};
    if (!this.data.storeInventory[storeName]) this.data.storeInventory[storeName] = {};
    const existing = this.data.storeInventory[storeName][productName];
    if (existing) {
      existing.quantityAssigned += quantity;
      existing.quantityRemaining += quantity;
      existing.ownerSupplyPrice = ownerSupplyPrice;
      existing.commissionPercent = commissionPercent !== undefined && commissionPercent !== null ? parseFloat(commissionPercent) : (this.data.stores[storeName]?.commission ?? this.data.settings.defaultCommission);
    } else {
      this.data.storeInventory[storeName][productName] = {
        productName,
        ownerSupplyPrice,
        commissionPercent: commissionPercent !== undefined && commissionPercent !== null ? parseFloat(commissionPercent) : (this.data.stores[storeName]?.commission ?? this.data.settings.defaultCommission),
        storeSellingPrice: ownerSupplyPrice, // default same as supply price
        quantityAssigned: quantity,
        quantityRemaining: quantity,
      };
    }
    // Deduct from master inventory when items leave owner's stock
    const inv = this.data.inventory.find(i => i.productName === productName);
    if (inv) inv.quantityAvailable = Math.max(0, inv.quantityAvailable - quantity);
    this._save();
    return this.data.storeInventory[storeName][productName];
  }

  setStoreSellingPrice(storeName, productName, price) {
    this._load();
    if (!this.data.storeInventory?.[storeName]?.[productName]) return null;
    this.data.storeInventory[storeName][productName].storeSellingPrice = parseFloat(price);
    this._save();
    return this.data.storeInventory[storeName][productName];
  }

  // ── CLIENTS ───────────────────────────────────────────
  addClient(client) {
    this._load();
    client.id = 'c_' + Date.now();
    client.orders = [];
    client.paymentsReceived = 0;
    this.data.clients.push(client);
    this._save();
    return client;
  }

  addClientOrder(clientId, order) {
    this._load();
    const client = this.data.clients.find(c => c.id === clientId);
    if (!client) return null;
    order.id = 'co_' + Date.now();
    order.date = new Date().toISOString();
    if (!client.orders) client.orders = [];
    client.orders.push(order);

    // deduct inventory
    const inv = this.data.inventory.find(i => i.productName === order.productName);
    if (inv) inv.quantityAvailable = Math.max(0, inv.quantityAvailable - (order.quantity || 1));
    this._save();
    return order;
  }

  addClientPayment(clientId, amount) {
    this._load();
    const client = this.data.clients.find(c => c.id === clientId);
    if (!client) return null;
    client.paymentsReceived = (client.paymentsReceived || 0) + parseFloat(amount);
    this._save();
    return client;
  }
}

module.exports = new DataStore();
