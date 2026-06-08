# Shop Credentials Admin Feature

## Overview
Added admin functionality to manage shop credentials including:
- Change passwords
- Update user roles (admin/store)
- Activate/deactivate accounts

## Database Migration Required

Before using this feature, you need to add the `plain_password` column to the `accounts` table:

### Step 1: Run the SQL Migration

In your Supabase dashboard:
1. Go to **SQL Editor**
2. Run the migration script located at: `scripts/add-plain-password-column.sql`

Alternatively, run this SQL directly:

```sql
ALTER TABLE public.accounts 
ADD COLUMN IF NOT EXISTS plain_password text;

UPDATE public.accounts 
SET plain_password = 'ChangeMe123' 
WHERE plain_password IS NULL OR plain_password = '';

COMMENT ON COLUMN public.accounts.plain_password IS 'Plain text password for admin visibility and password resets';
```

### Step 2: Update Existing Account Passwords

After adding the column, you should update the `plain_password` for existing accounts:

```sql
-- Update with actual passwords for each account
UPDATE public.accounts SET plain_password = 'Yahya123' WHERE username = 'yahya';
UPDATE public.accounts SET plain_password = 'Bilal123' WHERE username = 'bilal';
-- etc...
```

## Features

### For Super Admin (scope='all')
- View all store accounts
- Edit password, role, and status for any account
- Can promote store users to admin or demote admins to store role
- Can activate/deactivate accounts

### For Regular Admin
- View only managed store accounts
- Edit password, role, and status for managed stores
- Same editing capabilities as super admin but limited to their scope

## Usage

1. Navigate to **Shop Credentials** page
2. Click the **Edit** button next to any account
3. Modify any of the following:
   - **Password**: Enter a new password (leave blank to keep current)
   - **Role**: Select 'admin' or 'store'
   - **Status**: Select 'Active' or 'Inactive'
4. Click **Save Changes**

## Files Changed

### New Files
- `pages/api/accounts.ts` - API endpoint for updating account credentials
- `scripts/add-plain-password-column.sql` - Database migration script

### Modified Files
- `pages/credentials.tsx` - Added edit modal and functionality
- `pages/api/store.ts` - Added `is_active` field to account response
- `types/index.ts` - Added `isActive` field to Account interface

## Security Notes

⚠️ **Important**: The `plain_password` field stores passwords in plain text for admin convenience. Ensure:
- Only admins have access to this page
- Protect your Supabase service role key
- Consider rotating passwords regularly
- Use strong passwords for production

## API Endpoints

### PATCH /api/accounts
Update account credentials

**Request Body:**
```json
{
  "username": "bilaltw",
  "password": "NewPassword123",  // optional
  "role": "admin",               // optional: 'admin' | 'store'
  "isActive": true               // optional: true | false
}
```

**Response:**
```json
{
  "success": true,
  "account": {
    "id": "...",
    "username": "bilaltw",
    "role": "admin",
    "is_active": true
  }
}
```

## Troubleshooting

### "Failed to update account" error
- Check that the `plain_password` column exists in the accounts table
- Verify admin permissions
- Check Supabase logs for detailed error messages

### Password not updating
- Ensure you're entering a non-empty password
- Check that the account username is correct
- Verify the API endpoint is accessible

### Status not changing
- Refresh the page after making changes
- Check browser console for any errors
- Verify the `is_active` column exists in the database
