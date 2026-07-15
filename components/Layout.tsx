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
  superAdminOnly?: boolean;
  storeOnly?: boolean;
}

export default function Layout({ children, user, onLogout }: LayoutProps) {
  const [showMenu, setShowMenu] = useState<boolean>(false);
  const [mobileNavOpen, setMobileNavOpen] = useState<boolean>(false);
  const router = useRouter();
  const currentPath = router.pathname;

  useEffect(() => {
    setShowMenu(false);
    setMobileNavOpen(false);
  }, [currentPath]);

  // Close mobile nav on resize if window becomes large
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth > 768) {
        setMobileNavOpen(false);
      }
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Clean mono-color SVG icons (currentColor inherits nav text color)
  const iconDashboard = (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="3" width="7" height="9" rx="1" />
      <rect x="14" y="3" width="7" height="5" rx="1" />
      <rect x="14" y="12" width="7" height="9" rx="1" />
      <rect x="3" y="16" width="7" height="5" rx="1" />
    </svg>
  );
  const iconInventory = (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
      <path d="m3.3 7 8.7 5 8.7-5" />
      <path d="M12 22V12" />
    </svg>
  );
  const iconCredentials = (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="7.5" cy="15.5" r="5.5" />
      <path d="m11.5 11.5 4-4" />
      <path d="m15 8 2.5 2.5" />
      <path d="m18 5 2.5 2.5" />
    </svg>
  );
  const iconDirectSales = (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" />
      <path d="M3 6h18" />
      <path d="M16 10a4 4 0 0 1-8 0" />
    </svg>
  );
  const iconOwners = (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
  const iconReports = (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
      <path d="M14 2v4a2 2 0 0 0 2 2h4" />
      <line x1="9" y1="12" x2="15" y2="12" />
      <line x1="9" y1="16" x2="15" y2="16" />
    </svg>
  );
  const iconExpenses = (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 16.1A5 5 0 0 1 5.9 20M2 12.05A9 9 0 0 1 9.95 20M2 8V6a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-6"/>
      <line x1="2" x2="2.01" y1="20" y2="20"/>
    </svg>
  );
  const iconReturns = (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 14 4 9l5-5"/>
      <path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5v0a5.5 5.5 0 0 1-5.5 5.5H11"/>
    </svg>
  );
  const iconRefunds = (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22V12"/>
      <path d="m9 5 3-3 3 3"/>
      <path d="M3 7h18"/>
      <path d="M5 7c0 7.73 6 11 7 11s7-3.27 7-11"/>
    </svg>
  );
  const iconProfit = (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
      <polyline points="16 7 22 7 22 13" />
    </svg>
  );

  const navItems: NavItem[] = [
    {
      id: "home",
      icon: iconDashboard as any,
      label: "Main Dashboard",
      path: "/",
    },
    {
      id: "inventory",
      icon: iconInventory as any,
      label: "Stock & Inventory",
      path: "/inventory",
    },
    {
      id: "all-inventory",
      icon: iconInventory as any,
      label: "All inventory",
      path: "/all-inventory",
      storeOnly: true,
    },
    {
      id: "credentials",
      icon: iconCredentials as any,
      label: "Shop Credentials",
      path: "/credentials",
      adminOnly: true,
    },
    {
      id: "direct-sales",
      icon: iconDirectSales as any,
      label: "Direct Sales",
      path: "/direct-sales",
      superAdminOnly: true,
    },
    {
      id: "owners",
      icon: iconOwners as any,
      label: "Profit Partners",
      path: "/owners",
      superAdminOnly: true,
    },
    {
      id: "reports",
      icon: iconReports as any,
      label: "Reports",
      path: "/reports",
      superAdminOnly: true,
    },
    {
      id: "expenses",
      icon: iconExpenses as any,
      label: "Expenses",
      path: "/expenses",
      superAdminOnly: true,
    },
    {
      id: "returns",
      icon: iconReturns as any,
      label: "Returns",
      path: "/returns",
      superAdminOnly: true,
    },
    {
      id: "refunds",
      icon: iconRefunds as any,
      label: "Refunds",
      path: "/refunds",
      superAdminOnly: true,
    },
    {
      id: "profit",
      icon: iconProfit as any,
      label: "Profit",
      path: "/profit",
      superAdminOnly: true,
    },
  ];

  // Bottom nav icons (slightly larger for mobile)
  const bottomNavItems = [
    { id: "home", icon: iconDashboard as any, label: "Home", path: "/" },
    { id: "inventory", icon: iconInventory as any, label: "Stock", path: "/inventory" },
    { id: "reports", icon: iconReports as any, label: "Reports", path: "/reports", superAdminOnly: true },
    { id: "owners", icon: iconOwners as any, label: "Partners", path: "/owners", superAdminOnly: true },
  ].filter(item => {
    if (item.superAdminOnly) return user?.role === "admin" && user?.scope === "all";
    return true;
  });

  const filteredNavItems = navItems.filter((item) => {
    if (item.superAdminOnly)
      return user?.role === "admin" && user?.scope === "all";
    if (item.storeOnly) return user?.role === "store";
    if (item.adminOnly) return user?.role === "admin";
    return true;
  });

  return (
    <div className="page-wrap">
      {/* ── MOBILE OVERLAY ── */}
      <div
        className={`mobile-overlay ${mobileNavOpen ? "show" : ""}`}
        onClick={() => setMobileNavOpen(false)}
      />

      {/* ── TOP BAR ── */}
      <header className="topbar">
        {/* Mobile hamburger button */}
        <button
          className="mobile-menu-btn"
          onClick={() => setMobileNavOpen((v) => !v)}
          aria-label="Toggle navigation menu"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            {mobileNavOpen ? (
              <>
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </>
            ) : (
              <>
                <line x1="4" y1="6" x2="20" y2="6" />
                <line x1="4" y1="12" x2="20" y2="12" />
                <line x1="4" y1="18" x2="20" y2="18" />
              </>
            )}
          </svg>
        </button>
        <div style={{ width: 1 }} className="hide-mobile" />
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
            <span
              className={`chevron ${showMenu ? "open" : ""}`}
              style={{ fontSize: "10px", marginLeft: "4px" }}
            >
              ▼
            </span>
          </div>

          {/* dropdown menu */}
          <div className={`user-menu ${showMenu ? "show" : ""}`}>
            <div className="menu-header">
              <strong>{user?.username}</strong>
              <span>
                {user?.role === "admin" ? "Super Admin" : "Shop Manager"}
              </span>
            </div>
            <div className="menu-divider"></div>
            <button className="menu-item logout" onClick={onLogout}>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ marginRight: 8 }}
              >
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" x2="9" y1="12" y2="12" />
              </svg>
              Logout
            </button>
          </div>
        </div>
      </header>

      <div className="page-body">
        {/* ── SIDEBAR ── */}
        <nav className={`sidebar ${mobileNavOpen ? "mobile-open" : ""}`}>
          <div
            className="sidebar-brand"
            style={{ display: "flex", alignItems: "center", gap: "12px" }}
          >
            <img
              style={{ backgroundColor: "transparent !important", width: 40, height: 40, objectFit: "cover" }}
              src="/logo.jpg"
              alt="Trendy Wear"
              className="brand-logo"
            />
            <div
              className="brand-text"
              style={{ color: "white", fontWeight: 800, fontSize: "16px", letterSpacing: "0.5px" }}
            >
              Trendy Wear
            </div>
          </div>
          <div
            style={{
              padding: "20px 20px 8px 20px",
              fontSize: "10px",
              fontWeight: 700,
              color: "rgba(255,255,255,0.3)",
              textTransform: "uppercase",
              letterSpacing: "1.5px",
            }}
          >
            Menu
          </div>
          <div className="nav-items-container">
            {filteredNavItems.map((item) => (
              <Link
                href={item.path}
                key={item.id}
                className={`nav-item ${currentPath === item.path ? "active" : ""}`}
                style={{ textDecoration: "none" }}
                onClick={() => setMobileNavOpen(false)}
              >
                <span className="nav-icon">{item.icon}</span>
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

       {/* ── MOBILE BOTTOM NAV ── */}
       <nav className="mobile-bottom-nav">
         <div className="mobile-bottom-nav-items">
           {bottomNavItems.map((item) => (
             <Link
               href={item.path}
               key={item.id}
               className={`mobile-bottom-nav-item ${currentPath === item.path ? "active" : ""}`}
               style={{ textDecoration: "none" }}
             >
               <span style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
                 {item.icon}
               </span>
               <span>{item.label}</span>
             </Link>
           ))}
         </div>
       </nav>
     </div>
   );
 }
