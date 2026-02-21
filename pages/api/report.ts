import type { NextApiRequest, NextApiResponse } from 'next';
import PDFDocument from 'pdfkit';

import datastore from '../../lib/dataStore';

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const now = new Date();

  // If POST, accept orders/expenses/stores from body (filtered report request)
  let orders = [];
  let expenses = [];
  let stores = {};
  if (req.method === 'POST') {
    const body = req.body || {};
    orders = body.orders || [];
    expenses = body.expenses || [];
    stores = body.stores || {};
  } else if (req.method === 'GET') {
    const data = datastore.getAll();
    orders = data.orders || [];
    expenses = data.expenses || [];
    stores = data.stores || {};
  } else {
    return res.status(405).end();
  }

  const totalSales = orders.reduce((s, o) => s + (o.sellingPrice * o.quantity || 0), 0);
  const totalCost  = orders.reduce((s, o) => s + (o.costPrice * o.quantity || 0), 0);
  const totalComm  = orders.reduce((s, o) => s + (o.commissionAmount || 0), 0);
  const totalExp   = expenses.reduce((s, e) => s + (e.amount || 0), 0);
  const profitBeforeDelivery = totalSales - totalCost - totalComm;
  const totalDeliveryFees = orders.reduce((s, o) => s + (o.shipmentCost || 0), 0);
  const deliveryCount = orders.filter(o => (o.shipmentCost || 0) > 0).length;
  const profitAfterDelivery = profitBeforeDelivery - totalDeliveryFees;
  const netProfit  = profitAfterDelivery - totalExp;
  const totalItemsSold = orders.reduce((s, o) => s + (o.quantity || 0), 0);
  const uniqueProducts = new Set((orders || []).map(o => o.productName).filter(Boolean)).size;

  const storeNames = Object.keys(stores || {});

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename=report-${now.toISOString().slice(0,10)}.pdf`);

  const doc = new PDFDocument({ margin: 50, size: 'A4' });
  doc.pipe(res);

  const PRI = '#1e293b';
  const ACC = '#3b82f6';
  const COL_W = 495;

  // ── Header ────────────────────────────────────────────
  doc.rect(50, 40, COL_W, 60).fill(PRI);
  doc.fillColor('white').fontSize(20).font('Helvetica-Bold')
     .text('Trendy Wears — Monthly Business Report', 60, 55);
  doc.fontSize(10).font('Helvetica')
     .text(`Generated: ${now.toLocaleString()}`, 60, 82);
  doc.moveDown(3);

  // ── Summary Table ────────────────────────────────────
  doc.fillColor(PRI).fontSize(14).font('Helvetica-Bold').text('Financial Summary', 50, 115);
  doc.moveTo(50, 133).lineTo(545, 133).strokeColor(ACC).lineWidth(1.5).stroke();

  const summaryRows = [
    ['Total Price',           `Rs. ${totalSales.toLocaleString()}`],
    ['Cost Price',            `Rs. ${totalCost.toLocaleString()}`],
    ['Platform Fee',          `Rs. ${totalComm.toLocaleString()}`],
    ['Delivery Fees',         `Rs. ${totalDeliveryFees.toLocaleString()}`],
    ['Delivery Count',        deliveryCount.toString()],
    ['Profit (Before Delivery)', `Rs. ${profitBeforeDelivery.toLocaleString()}`],
    ['Profit (After Delivery)', `Rs. ${profitAfterDelivery.toLocaleString()}`],
    ['Total Expenses',        `Rs. ${totalExp.toLocaleString()}`],
    ['Net Profit',            `Rs. ${netProfit.toLocaleString()}`],
    ['Total Orders',          orders.length.toString()],
    ['Total Items Sold',      totalItemsSold.toString()],
    ['Unique Products Sold',  uniqueProducts.toString()],
    ['Total Stores',          storeNames.length.toString()],
    ['Expense Count',         expenses.length.toString()],
  ];

  let y = 145;
  summaryRows.forEach(([label, value], i) => {
    if (i % 2 === 0) doc.rect(50, y - 4, COL_W, 20).fill('#f8fafc');
    doc.fillColor('#374151').fontSize(11).font('Helvetica').text(label, 60, y);
    doc.font('Helvetica-Bold').text(value, 360, y, { width: 180, align: 'right' });
    y += 22;
  });

  // ── Store Breakdown ──────────────────────────────────
  y += 15;
  doc.fillColor(PRI).fontSize(14).font('Helvetica-Bold').text('Store-wise Breakdown', 50, y);
  y += 22;
  doc.moveTo(50, y).lineTo(545, y).strokeColor(ACC).lineWidth(1.5).stroke();
  y += 12;

  const headers = ['Store', 'Orders', 'Sales', 'Commission', 'Payable', 'Status'];
  const colX = [55, 140, 220, 310, 400, 480];
  doc.fillColor(PRI).fontSize(10).font('Helvetica-Bold');
  headers.forEach((h, i) => doc.text(h, colX[i], y));
  y += 18;

  storeNames.forEach((storeName, sidx) => {
    const storeOrders = orders.filter(o => o.storeName === storeName);
    const sales = storeOrders.reduce((s, o) => s + (o.sellingPrice * o.quantity || 0), 0);
    const comm  = storeOrders.reduce((s, o) => s + (o.commissionAmount || 0), 0);
    const payable = sales - comm;

    if (sidx % 2 === 0) doc.rect(50, y - 3, COL_W, 18).fill('#f8fafc');
    doc.fillColor('#374151').fontSize(10).font('Helvetica');
    const storeData = [storeName, storeOrders.length, `Rs.${sales.toLocaleString()}`, `Rs.${comm.toLocaleString()}`, `Rs.${payable.toLocaleString()}`, stores[storeName]?.paid ? 'Paid' : 'Pending'];
    storeData.forEach((v, i) => doc.text(String(v), colX[i], y, { width: 80 }));
    y += 20;
  });

  // ── Expenses ─────────────────────────────────────────
  if (expenses.length > 0 && y < 650) {
    y += 15;
    doc.fillColor(PRI).fontSize(14).font('Helvetica-Bold').text('Expenses', 50, y);
    y += 22;
    doc.moveTo(50, y).lineTo(545, y).strokeColor(ACC).lineWidth(1.5).stroke();
    y += 12;

    expenses.slice(0, 15).forEach((e, i) => {
      if (i % 2 === 0) doc.rect(50, y - 3, COL_W, 18).fill('#f8fafc');
      doc.fillColor('#374151').fontSize(10).font('Helvetica');
      doc.text(e.category || 'Misc', 60, y);
      doc.text(e.description || '', 200, y, { width: 200 });
      doc.font('Helvetica-Bold').text(`Rs. ${(e.amount || 0).toLocaleString()}`, 430, y, { width: 110, align: 'right' });
      y += 20;
    });
  }

  // ── Footer ────────────────────────────────────────────
  doc.rect(50, 780, COL_W, 30).fill(PRI);
  doc.fillColor('white').fontSize(9).font('Helvetica')
     .text('Trendy Wears Business Management System — Confidential', 60, 791, { width: COL_W - 10, align: 'center' });

  doc.end();
}

