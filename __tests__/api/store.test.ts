describe('Store API - Business Logic', () => {
  const getStoreInitials = (storeName: string): string => {
    return storeName
      .trim()
      .split(/\s+/)
      .map(word => word[0]?.toUpperCase() || '')
      .join('')
      .slice(0, 3)
  }

  const generatePassword = (ownerName: string): string => {
    const name = ownerName.trim().split(/\s+/)[0]
    return `${name}123`
  }

  const generateUsername = (partnerName: string, storeName: string): string => {
    const storeInitials = getStoreInitials(storeName)
    return `${partnerName.trim().replace(/\s+/g, '')}${storeInitials}`.toLowerCase()
  }

  test('should generate store initials from store name', () => {
    expect(getStoreInitials('Trendy Wear Main')).toBe('TWM')
    expect(getStoreInitials('  North   Outlet  ')).toBe('NO')
    expect(getStoreInitials('Main Branch Warehouse Extra')).toBe('MBW')
  })

  test('should generate a simple password from partner first name', () => {
    expect(generatePassword('Ali Khan')).toBe('Ali123')
    expect(generatePassword('  Sara  Ahmed  ')).toBe('Sara123')
  })

  test('should generate lowercase username from partner and store initials', () => {
    expect(generateUsername('Ali Khan', 'Trendy Wear Main')).toBe('alikhanTWM'.toLowerCase())
    expect(generateUsername('  Sara  Ahmed  ', 'North Outlet')).toBe('saraahmedno')
  })

  test('should sort Trendy Wear Main accounts before store accounts', () => {
    const accountsMap = {
      storeUser: { storeName: 'North Outlet' },
      adminUser: { storeName: 'Trendy Wear Main' },
      secondStore: { storeName: 'South Outlet' },
    }

    const sortedAccountsMap: Record<string, any> = {}
    const adminEntries = Object.entries(accountsMap).filter(([, v]) => v.storeName === 'Trendy Wear Main')
    const storeEntries = Object.entries(accountsMap).filter(([, v]) => v.storeName !== 'Trendy Wear Main')
    ;[...adminEntries, ...storeEntries].forEach(([key, value]) => {
      sortedAccountsMap[key] = value
    })

    expect(Object.keys(sortedAccountsMap)).toEqual(['adminUser', 'storeUser', 'secondStore'])
  })
})
