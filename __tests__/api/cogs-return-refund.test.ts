import { NextRequest } from 'next/server'
import { middleware } from '../../middleware'

describe('global inventory migration boundary', () => {
  test.each(['POST', 'PATCH', 'DELETE'])('rejects %s /api/storeInventory mutation', async (method) => {
    const request = new NextRequest('http://localhost/api/storeInventory', { method })
    const response = middleware(request)
    expect(response.status).toBe(410)
    expect(await response.json()).toMatchObject({ code: 'STORE_ALLOTMENT_RETIRED' })
  })
  it('routes new sales through the global sale endpoint', () => {
    const request = new NextRequest('http://localhost/api/orders', { method: 'POST' })
    const response = middleware(request)
    expect(response.headers.get('x-middleware-rewrite')).toContain('/api/global-sale')
  })
})
