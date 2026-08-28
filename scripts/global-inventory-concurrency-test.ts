/**
 * Real API concurrency / retry harness for the global inventory cutover.
 *
 * Usage:
 *   BASE_URL=https://your-app.example.com \
 *   STORE_A_COOKIE='tw_session=...' \
 *   STORE_B_COOKIE='tw_session=...' \
 *   PRODUCT_ID='...' \
 *   PRODUCT_NAME='...' \
 *   node --import ts-node/register scripts/global-inventory-concurrency-test.ts
 *
 * This intentionally exercises POST /api/orders, which the migration middleware
 * routes to the atomic global sale engine.
 */

const baseUrl = process.env.BASE_URL
const storeACookie = process.env.STORE_A_COOKIE
const storeBCookie = process.env.STORE_B_COOKIE
const productId = process.env.PRODUCT_ID
const productName = process.env.PRODUCT_NAME

if (!baseUrl || !storeACookie || !storeBCookie || !productId || !productName) {
  throw new Error('BASE_URL, STORE_A_COOKIE, STORE_B_COOKIE, PRODUCT_ID and PRODUCT_NAME are required')
}

async function sale(cookie: string, quantity: number, key: string) {
  const response = await fetch(`${baseUrl}/api/orders`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      cookie,
      'idempotency-key': key,
    },
    body: JSON.stringify({
      productId,
      productName,
      quantity,
      sellingPrice: 100,
      orderType: 'Sale',
    }),
  })
  return { status: response.status, body: await response.json() }
}

async function main() {
  console.log('Test A: inventory=1, two stores each buy 1')
  const a = await sale(storeACookie!, 1, `concurrency-a-${Date.now()}-a`)
  const b = await sale(storeBCookie!, 1, `concurrency-a-${Date.now()}-b`)
  console.log({ a, b })

  console.log('Test B: concurrent 7 + 7 against a 10-unit baseline')
  const keyBase = `concurrency-b-${Date.now()}`
  const [c, d] = await Promise.all([
    sale(storeACookie!, 7, `${keyBase}-a`),
    sale(storeBCookie!, 7, `${keyBase}-b`),
  ])
  console.log({ c, d })

  console.log('Test C: same request concurrently twice')
  const retryKey = `duplicate-${Date.now()}`
  const [e, f] = await Promise.all([
    sale(storeACookie!, 1, retryKey),
    sale(storeACookie!, 1, retryKey),
  ])
  console.log({ e, f })
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
