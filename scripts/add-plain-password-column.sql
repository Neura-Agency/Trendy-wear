-- Add plain_password column to accounts table for admin visibility
-- This allows admins to see and reset passwords easily

-- Add column if it doesn't exist
ALTER TABLE public.accounts 
ADD COLUMN IF NOT EXISTS plain_password text;

-- Update existing accounts to have plain_password set
-- Note: For existing accounts without plain_password, you may want to reset them manually
-- or generate new passwords using the following approach:

-- Example: Update specific accounts with their passwords
-- UPDATE public.accounts SET plain_password = 'Yahya123' WHERE username = 'yahya';
-- UPDATE public.accounts SET plain_password = 'Bilal123' WHERE username = 'bilal';

-- You can also set a default temporary password for all accounts that don't have one
UPDATE public.accounts 
SET plain_password = 'ChangeMe123' 
WHERE plain_password IS NULL OR plain_password = '';

COMMENT ON COLUMN public.accounts.plain_password IS 'Plain text password for admin visibility and password resets';
