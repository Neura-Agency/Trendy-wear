# Supabase Setup Guide for Trendy Wear ERP

## 1. Create Supabase Project

1. Go to [https://supabase.com](https://supabase.com)
2. Sign up/Login and create a new project
3. Choose a database password and region
4. Wait for project to be ready

## 2. Set Up Database Schema

1. Go to your Supabase dashboard
2. Navigate to **SQL Editor** in the left sidebar
3. Copy and paste the contents of `supabase-schema.sql` 
4. Click **Run** to execute the schema

## 3. Install Dependencies

```bash
npm install @supabase/supabase-js bcryptjs
npm install -D @types/bcryptjs
```

## 4. Environment Variables

1. Copy `.env.supabase` to `.env.local`:
   ```bash
   cp .env.supabase .env.local
   ```

2. Get your Supabase credentials from **Settings > API**:
   - Project URL
   - Anon public key  
   - Service role key

3. Update `.env.local` with your actual values

## 5. Migrate Existing Data

Run the migration script to transfer data from `data.json`:

```bash
npx ts-node scripts/migrate-to-supabase.ts
```

## 6. Update API Routes

Replace your existing API routes with Supabase versions:

- `pages/api/auth.ts` → use `pages/api/auth-supabase.ts`
- Update other API routes to use Supabase client
- Remove dependency on `lib/dataStore.ts`

## 7. Vercel Environment Variables

In your Vercel dashboard, add these environment variables:

```
NEXT_PUBLIC_SUPABASE_URL=your-project-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

## 8. Test Your Setup

1. Start your development server: `npm run dev`
2. Try logging in with existing credentials
3. Test creating orders, managing inventory, etc.
4. Check Supabase dashboard to verify data is being stored

## 9. Deploy to Vercel

```bash
git add .
git commit -m "🔄 Migrate to Supabase database"
git push
```

Your app should now work on Vercel with persistent data storage!

## Troubleshooting

- **Login issues**: Check password hashing in migration script
- **API errors**: Verify environment variables are set correctly
- **RLS policies**: Customize Row Level Security based on your needs
- **Performance**: Add indexes for frequently queried columns

## Security Notes

- RLS policies are basic - customize them for your security requirements
- Use strong passwords for production accounts
- Regularly backup your Supabase database
- Monitor usage and set up alerts in Supabase dashboard