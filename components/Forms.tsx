import React, { useState } from 'react';
import { InventoryItem, Order, Purchase, Expense } from '../types';
import { usePopup } from './Popup';

/* =========================
   ADD SALE FORM
========================= */

interface AddSaleFormProps {
  inventory: InventoryItem[];
  storeName?: string;
  onAdd: (order: Partial<Order>) => void;
}

export function AddSaleForm({ inventory, storeName, onAdd }: AddSaleFormProps) {
  const { toast } = usePopup();
  const [formData, setFormData] = useState({
    productName: '',
    quantity: 1,
    type: 'Sale',
    includedInPayout: true
  });

  const user = JSON.parse(localStorage.getItem('user') || '{}');

  let allowedStoreNames = [];
  if (user.role === 'admin' && user.scope === 'all') {
    allowedStoreNames = Array.from(
      new Set(inventory.map((item: any) => item.storeName))
    ) as string[];
  } else if (user.role === 'admin') {
    allowedStoreNames = user.managedStores || [];
  } else if (user.role === 'store') {
    allowedStoreNames = [user.storeName];
  }

  const selectedItem = inventory.find(
    i => i.productName === formData.productName
  );

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.productName) return toast.error('Select product');

    const order = {
      ...formData,
      storeName: allowedStoreNames[0],
      sellingPrice: selectedItem?.sellingPrice || 0,
      costPrice: selectedItem?.costPrice || 0,
      profit:
        formData.type === 'Gift'
          ? 0
          : (selectedItem?.sellingPrice - selectedItem?.costPrice) *
            formData.quantity
    };

    onAdd(order);

    setFormData({
      productName: '',
      quantity: 1,
      type: 'Sale',
      includedInPayout: true
    });
  };

  return (
    <form onSubmit={handleSubmit} className="section-card" style={{ padding: 24, gridColumn: 'span 2' }}>
      <h3 style={{ marginTop: 0, marginBottom: 20 }}>
        Record New Sale
      </h3>

      <div className="form-grid-2">
        <div className="input-group">
          <label>Product</label>
          <select
            value={formData.productName}
            onChange={(e) =>
              setFormData({ ...formData, productName: e.target.value })
            }
          >
            <option value="">Select Product...</option>
            {inventory.map((i) => (
              <option key={i.productName} value={i.productName}>
                {i.productName} ({i.quantityAvailable} left)
              </option>
            ))}
          </select>
        </div>

        <div className="input-group">
          <label>Quantity</label>
          <input
            type="number"
            min="1"
            value={formData.quantity}
            onChange={(e) =>
              setFormData({
                ...formData,
                quantity: parseInt(e.target.value)
              })
            }
          />
        </div>

        <div className="input-group full-width">
          <label>Type</label>
          <select
            value={formData.type}
            onChange={(e) =>
              setFormData({ ...formData, type: e.target.value })
            }
          >
            <option value="Sale">Sale</option>
            <option value="Gift">Gift</option>
          </select>
        </div>
      </div>

      <button
        type="submit"
        className="btn btn-primary"
        style={{ marginTop: 20, width: '100%' }}
      >
        Add Transaction
      </button>
    </form>
  );
}

/* =========================
   ADD PURCHASE FORM
========================= */

interface AddPurchaseFormProps {
  onAdd: (purchase: Partial<Purchase>) => void;
}

export function AddPurchaseForm({ onAdd }: AddPurchaseFormProps) {
  const [formData, setFormData] = useState({
    productName: '',
    category: 'Factory Left',
    costPrice: 0,
    sellingPrice: 0,
    quantity: 1,
    batchNumber: ''
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    onAdd(formData);

    setFormData({
      productName: '',
      category: 'Factory Left',
      costPrice: 0,
      sellingPrice: 0,
      quantity: 1,
      batchNumber: ''
    });
  };

  return (
    <form onSubmit={handleSubmit} className="section-card" style={{ padding: 24 }}>
      <h3 style={{ marginTop: 0, marginBottom: 20 }}>
        Inventory Entry (Purchase)
      </h3>

      <div className="input-group">
        <label>Product Name</label>
        <input
          value={formData.productName}
          onChange={(e) =>
            setFormData({ ...formData, productName: e.target.value })
          }
        />
      </div>

      <div className="form-grid-2">
        <div className="input-group">
          <label>Cost Price</label>
          <input
            type="number"
            value={formData.costPrice}
            onChange={(e) =>
              setFormData({
                ...formData,
                costPrice: parseFloat(e.target.value)
              })
            }
          />
        </div>

        <div className="input-group">
          <label>Selling Price</label>
          <input
            type="number"
            value={formData.sellingPrice}
            onChange={(e) =>
              setFormData({
                ...formData,
                sellingPrice: parseFloat(e.target.value)
              })
            }
          />
        </div>

        <div className="input-group">
          <label>Quantity</label>
          <input
            type="number"
            value={formData.quantity}
            onChange={(e) =>
              setFormData({
                ...formData,
                quantity: parseInt(e.target.value)
              })
            }
          />
        </div>

        <div className="input-group">
          <label>Batch Number</label>
          <input
            value={formData.batchNumber}
            onChange={(e) =>
              setFormData({
                ...formData,
                batchNumber: e.target.value
              })
            }
          />
        </div>
      </div>

      <button
        type="submit"
        className="btn btn-primary btn-full"
        style={{ marginTop: 20 }}
      >
        Add to Stock
      </button>
    </form>
  );
}

/* =========================
   ADD EXPENSE FORM
========================= */

interface AddExpenseFormProps {
  onAdd: (expense: Partial<Expense>) => void;
}

export function AddExpenseForm({ onAdd }: AddExpenseFormProps) {
  const { toast } = usePopup();
  const [formData, setFormData] = useState<Partial<Expense>>({
    title: '',
    category: 'Misc',
    amount: 0,
    expense_date: new Date().toISOString().slice(0, 10),
    notes: ''
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const amount = Number((formData.amount as any) || 0);
    if (!formData.title || !formData.category) return toast.error('Please fill title and category');
    if (Number.isNaN(amount) || amount < 0) return toast.error('Amount must be a positive number');

    onAdd({
      title: String(formData.title),
      category: String(formData.category),
      amount: amount,
      expense_date: String(formData.expense_date),
      notes: formData.notes || null
    });

    setFormData({
      title: '',
      category: 'Misc',
      amount: 0,
      expense_date: new Date().toISOString().slice(0, 10),
      notes: ''
    });
  };

  return (
    <form onSubmit={handleSubmit} className="section-card" style={{ padding: 24 }}>
      <h3 style={{ marginTop: 0, marginBottom: 20 }}>
        Add Expense
      </h3>

      <div className="input-group">
        <label>Title</label>
        <input
          value={formData.title as string}
          onChange={(e) => setFormData({ ...formData, title: e.target.value })}
        />
      </div>

      <div className="form-grid-2">
        <div className="input-group">
          <label>Category</label>
          <select
            value={formData.category as string}
            onChange={(e) => setFormData({ ...formData, category: e.target.value })}
          >
            <option value="Rent">Rent</option>
            <option value="Electricity">Electricity</option>
            <option value="Tea">Tea</option>
            <option value="Shipping">Shipping</option>
            <option value="Misc">Misc</option>
          </select>
        </div>

        <div className="input-group">
          <label>Amount</label>
          <input
            type="number"
            step="0.01"
            min="0"
            value={String(formData.amount)}
            onChange={(e) => setFormData({ ...formData, amount: parseFloat(e.target.value) })}
          />
        </div>

        <div className="input-group">
          <label>Date</label>
          <input
            type="date"
            value={formData.expense_date as string}
            onChange={(e) => setFormData({ ...formData, expense_date: e.target.value })}
          />
        </div>
      </div>

      <div className="input-group">
        <label>Notes</label>
        <textarea
          value={formData.notes as string}
          onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
        />
      </div>

      <button type="submit" className="btn btn-primary btn-full">Save Expense</button>
    </form>
  );
}
