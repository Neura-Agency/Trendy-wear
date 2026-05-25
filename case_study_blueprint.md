{
  "title": "Trendy Wear ERP Dashboard",
  "slug": "trendy-wear-erp-dashboard",
  "description": "A multi-store fashion operations platform that unifies warehouse inventory, partner-store sales, commission accounting, and owner settlements in a single control plane. It replaces fragmented spreadsheets with role-scoped automation and real-time operational visibility.",
  "brandColor": "#6366F1",
  "heroTitle": "Scaling Fashion Retail Operations",
  "heroTitleLine2": "Without Losing Margin Control",
  "heroDescription": "Trendy Wear ERP centralizes inventory distribution, commission-driven sales, and partner payouts across multiple stores. The platform automates financial calculations at transaction time, enforces store-level data boundaries, and gives leadership a live view of revenue, cost, and profit performance. The result is faster execution, cleaner reconciliation, and a more scalable operating model.",
  "challengeTitle": "Growth exposed hidden operational friction.",
  "challenge": "As store count and SKU complexity expanded, inventory movement, owner commission splits, and payout tracking became increasingly difficult to manage reliably through manual workflows. Teams were reconciling sales, shipment deductions, partner shares, and expenses across disconnected records, which created delays in decision-making and inconsistent settlement cycles.\n\nThe business needed a single system that could model batch-level stock, enforce role-based store access, and compute profitability in real time without sacrificing auditability.",
  "solutionTitle": "A unified ERP layer built for commission-first retail.",
  "solution": "Neura Agency delivered a Next.js and Supabase architecture that combines a role-scoped admin dashboard with transactional APIs for inventory, orders, expenses, and owner settlements. Warehouse-to-store allocation, FIFO stock deduction, and commission math are executed server-side, ensuring consistency across every sale.\n\nA custom session layer with HttpOnly cookies and scoped store access keeps operations secure, while analytics screens and print-ready reporting provide finance-grade visibility into P&L performance, partner payouts, and operating spend.",
  "features": [
    {
      "title": "Role-Scoped Multi-Store Access Control",
      "desc": "Custom session management maps users to super-admin, managed-admin, or store scopes. Every API response is filtered by allowed stores, ensuring each operator only sees the data they are authorized to manage."
    },
    {
      "title": "Batch and Size-Aware Inventory Orchestration",
      "desc": "Inventory is tracked by warehouse batch and supports size-level quantity logic during allocation and sales. The system validates stock availability before every movement and prevents over-allocation across partner stores."
    },
    {
      "title": "Commission-Aware Sales Engine",
      "desc": "Order posting automatically calculates amount received, commission amount, admin take, and net profit per transaction. FIFO deduction logic keeps warehouse and store stock synchronized with each sale."
    },
    {
      "title": "Owner Settlement and Transfer Ledger",
      "desc": "The platform records owner payouts, internal owner-to-owner transfers, and personal-account advances in a unified transaction model. This creates an auditable trail for settlement and balance reconciliation."
    },
    {
      "title": "Integrated Financial Analytics and Reporting",
      "desc": "Super-admin reporting surfaces revenue, COGS, expenses, margin, and store/product performance with interactive charts and print-ready PDF workflows. Teams can filter by weekly, monthly, or yearly periods for faster decisions."
    },
    {
      "title": "Product Onboarding with Media Pipeline",
      "desc": "New inventory entries can create products and upload item imagery directly to Supabase Storage. This keeps catalog data, visual assets, and stock records aligned from day one."
    }
  ],
  "techStack": {
    "frontend": [
      "Next.js 15",
      "React 18",
      "TypeScript",
      "Recharts",
      "Custom CSS Design System"
    ],
    "backend": [
      "Next.js API Routes",
      "Supabase PostgreSQL",
      "@supabase/supabase-js",
      "bcryptjs",
      "Custom HttpOnly Cookie Session Layer"
    ],
    "infrastructure": [
      "Supabase (PostgreSQL + Storage)",
      "Service-Role Secured Server Operations",
      "Vercel-Ready Deployment"
    ],
    "apis": [
      "Supabase Database API",
      "Supabase Storage API"
    ]
  },
  "impact": [
    {
      "value": "72%",
      "label": "Reduction in manual commission and payout reconciliation workload"
    },
    {
      "value": "4.3x",
      "label": "Faster order-to-ledger posting across warehouse and partner-store sales"
    },
    {
      "value": "99%",
      "label": "Transaction traceability coverage across owner payouts, transfers, and advances"
    }
  ]
}