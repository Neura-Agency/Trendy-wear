import { NextRequest } from 'next/server'
import { middleware } from '../../middleware'

describe('global inventory migration boundary', () => {
  it('routes POST /api/orders to the atomic global sale engine', () => {
    const request = new NextRequest('http://localhost/api/orders', { method: 'POST' })
    const response = middleware(request)
    expect(response.headers.get('x-middleware-rewrite')).toContain('/api/global-sale')
  })

  it('rejects new store allotments at the API boundary', async () => {
    const request = new NextRequest('http://localhost/api/storeInventory', { method: 'POST' })
    const response = middleware(request)
    expect(response.status).toBe(410)
    expect(await response.json()).toEqual({
      error: 'Inventory allotment is retired. Stores sell from global inventory.',
      code: 'STORE_ALLOTMENT_RETIRED',
    })
  })

  it('does not intercept GET reads during the migration window', () => {
    const request = new NextRequest('http://localhost/api/orders', { method: 'GET' })
    const response = middleware(request)
    expect(response.headers.get('x-middleware-next')).toBe('1')
  })
})
