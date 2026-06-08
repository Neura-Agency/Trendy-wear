
const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'components', 'Modals.tsx');
let content = fs.readFileSync(filePath, 'utf8');

// FIX 1: Add missing returnSizeQuantities / returnColorQuantities / returnVariantQuantities
// to SaleRefundModalProps so the modal can correctly subtract previously returned quantities.
const oldProps = `export interface SaleRefundModalProps {
    order: {
        id: string;
        productName: string;
        storeName: string;
        quantity: number;
        sellingPrice: number;
        costPrice: number;
        sizeQuantities?: Record<string, number> | null;
        colorQuantities?: Record<string, number> | null;
        variantQuantities?: VariantQuantities | null;
        returnQuantity?: number | null;
        refundQuantity?: number | null;
        refundSizeQuantities?: Record<string, number> | null;
        refundColorQuantities?: Record<string, number> | null;
        refundVariantQuantities?: VariantQuantities | null;
    };`;

const newProps = `export interface SaleRefundModalProps {
    order: {
        id: string;
        productName: string;
        storeName: string;
        quantity: number;
        sellingPrice: number;
        costPrice: number;
        sizeQuantities?: Record<string, number> | null;
        colorQuantities?: Record<string, number> | null;
        variantQuantities?: VariantQuantities | null;
        returnQuantity?: number | null;
        returnSizeQuantities?: Record<string, number> | null;
        returnColorQuantities?: Record<string, number> | null;
        returnVariantQuantities?: VariantQuantities | null;
        refundQuantity?: number | null;
        refundSizeQuantities?: Record<string, number> | null;
        refundColorQuantities?: Record<string, number> | null;
        refundVariantQuantities?: VariantQuantities | null;
    };`;

if (!content.includes(oldProps)) {
    console.error('FIX 1 FAILED: Could not find SaleRefundModalProps interface');
    process.exit(1);
}
content = content.replace(oldProps, newProps);
console.log('FIX 1 applied: Added return quantity fields to SaleRefundModalProps');

// FIX 2: Fix initial refundQty state - "remainingQty || order.quantity" falls back
// to the ORIGINAL quantity (2) when remainingQty=0 (1 already returned), so the 
// modal opens pre-filled with 2 instead of 0/1.
const oldRefundQtyState = `    const [refundQty, setRefundQty] = useState(remainingQty || order.quantity);`;
const newRefundQtyState = `    const [refundQty, setRefundQty] = useState(Math.max(1, remainingQty));`;

if (!content.includes(oldRefundQtyState)) {
    console.error('FIX 2 FAILED: Could not find refundQty useState');
    process.exit(1);
}
content = content.replace(oldRefundQtyState, newRefundQtyState);
console.log('FIX 2 applied: Fixed refundQty initial value to use remainingQty');

// FIX 3: Fix the input max/onChange to enforce remainingQty ceiling (not order.quantity)
const oldRefundInput = `                            type="number" min={1} max={remainingQty || order.quantity}
                            value={effectiveRefundQty}
                            readOnly={hasVariantGrid}
                            onChange={e => setRefundQty(Math.min(remainingQty || order.quantity, Math.max(1, Number(e.target.value))))}
                            style={hasVariantGrid ? { width: '100%', background: 'var(--surface-2)', cursor: 'default' } : { width: '100%' }}`;

const newRefundInput = `                            type="number" min={1} max={remainingQty}
                            value={effectiveRefundQty}
                            readOnly={hasVariantGrid}
                            onChange={e => setRefundQty(Math.min(remainingQty, Math.max(1, Number(e.target.value))))}
                            style={hasVariantGrid ? { width: '100%', background: 'var(--surface-2)', cursor: 'default' } : { width: '100%' }}`;

if (!content.includes(oldRefundInput)) {
    console.error('FIX 3 FAILED: Could not find refund input element');
    process.exit(1);
}
content = content.replace(oldRefundInput, newRefundInput);
console.log('FIX 3 applied: Fixed refund input max to use remainingQty');

// FIX 4: Fix the "(max N)" label to display remainingQty, not order.quantity
const oldLabel = `                            Refund Quantity <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(max {remainingQty || order.quantity})</span>`;
const newLabel = `                            Refund Quantity <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(max {remainingQty})</span>`;

if (!content.includes(oldLabel)) {
    console.error('FIX 4 FAILED: Could not find Refund Quantity label');
    process.exit(1);
}
content = content.replace(oldLabel, newLabel);
console.log('FIX 4 applied: Fixed label to show correct max');

// Write back
fs.writeFileSync(filePath, content, 'utf8');
console.log('\nAll 4 fixes applied successfully to components/Modals.tsx!');
console.log('You can now delete this patch_modals.js file.');
