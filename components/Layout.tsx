import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { LayoutProps } from "../types";

interface NavItem {
  id: string;
  icon: string;
  label: string;
  path: string;
  adminOnly?: boolean;
}

export default function Layout({ children, user, onLogout }: LayoutProps) {
  const [showMenu, setShowMenu] = useState<boolean>(false);
  const router = useRouter();
  const currentPath = router.pathname;

  useEffect(() => {
    setShowMenu(false);
  }, [currentPath]);

  const navItems: NavItem[] = [
    { id: "home", icon: "📊", label: "Main Dashboard", path: "/" },
    {
      id: "inventory",
      icon: "📦",
      label: "Stock & Inventory",
      path: "/inventory",
    },
    {
      id: "credentials",
      icon: "🔑",
      label: "Shop Credentials",
      path: "/credentials",
      adminOnly: true,
    },
  ];

  const filteredNavItems = navItems.filter(
    (item) => !item.adminOnly || user?.role === "admin",
  );

  return (
    <div className="page-wrap">
      {/* ── TOP BAR ── */}
      <header className="topbar">
        <div className="topbar-brand">
          <img
            src="/logo.jpg"
            alt="Logo"
            className="brand-logo"
          />
        </div>
        <div className="topbar-right">
          <div className="topbar-user" onClick={() => setShowMenu((v) => !v)}>
            <div className="user-avatar">
              {user?.username?.charAt(0).toUpperCase()}
            </div>
            <div className="user-info">
              <span className="user-name">{user?.username}</span>
              <span className="user-role">
                {user?.role === "admin" ? "Super Admin" : "Shop Manager"}
              </span>
            </div>
            <span className={`chevron ${showMenu ? 'open' : ''}`} style={{ fontSize: '10px', marginLeft: '4px' }}>▼</span>
          </div>

          {/* dropdown menu */}
          <div className={`user-menu ${showMenu ? 'show' : ''}`}>
            <div className="menu-header">
              <strong>{user?.username}</strong>
              <span>{user?.role === "admin" ? "Super Admin" : "Shop Manager"}</span>
            </div>
            <div className="menu-divider"></div>
            <button className="menu-item logout" onClick={onLogout}>
              <span style={{ marginRight: '8px' }}>🚪</span> Logout
            </button>
          </div>
        </div>
      </header>

      <div className="page-body">
        {/* ── SIDEBAR ── */}
        <nav className="sidebar">
          <div
            style={{
              padding: "24px 24px 8px 24px",
              fontSize: "11px",
              fontWeight: 800,
              color: "rgba(255,255,255,0.4)",
              textTransform: "uppercase",
              letterSpacing: "1px",
            }}
          >
            Navigation Menu
          </div>
          <div className="nav-items-container">
            {filteredNavItems.map((item) => (
              <Link
                href={item.path}
                key={item.id}
                className={`nav-item ${currentPath === item.path ? "active" : ""}`}
                style={{ textDecoration: "none" }}
              >
                <span
                  className="nav-icon"
                  style={{
                    filter:
                      currentPath === item.path
                        ? "none"
                        : "grayscale(1) opacity(0.7)",
                  }}
                >
                  {item.icon}
                </span>
                <span className="nav-label">{item.label}</span>
              </Link>
            ))}
          </div>

          <div className="sidebar-footer" style={{ color: "white" }}>
            {user?.role === "admin" ? (
              <div className="profit-display">
                <span className="label">Manager Role</span>
                <span className="value">All Stores</span>
              </div>
            ) : (
              <div className="store-display">
                <span className="label">Shop Name</span>
                <span className="value">{user?.storeName}</span>
              </div>
            )}
          </div>
        </nav>

        {/* ── MAIN CONTENT ── */}
        <main className="main-area">{children}</main>
      </div>
    </div>
  );
}
