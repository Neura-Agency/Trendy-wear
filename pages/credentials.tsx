import { useState, useEffect, useCallback } from 'react';
import SectionCard from '../components/SectionCard';
import Badge from '../components/Badge';
import Login from '../components/Login';
import { PageProps, Account, Store } from '../types';

export default function ShopCredentials({ user, onLogin }: PageProps) {
    const [data, setData] = useState<{ accounts: Record<string, Account>; stores: Record<string, Store> }>({ accounts: {}, stores: {} });
    const [loading, setLoading] = useState<boolean>(true);

    const refresh = useCallback(async () => {
        try {
            const res = await fetch("/api/store");
            const d = await res.json();
            setData({
                accounts: d.accounts || {},
                stores: d.stores || {}
            });
        } catch (e) {
            console.error(e);
            setData({ accounts: {}, stores: {} });
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (!user) return;
        if (user.role !== 'admin') {
            setLoading(false);
            return;
        }
        refresh();
    }, [user, refresh]);

    if (!user) return <Login onLogin={onLogin} />;
    if (loading) return <div className="loading">Loading...</div>;
    if (user.role !== 'admin') {
        return <div style={{ padding: 40, textAlign: 'center' }}>Access Denied. Admins only.</div>;
    }

    const isSuperAdmin = user.scope === 'all';

    // Filter credentials based on admin scope
    const filteredAccounts = Object.entries(data.accounts || {}).filter(([username, acc]) => {
        if (isSuperAdmin) return true; // Yahya sees all
        if (user.managedStores?.includes(acc.storeName)) return true; // Bilal sees his managed stores
        return false;
    });

    return (
        <>
            <div className="credentials-page">
                <header className="page-header">
                    <div className="header-content">
                        <div className="header-titles">
                            <h1 className="main-title">Shop Credentials</h1>
                            <p className="subtitle">
                                Manage login access for <span className="highlight">{isSuperAdmin ? 'all' : 'your'}</span> shop partners
                            </p>
                        </div>
                    </div>
                </header>

                <SectionCard title="Active Store Accounts" icon="🔑">
                    <div className="table-wrap">
                        <table>
                            <thead>
                                <tr>
                                    <th>Store Name</th>
                                    <th>Username (User ID)</th>
                                    <th>Password</th>
                                    <th>Role</th>
                                    <th>Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredAccounts.length === 0 ? (
                                    <tr><td colSpan={5} style={{ textAlign: 'center', padding: 40 }} className="text-muted">No managed store accounts found.</td></tr>
                                ) : (
                                    filteredAccounts.map(([username, acc]) => (
                                        <tr key={username}>
                                            <td className="store-name-cell">{acc.storeName}</td>
                                            <td>
                                                <code className="credential-code">{username}</code>
                                            </td>
                                            <td>
                                                <code className="credential-code primary">{acc.password}</code>
                                            </td>
                                            <td>
                                                <Badge type={acc.role === 'admin' ? 'blue' : 'purple'}>{acc.role}</Badge>
                                            </td>
                                            <td><Badge type="green">Active</Badge></td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </SectionCard>
            </div>

            <style jsx>{`
                .credentials-page {
                    animation: slideUp 0.6s cubic-bezier(0.16, 1, 0.3, 1);
                }
                @keyframes slideUp { 
                    from { opacity: 0; transform: translateY(20px); } 
                    to { opacity: 1; transform: translateY(0); } 
                }
                .store-name-cell {
                    font-weight: 700;
                    color: var(--pri-900);
                }
                .credential-code {
                    font-family: 'JetBrains Mono', 'IBM Plex Mono', 'Cascadia Code', monospace;
                    font-size: 13px;
                    font-weight: 500;
                    color: var(--text-body);
                    background: var(--surface-2);
                    padding: 4px 8px;
                    border-radius: 6px;
                    border: 1px solid var(--border);
                }
                .credential-code.primary {
                    color: var(--acc);
                    border-color: var(--acc-soft);
                    background: var(--acc-soft);
                }
            `}</style>
        </>
    );
}
