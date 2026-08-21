import { useState, useEffect, useCallback } from 'react';
import SectionCard from '../components/SectionCard';
import Badge from '../components/Badge';
import Login from '../components/Login';
import SearchBar from '../components/SearchBar';
import DetailModal from '../components/DetailModal';
import { PageProps, Account, Store } from '../types';
import ContextHelp from "../components/ContextHelp";
import PageSkeleton from "../components/Skeletons";

interface EditingAccount {
    username: string;
    originalUsername?: string;
    password?: string;
    role?: 'admin' | 'store';
    isActive?: boolean;
}

// ── SVG Icon (mono-color, inherits currentColor) ──
const keyIcon = <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m15.5 7.5 2.3 2.3a1 1 0 0 0 1.4 0l2.1-2.1a1 1 0 0 0 0-1.4L19 4"/><path d="m21 2-9.6 9.6"/><circle cx="7.5" cy="15.5" r="5.5"/></svg>;

export default function ShopCredentials({ user, onLogin }: PageProps) {
    const [data, setData] = useState<{ accounts: Record<string, Account>; stores: Record<string, Store> }>({ accounts: {}, stores: {} });
    const [loading, setLoading] = useState<boolean>(true);
    const [editingAccount, setEditingAccount] = useState<EditingAccount | null>(null);
    const [saving, setSaving] = useState<boolean>(false);
    const [accountStatuses, setAccountStatuses] = useState<Record<string, boolean>>({});
    const [search, setSearch] = useState('');
    const [detailAccount, setDetailAccount] = useState<{ username: string; account: Account } | null>(null);
    const [revealedPw, setRevealedPw] = useState<Record<string, string>>({});
    const [showPw, setShowPw] = useState<Record<string, boolean>>({});

    const revealPassword = async (username: string) => {
        try {
            const res = await fetch('/api/accounts/reveal', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to reveal password');
            setRevealedPw(prev => ({ ...prev, [username]: data.password || '' }));
            return (data.password as string) || '';
        } catch (e: any) {
            alert(e.message || 'Failed to reveal password');
            return '';
        }
    };

    const togglePassword = async (username: string) => {
        if (showPw[username]) {
            setShowPw(prev => ({ ...prev, [username]: false }));
            setRevealedPw(prev => {
                const next = { ...prev };
                delete next[username];
                return next;
            });
            return;
        }
        const pw = await revealPassword(username);
        if (pw) setShowPw(prev => ({ ...prev, [username]: true }));
    };


    const refresh = useCallback(async () => {
        try {
            const res = await fetch("/api/store");
            const d = await res.json();
            setData({
                accounts: d.accounts || {},
                stores: d.stores || {}
            });
            
            // Initialize account statuses from API data
            const statuses: Record<string, boolean> = {};
            Object.entries(d.accounts || {}).forEach(([username, account]: [string, any]) => {
                statuses[username] = account.isActive ?? true;
            });
            setAccountStatuses(statuses);
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

    const handleEdit = (username: string, account: Account) => {
        setEditingAccount({
            username,
            originalUsername: username,
            password: '',
            role: account.role,
            isActive: accountStatuses[username] ?? true
        });
    };

    const handleSave = async () => {
        if (!editingAccount) return;
        
        setSaving(true);
        try {
            const updates: any = {
                username: editingAccount.username,
                originalUsername: editingAccount.originalUsername || editingAccount.username
            };

            if (editingAccount.password && editingAccount.password.trim() !== '') {
                updates.password = editingAccount.password;
            }

            if (editingAccount.role) {
                updates.role = editingAccount.role;
            }

            if (typeof editingAccount.isActive === 'boolean') {
                updates.isActive = editingAccount.isActive;
            }

            const res = await fetch('/api/accounts', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updates)
            });

            if (!res.ok) {
                const error = await res.json();
                throw new Error(error.error || 'Failed to update account');
            }

            // Update local state (account key may have changed; refresh will normalize)
            setAccountStatuses(prev => {
                const next = { ...prev } as Record<string, boolean>;
                // remove old key if username changed
                if (editingAccount.originalUsername && editingAccount.originalUsername !== editingAccount.username) {
                    delete next[editingAccount.originalUsername];
                }
                next[editingAccount.username] = editingAccount.isActive ?? true;
                return next;
            });

            // Refresh data
            await refresh();
            setEditingAccount(null);
        } catch (e: any) {
            alert(e.message || 'Failed to update account');
        } finally {
            setSaving(false);
        }
    };

    const handleCancel = () => {
        setEditingAccount(null);
    };

    if (!user) return <Login onLogin={onLogin} />;
    if (loading) return <PageSkeleton label="Loading credentials" />;
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
                            <h1 className="main-title">Shop Credentials <ContextHelp id="credentials.page" /></h1>
                            <p className="subtitle">
                                Manage login access for <span className="highlight">{isSuperAdmin ? 'all' : 'your'}</span> shop partners
                            </p>
                        </div>
                    </div>
                </header>

                <SectionCard title="Active Store Accounts" icon={keyIcon}>
                    <SearchBar value={search} onChange={setSearch} placeholder="Search by store name, username…" resultCount={(() => {
                        if (!search) return filteredAccounts.length;
                        const q = search.toLowerCase();
                        return filteredAccounts.filter(([username, acc]) =>
                            acc.storeName?.toLowerCase().includes(q) || username?.toLowerCase().includes(q)
                        ).length;
                    })()} />
                    <div className="table-wrap">
                        <table className="desktop-table-view">
                            <thead>
                                <tr>
                                    <th>Store Name</th>
                                    <th>Username (User ID)</th>
                                    <th>Password</th>
                                    <th>Role</th>
                                    <th>Status</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {(() => {
                                    if (!search) return filteredAccounts;
                                    const q = search.toLowerCase();
                                    return filteredAccounts.filter(([username, acc]) =>
                                        acc.storeName?.toLowerCase().includes(q) || username?.toLowerCase().includes(q)
                                    );
                                })().length === 0 ? (
                                    <tr><td colSpan={6} style={{ textAlign: 'center', padding: 40 }} className="text-muted">{search ? 'No accounts match your search.' : 'No managed store accounts found.'}</td></tr>
                                ) : (
                                    (search
                                        ? filteredAccounts.filter(([username, acc]) => {
                                            const q = search.toLowerCase();
                                            return acc.storeName?.toLowerCase().includes(q) || username?.toLowerCase().includes(q);
                                          })
                                        : filteredAccounts
                                    ).map(([username, acc]) => (
                                        <tr key={username}>
                                            <td className="store-name-cell">{acc.storeName}</td>
                                            <td>
                                                <code className="credential-code">{username}</code>
                                            </td>
                                            <td>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                    <code className="credential-code primary">{showPw[username] && revealedPw[username] ? revealedPw[username] : '••••••••'}</code>
                                                    <button type="button" className="btn btn-sm btn-secondary" onClick={() => togglePassword(username)} style={{ fontSize: 10, padding: '3px 8px', whiteSpace: 'nowrap', minWidth: 46 }}>{showPw[username] ? 'Hide' : 'Show'}</button>
                                                </div>
                                            </td>
                                            <td>
                                                <Badge type={acc.role === 'admin' ? 'blue' : 'purple'}>{acc.role}</Badge>
                                            </td>
                                            <td>
                                                <Badge type={accountStatuses[username] !== false ? 'green' : 'red'}>
                                                    {accountStatuses[username] !== false ? 'Active' : 'Inactive'}
                                                </Badge>
                                            </td>
                                            <td>
                                                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                                    <button 
                                                        type="button"
                                                        className="btn btn-sm"
                                                        style={{ fontSize: 10, padding: '3px 10px', background: 'rgba(16,185,129,0.1)', color: '#059669', border: '1.5px solid rgba(16,185,129,0.25)' }}
                                                        onClick={() => setDetailAccount({ username, account: acc })}
                                                    >Detail</button>
                                                    <button 
                                                        className="btn btn-sm btn-secondary"
                                                        onClick={() => handleEdit(username, acc)}
                                                    >
                                                        Edit
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                            </table>
                            {/* ── Mobile card view ── */}
                            <div className="mobile-card-view">
                                {(() => {
                                    if (!search) return filteredAccounts;
                                    const q = search.toLowerCase();
                                    return filteredAccounts.filter(([username, acc]) =>
                                        acc.storeName?.toLowerCase().includes(q) || username?.toLowerCase().includes(q)
                                    );
                                })().length === 0 ? (
                                    <div style={{ textAlign: 'center', padding: 40 }} className="text-muted">{search ? 'No accounts match your search.' : 'No managed store accounts found.'}</div>
                                ) : (
                                    (() => {
                                        if (!search) return filteredAccounts;
                                        const q = search.toLowerCase();
                                        return filteredAccounts.filter(([username, acc]) =>
                                            acc.storeName?.toLowerCase().includes(q) || username?.toLowerCase().includes(q)
                                        );
                                    })().map(([username, acc]) => (
                                        <div className="mobile-card" key={username}>
                                            <div className="mobile-card-header">
                                                <span className="mobile-card-title">{acc.storeName}</span>
                                                <Badge type={accountStatuses[username] !== false ? 'green' : 'red'}>
                                                    {accountStatuses[username] !== false ? 'Active' : 'Inactive'}
                                                </Badge>
                                            </div>
                                            <div className="mobile-card-row">
                                                <span className="mobile-card-label">Username</span>
                                                <span className="mobile-card-value" style={{ fontFamily: 'monospace', fontSize: 12 }}>{username}</span>
                                            </div>
                                            <div className="mobile-card-row">
                                                <span className="mobile-card-label">Password</span>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                                    <span className="mobile-card-value" style={{ fontFamily: 'monospace', fontSize: 12 }}>{showPw[username] && revealedPw[username] ? revealedPw[username] : '••••••••'}</span>
                                                    <button type="button" className="btn btn-sm btn-secondary" onClick={() => togglePassword(username)} style={{ fontSize: 10, padding: '3px 8px', whiteSpace: 'nowrap', minWidth: 46 }}>{showPw[username] ? 'Hide' : 'Show'}</button>
                                                </div>
                                            </div>
                                            <div className="mobile-card-row">
                                                <span className="mobile-card-label">Role</span>
                                                <span className="mobile-card-value"><Badge type={acc.role === 'admin' ? 'blue' : 'purple'}>{acc.role}</Badge></span>
                                            </div>
                                            <div className="mobile-card-actions">
                                                <button type="button" className="btn btn-sm" style={{ fontSize: 10, padding: '4px 10px', background: 'rgba(16,185,129,0.1)', color: '#059669', border: '1.5px solid rgba(16,185,129,0.25)' }} onClick={() => setDetailAccount({ username, account: acc })}>Detail</button>
                                                <button className="btn btn-sm btn-secondary" onClick={() => handleEdit(username, acc)}>Edit</button>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                </SectionCard>
            </div>

            {/* Edit Account Modal */}
            {editingAccount && (
                <div className="modal-overlay" onClick={handleCancel}>
                    <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                        <h2>Edit Account - {editingAccount.username}</h2>
                        
                        <div className="form-group">
                            <label>Username</label>
                            <input
                                type="text"
                                placeholder="Enter username"
                                value={editingAccount.username || ''}
                                onChange={(e) => setEditingAccount({
                                    ...editingAccount,
                                    username: e.target.value
                                })}
                            />
                        </div>

                        <div className="form-group">
                            <label>New Password (leave blank to keep current)</label>
                            <input
                                type="text"
                                placeholder="Enter new password"
                                value={editingAccount.password || ''}
                                onChange={(e) => setEditingAccount({
                                    ...editingAccount,
                                    password: e.target.value
                                })}
                            />
                        </div>

                        <div className="form-group">
                            <label>Role</label>
                            <select
                                value={editingAccount.role}
                                onChange={(e) => setEditingAccount({
                                    ...editingAccount,
                                    role: e.target.value as 'admin' | 'store'
                                })}
                            >
                                <option value="store">Store</option>
                                <option value="admin">Admin</option>
                            </select>
                        </div>

                        <div className="form-group">
                            <label>Status</label>
                            <select
                                value={editingAccount.isActive ? 'active' : 'inactive'}
                                onChange={(e) => setEditingAccount({
                                    ...editingAccount,
                                    isActive: e.target.value === 'active'
                                })}
                            >
                                <option value="active">Active</option>
                                <option value="inactive">Inactive</option>
                            </select>
                        </div>

                        <div className="modal-actions">
                            <button 
                                className="btn btn-ghost" 
                                onClick={handleCancel}
                                disabled={saving}
                            >
                                Cancel
                            </button>
                            <button 
                                className="btn btn-primary" 
                                onClick={handleSave}
                                disabled={saving}
                            >
                                {saving ? 'Saving...' : 'Save Changes'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

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
                /* .edit-btn removed — using .btn.btn-sm.btn-secondary now */
                /* .cancel-btn and .save-btn removed — using .btn.btn-ghost and .btn.btn-primary now */
                .modal-overlay {
                    position: fixed;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    background: rgba(0, 0, 0, 0.5);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    z-index: 1000;
                    animation: fadeIn 0.2s;
                }
                @keyframes fadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
                .modal-content {
                    background: white;
                    border-radius: 12px;
                    padding: 24px;
                    width: 90%;
                    max-width: 500px;
                    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
                    animation: slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1);
                }
                .modal-content h2 {
                    margin: 0 0 20px 0;
                    font-size: 20px;
                    color: #111;
                }
                .form-group {
                    margin-bottom: 16px;
                }
                .form-group label {
                    display: block;
                    margin-bottom: 6px;
                    font-size: 13px;
                    font-weight: 500;
                    color: #555;
                }
                .form-group input,
                .form-group select {
                    width: 100%;
                    padding: 10px 12px;
                    border-radius: 6px;
                    border: 1px solid #ddd;
                    background: #f9f9f9;
                    color: #333;
                    font-size: 14px;
                    font-family: inherit;
                }
                .form-group input:focus,
                .form-group select:focus {
                    outline: none;
                    border-color: #4f46e5;
                }
                .modal-actions {
                    display: flex;
                    gap: 12px;
                    justify-content: flex-end;
                    margin-top: 24px;
                }
                .modal-actions .btn {
                    min-width: 130px;
                    height: 42px;
                }
            `}</style>

            <DetailModal
              open={!!detailAccount}
              onClose={() => setDetailAccount(null)}
              title={detailAccount ? `Account Details — ${detailAccount.username}` : undefined}
              data={detailAccount?.account || {}}
            />
        </>
    );
}
