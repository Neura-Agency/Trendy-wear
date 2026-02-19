import { useState, useEffect, useCallback } from 'react';
import Layout from '../components/Layout';
import SectionCard from '../components/SectionCard';
import Badge from '../components/Badge';

export default function ShopCredentials() {
    const [user, setUser] = useState(null);
    const [data, setData] = useState({ accounts: {}, stores: {} });
    const [loading, setLoading] = useState(true);

    const refresh = useCallback(async () => {
        try {
            const res = await fetch("/api/store");
            const d = await res.json();
            setData(d);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        const u = JSON.parse(localStorage.getItem('user'));
        if (u) setUser(u);
        refresh();
    }, [refresh]);

    if (loading) return <div className="loading">Loading...</div>;
    if (!user || user.role !== 'admin') {
        return <div style={{ padding: 40, textAlign: 'center' }}>Access Denied. Admins only.</div>;
    }

    const isSuperAdmin = user.scope === 'all';

    // Filter credentials based on admin scope
    const filteredAccounts = Object.entries(data.accounts).filter(([username, acc]) => {
        if (acc.role !== 'store') return false; // Only show store accounts
        if (isSuperAdmin) return true; // Yahya sees all
        if (user.managedStores?.includes(acc.storeName)) return true; // Bilal sees his managed stores
        return false;
    });

    return (
        <Layout user={user} onLogout={() => {
            setUser(null);
            localStorage.removeItem('user');
            window.location.href = '/';
        }}>
            <div className="credentials-page">
                <header className="page-header" style={{ marginBottom: 32 }}>
                    <h1 style={{ fontSize: '2.5rem', fontWeight: 800, letterSpacing: '-0.025em', marginBottom: 4 }}>
                        Shop Credentials
                    </h1>
                    <p className="text-muted">
                        Manage login access for {isSuperAdmin ? 'all' : 'your'} shop partners
                    </p>
                </header>

                <SectionCard title="Active Store Accounts" icon="🔑">
                    <div className="table-wrap">
                        <table>
                            <thead>
                                <tr>
                                    <th>Store Name</th>
                                    <th>Username (User ID)</th>
                                    <th>Password</th>
                                    <th>Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredAccounts.length === 0 ? (
                                    <tr><td colSpan="4" style={{ textAlign: 'center', padding: 40 }} className="text-muted">No managed store accounts found.</td></tr>
                                ) : (
                                    filteredAccounts.map(([username, acc]) => (
                                        <tr key={username}>
                                            <td className="font-bold" style={{ color: 'var(--pri-900)' }}>{acc.storeName}</td>
                                            <td className="font-mono" style={{ fontWeight: 600 }}>{username}</td>
                                            <td className="font-mono" style={{ color: 'var(--acc)', fontWeight: 600 }}>{acc.password}</td>
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
                    animation: fadeIn 0.4s ease-out;
                }
                @keyframes fadeIn {
                    from { opacity: 0; transform: translateY(10px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                .font-mono {
                    font-family: 'Courier New', Courier, monospace;
                    background: var(--surface-2);
                    padding: 4px 8px;
                    border-radius: 4px;
                }
            `}</style>
        </Layout>
    );
}
