// Load environment variables from .env.local and .env
import dotenv from 'dotenv'
import path from 'path'

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })
dotenv.config()

// jest-dom adds custom jest matchers for asserting on DOM nodes.
// We import it directly in each test file that needs DOM matchers.
export {}