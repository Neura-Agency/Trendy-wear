import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import Badge from "./Badge";

export default function Layout({ children, user, onLogout }) {
  const [showMenu, setShowMenu] = useState(false);
  const router = useRouter();
  const currentPath = router.pathname;

  const navItems = [
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
        <div
          className="topbar-brand"
          style={{ display: "flex", alignItems: "center", padding: "4px 0" }}
        >
          <img
            src="/logo.jpg"
            alt="Logo"
            style={{
              height: "60px",
              width: "auto",
              borderRadius: "10px",
              objectFit: "contain",
            }}
          />
        </div>
        <div
          className="topbar-right"
          style={{ display: "flex", alignItems: "center", gap: 12 }}
        >
          <div className="topbar-user" style={{ position: "relative" }}>
            <div
              onClick={() => setShowMenu((v) => !v)}
              style={{
                background: "var(--surface-2)",
                padding: "6px 12px",
                borderRadius: "50px",
                border: "1px solid var(--border)",
                cursor: "pointer",
                display: "flex",
                gap: 8,
                alignItems: "center",
              }}
            >
              <div
                style={{
                  width: 32,
                  height: 32,
                  background: "var(--acc)",
                  borderRadius: "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#fff",
                  fontWeight: 800,
                  fontSize: "12px",
                }}
              >
                {user?.username?.charAt(0).toUpperCase()}
              </div>
              <div style={{ display: "flex", flexDirection: "column" }}>
                <span
                  className="user-name"
                  style={{ fontSize: "13px", fontWeight: 700, lineHeight: 1 }}
                >
                  {user?.username}
                </span>
                <span
                  style={{
                    fontSize: "10px",
                    color: "var(--text-muted)",
                    fontWeight: 600,
                  }}
                >
                  {user?.role === "admin" ? "Super Admin" : "Shop Manager"}
                </span>
              </div>
            </div>
            {/* dropdown menu */}
            <div
              className="user-menu"
              style={{
                position: "absolute",
                right: "18px",
                top: "56px",
                background: "#fff",
                border: "1px solid var(--border)",
                borderRadius: 8,
                boxShadow: "0 6px 18px rgba(0,0,0,0.08)",
                display: showMenu ? "block" : "none",
                minWidth: 100,
                zIndex: 60,
              }}
            >
              <div style={{ padding: 8 }}>
                <button className="btn btn-link" onClick={onLogout}>
                  Logout
                </button>
              </div>
            </div>
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
                style={{ textDecoration: "none" }}
              >
                <div
                  className={`nav-item ${currentPath === item.path ? "active" : ""}`}
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
                </div>
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
