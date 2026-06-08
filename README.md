# Trendy Wears - Single Page Unified Dashboard

This is a minimal Next.js demo implementing a Single-Page Multi-Store Business Management Dashboard.

Run locally:

```bash
npm install
npm run dev
```

Features implemented as a runnable demo:
- Single-page dashboard with admin/store login
- Orders, purchases, inventory, expenses APIs
- Server-Sent Events (SSE) for realtime updates
- Simple PDF monthly report generation using pdfkit

## Custom username/password auth (Option C)

This project uses a server-issued HttpOnly cookie session + a Supabase `accounts` table.

1) Run the SQL in `supabase-schema.sql` in Supabase SQL editor.
2) Ensure env vars are set (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`).
3) Create accounts:

```bash
npm run create-account -- yahya yahya123 admin "" all
npm run create-account -- trendy_shop shop123 store "Trendy Wear"
```
