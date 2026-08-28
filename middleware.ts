import { NextRequest, NextResponse } from 'next/server'

/**
 * Global inventory cutover shim.
 *
 * During migration only the sale write path is switched immediately. Reads and
 * legacy return/refund/edit/delete handlers remain available until their own
 * verification gates pass.
 *
 * A new allotment must never be creatable once the global engine is enabled.
 * Blocking the API as well as removing the UI prevents a hidden/old client from
 * continuing to create store-owned inventory.
 */
export function middleware(request: NextRequest) {
  if (request.method === 'POST' && request.nextUrl.pathname === '/api/orders') {
    const url = request.nextUrl.clone()
    url.pathname = '/api/global-sale'
    return NextResponse.rewrite(url)
  }

  if (request.method === 'POST' && request.nextUrl.pathname === '/api/storeInventory') {
    return NextResponse.json(
      {
        error: 'Inventory allotment is retired. Stores sell from global inventory.',
        code: 'STORE_ALLOTMENT_RETIRED',
      },
      { status: 410 },
    )
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/api/orders', '/api/storeInventory'],
}
