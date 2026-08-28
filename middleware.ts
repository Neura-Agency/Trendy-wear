import { NextRequest, NextResponse } from 'next/server'

/**
 * Global inventory cutover shim.
 *
 * Only POST /api/orders is redirected to the new atomic global-inventory engine.
 * GET/PATCH/PUT/DELETE remain on the legacy orders route during the migration
 * monitoring period so returns, refunds, edits and deletion can be migrated
 * independently and verified before legacy retirement.
 */
export function middleware(request: NextRequest) {
  if (request.method === 'POST' && request.nextUrl.pathname === '/api/orders') {
    const url = request.nextUrl.clone()
    url.pathname = '/api/global-sale'
    return NextResponse.rewrite(url)
  }
  return NextResponse.next()
}

export const config = {
  matcher: ['/api/orders'],
}
