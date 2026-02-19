import { useState } from 'react';

/* =========================
   COMMON CARD STYLE WRAPPER
========================= */

const cardStyle = {
  background: '#ffffff',
  borderRadius: 12,
  padding: 20,
  boxShadow: '0 10px 25px rgba(0,0,0,0.06)',
  border: '1px solid #f0f0f0'
};

const inputStyle = {
  height: 40,
  padding: '0 12px',
  borderRadius: 8,
  border: '1px solid #d9d9d9',
  fontSize: 14,
  transition: 'all 0.2s ease'
};

const primaryBtn = {
  height: 40,
  borderRadius: 8,
  border: 'none',
  cursor: 'pointer',
  fontWeight: 600,
  background: 'linear-gradient(90deg,#1677ff,#4096ff)',
  color: '#fff'
};

/* =========================
   ADD SALE FORM
========================= */

export function AddSaleForm({ inventory, storeName, onAdd }) {
  const [formData, setFormData] = useState({
    productName: '',
    quantity: 1,
    type: 'Sale',
    includedInPayout: true
  });

  const user = JSON.parse(localStorage.getItem('user') || '{}');

  let allowedStoreNames = [];
  if (user.role === 'admin' && user.scope === 'all') {
    allowedStoreNames = [
      ...new Set(inventory.map(item => item.storeName))
    ];
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
    if (!formData.productName) return alert('Select product');

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
    <form onSubmit={handleSubmit} style={{ ...cardStyle, gridColumn: 'span 2' }}>
      <h3 style={{ marginTop: 0, marginBottom: 20 }}>
        Record New Sale
      </h3>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 16
        }}
      >
        <div>
          <label style={{ fontSize: 13, color: '#666' }}>
            Product
          </label>
          <select
            style={inputStyle}
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

        <div>
          <label style={{ fontSize: 13, color: '#666' }}>
            Quantity
          </label>
          <input
            type="number"
            min="1"
            style={inputStyle}
            value={formData.quantity}
            onChange={(e) =>
              setFormData({
                ...formData,
                quantity: parseInt(e.target.value)
              })
            }
          />
        </div>

        <div>
          <label style={{ fontSize: 13, color: '#666' }}>
            Type
          </label>
          <select
            style={inputStyle}
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
        style={{ ...primaryBtn, marginTop: 20, width: 220 }}
      >
        Add Transaction
      </button>
    </form>
  );
}

/* =========================
   ADD PURCHASE FORM
========================= */

export function AddPurchaseForm({ onAdd }) {
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
    <form onSubmit={handleSubmit} style={cardStyle}>
      <h3 style={{ marginTop: 0, marginBottom: 20 }}>
        Inventory Entry (Purchase)
      </h3>

      <div style={{ marginBottom: 16 }}>
        <label style={{ fontSize: 13, color: '#666' }}>
          Product Name
        </label>
        <input
          style={inputStyle}
          value={formData.productName}
          onChange={(e) =>
            setFormData({ ...formData, productName: e.target.value })
          }
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div>
          <label style={{ fontSize: 13, color: '#666' }}>
            Cost Price
          </label>
          <input
            type="number"
            style={inputStyle}
            value={formData.costPrice}
            onChange={(e) =>
              setFormData({
                ...formData,
                costPrice: parseFloat(e.target.value)
              })
            }
          />
        </div>

        <div>
          <label style={{ fontSize: 13, color: '#666' }}>
            Selling Price
          </label>
          <input
            type="number"
            style={inputStyle}
            value={formData.sellingPrice}
            onChange={(e) =>
              setFormData({
                ...formData,
                sellingPrice: parseFloat(e.target.value)
              })
            }
          />
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 16,
          marginTop: 16
        }}
      >
        <div>
          <label style={{ fontSize: 13, color: '#666' }}>
            Quantity
          </label>
          <input
            type="number"
            style={inputStyle}
            value={formData.quantity}
            onChange={(e) =>
              setFormData({
                ...formData,
                quantity: parseInt(e.target.value)
              })
            }
          />
        </div>

        <div>
          <label style={{ fontSize: 13, color: '#666' }}>
            Batch Number
          </label>
          <input
            style={inputStyle}
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
        style={{ ...primaryBtn, marginTop: 20, width: '100%' }}
      >
        Add to Stock
      </button>
    </form>
  );
}

/* =========================
   ADD EXPENSE FORM
========================= */

export function AddExpenseForm({ onAdd }) {
  const [formData, setFormData] = useState({
    category: 'Rent',
    amount: 0,
    description: ''
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    onAdd(formData);

    setFormData({
      category: 'Rent',
      amount: 0,
      description: ''
    });
  };

  return (
    <div style={cardStyle}>
      <h3 style={{ marginTop: 0, marginBottom: 20 }}>
        Add Expense
      </h3>

      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 13, color: '#666' }}>
            Category
          </label>
          <select
            style={inputStyle}
            value={formData.category}
            onChange={(e) =>
              setFormData({ ...formData, category: e.target.value })
            }
          >
            <option value="Rent">Rent</option>
            <option value="Electricity">Electricity</option>
            <option value="Tea">Tea</option>
            <option value="Shipping">Shipping</option>
            <option value="Misc">Misc</option>
          </select>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 13, color: '#666' }}>
            Amount
          </label>
          <input
            type="number"
            style={inputStyle}
            value={formData.amount}
            onChange={(e) =>
              setFormData({
                ...formData,
                amount: parseFloat(e.target.value)
              })
            }
          />
        </div>

        <button
          type="submit"
          style={{ ...primaryBtn, width: '100%' }}
        >
          Save Expense
        </button>
      </form>
    </div>
  );
}
