import type { HelpLang } from "./voice";

export interface HelpEntry {
  /** Short heading of the popover. */
  title?: string;
  /** What should I do here / what happens. 1–2 sentences. */
  what: string;
  /** Optional "Why?" — only where it genuinely helps. */
  why?: string;
  /** Optional CSS selector of an existing control to point at ("Show me"). */
  target?: string;
}

type HelpCatalog = Record<string, HelpEntry>;

/**
 * Contextual help copy, keyed by location id.
 * Language-ready: additional languages can be added next to `en`
 * without touching any component.
 */
const catalog: Partial<Record<HelpLang, HelpCatalog>> = {
  en: {
    /* ── Dashboard ── */
    "dashboard.kpis": {
      title: "Your business at a glance",
      what: "These totals summarise sales, costs, profit and stock for the period you have selected. Tap the Expenses card to see what makes up that number.",
      why: "Everything here is calculated from your recorded orders, so it changes as soon as sales, returns or expenses are added.",
    },
    "dashboard.storePartners": {
      title: "Store partners",
      what: "See how each partner shop is performing, assign items to them, or mark their orders as paid.",
    },
    "dashboard.partnerSales": {
      title: "Partner store sales",
      what: "Every order recorded by your partner shops. Use the period and shop filters to narrow the list, and open a row to see the full order.",
    },
    "dashboard.recordSale": {
      title: "Record a sale",
      what: "Enter the item, quantity and price for a sale you made. Saving it reduces the shop's stock and adds the sale to your revenue and profit figures.",
      why: "Recording sales here is what keeps stock counts and profit reports accurate.",
    },
    "dashboard.expensesSection": {
      title: "Money spent",
      what: "Costs recorded against this period. Add an expense to include it in the profit calculation for the same period.",
    },

    /* ── Inventory ── */
    "inventory.page": {
      title: "Stock & inventory",
      what: "Add stock to the warehouse, then allot it to the shops that will sell it. The two lists below show warehouse stock and stock already sitting with shops.",
    },
    "inventory.warehouse": {
      title: "Warehouse stock",
      what: "Add new items with their cost and quantity. Warehouse quantity drops each time you allot stock to a shop.",
      why: "Item cost recorded here is what the profit reports use as cost of goods.",
    },
    "inventory.storeStock": {
      title: "Stock with shops",
      what: "Stock you have handed over to each shop, with the price it should sell at. Use “Alot to Stores” to move more units from the warehouse.",
    },
    "inventory.gifts": {
      title: "Gifts & extras",
      what: "Extra units given to a shop free of charge. Their cost is counted as an expense, not as a sale.",
    },
    "inventory.allInventory": {
      title: "All warehouse inventory",
      what: "A read-only view of everything currently held in the warehouse, including what has already been supplied to shops.",
    },

    /* ── Direct sales ── */
    "directSales.page": {
      title: "Direct sales",
      what: "Sales you made yourself, without a partner shop. Record one to deduct the items from warehouse stock and count the full margin as your profit.",
      why: "No shop commission is applied to direct sales, so the profit share differs from partner orders.",
    },

    /* ── Profit partners ── */
    "owners.page": {
      title: "Profit partners",
      what: "Partners share the business profit by percentage. This page shows each partner's share, what they have already been paid, and what is still owed.",
    },
    "owners.split": {
      title: "Profit split",
      what: "Each partner's share is their percentage of the current net profit. Change a percentage only when the real agreement changes.",
    },
    "owners.payouts": {
      title: "Payouts",
      what: "Record money actually paid to a partner. The amount is deducted from their remaining share straight away.",
    },
    "owners.transfers": {
      title: "Owner transfers",
      what: "Money moved between partners or into the business. Recording a transfer keeps each partner's balance correct without touching profit.",
    },

    /* ── Expenses / returns / refunds / profit ── */
    "expenses.page": {
      title: "Expenses",
      what: "All costs pulled from your orders — item cost, shop commissions and shipment charges — plus anything you add manually.",
      why: "These costs are subtracted from revenue to give the net profit shown on the dashboard.",
    },
    "returns.page": {
      title: "Returns",
      what: "Orders where the item came back to the warehouse. The stock goes back in and the sale no longer counts towards revenue.",
    },
    "refunds.page": {
      title: "Refunds",
      what: "Orders where money was returned but the customer kept the item. Revenue is reversed while the stock stays sold.",
      why: "Keeping refunds separate from returns is what stops stock counts drifting.",
    },
    "profit.page": {
      title: "Profit analysis",
      what: "Revenue minus item cost, commissions, shipping and expenses, order by order. Use it to see which sales actually earned money.",
    },

    /* ── Reports & credentials ── */
    "reports.page": {
      title: "Reports",
      what: "Pick a period and filters, then print or save the report. Only the figures already recorded in the system are included.",
    },
    "credentials.page": {
      title: "Shop credentials",
      what: "Login accounts for each shop. Reveal a password only when you need to share it, and create a new account when a shop joins.",
      why: "Each shop only sees its own stock and sales when it signs in with these details.",
    },
  },
};

export function getHelp(id: string, lang: HelpLang = "en"): HelpEntry | null {
  return catalog[lang]?.[id] ?? catalog.en?.[id] ?? null;
}

export default catalog;
