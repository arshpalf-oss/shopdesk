// shopdesk — app shell: sidebar, topbar, palette, route transitions
import React, { useEffect, useMemo, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard, Zap, ReceiptText, Package, Truck, Users, Factory, Wallet, BarChart3,
  Settings as SettingsIcon, Search, PanelLeftClose, PanelLeftOpen, LogOut, Menu, X,
} from 'lucide-react';
import { useApp } from '../store.jsx';
import { api } from '../api.js';
import CommandPalette, { useCommandPalette } from './CommandPalette.jsx';

const NAV = [
  { section: 'Sell', items: [
    { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
    { to: '/billing', label: 'New Sale', icon: Zap, highlight: true },
    { to: '/invoices', label: 'Bills & Invoices', icon: ReceiptText },
  ]},
  { section: 'Stock', items: [
    { to: '/products', label: 'Products', icon: Package, badgeKey: 'lowStock' },
    { to: '/purchases', label: 'Purchases', icon: Truck },
  ]},
  { section: 'People', items: [
    { to: '/customers', label: 'Customers', icon: Users },
    { to: '/suppliers', label: 'Suppliers', icon: Factory },
  ]},
  { section: 'Money', items: [
    { to: '/expenses', label: 'Expenses', icon: Wallet },
    { to: '/reports', label: 'Reports & GST', icon: BarChart3 },
  ]},
  { section: 'Manage', items: [
    { to: '/settings', label: 'Settings', icon: SettingsIcon },
  ]},
];

function LiveClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="live-clock">
      <div className="time">{now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</div>
      <div className="date">{now.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}</div>
    </div>
  );
}

export default function Layout() {
  const { user, business, logout } = useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('shopdesk-collapsed') === '1');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [lowStock, setLowStock] = useState(0);
  const { open: paletteOpen, setOpen: setPaletteOpen } = useCommandPalette();

  useEffect(() => {
    const fetchLow = () => api('/dashboard').then((d) => setLowStock(d.lowStockCount || 0)).catch(() => {});
    fetchLow();
    const t = setInterval(fetchLow, 90000);
    return () => clearInterval(t);
  }, [location.pathname]);

  useEffect(() => { setMobileOpen(false); }, [location.pathname]);
  useEffect(() => { localStorage.setItem('shopdesk-collapsed', collapsed ? '1' : '0'); }, [collapsed]);

  const initials = useMemo(() => (user?.name || 'SD').split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase(), [user?.name]);

  return (
    <div className={`app-shell${collapsed ? ' collapsed' : ''}`}>
      {/* backdrop for mobile drawer */}
      {mobileOpen && <div className="backdrop-mobile" onClick={() => setMobileOpen(false)} />}

      {/* ============ sidebar ============ */}
      <aside className={`sidebar${mobileOpen ? ' mobile-open' : ''}`}>
        <NavLink to="/" className="side-logo" aria-label="shopdesk home">
          <svg width="40" height="40" viewBox="0 0 64 64" fill="none" aria-hidden="true">
            <rect width="64" height="64" rx="15" fill="#0e1424" />
            <path d="M19 17h26a3 3 0 0 1 3 3v26.5L43.4 43 38 46.9 32.5 43 27 46.9 21.6 43 16 46.5V20a3 3 0 0 1 3-3z" fill="url(#lg)" />
            <circle cx="32" cy="27.5" r="2.4" fill="#0b120a" />
            <circle cx="32" cy="36.5" r="2.4" fill="#0b120a" opacity="0.7" />
            <defs><linearGradient id="lg" x1="16" y1="17" x2="48" y2="47"><stop stopColor="#b7f04f" /><stop offset="1" stopColor="#2dd4a7" /></linearGradient></defs>
          </svg>
          <span>
            <span className="wordmark">shop<em>desk</em></span>
            <span className="wordmark-sub">Every business. One desk.</span>
          </span>
        </NavLink>

        <nav aria-label="Main navigation">
          {NAV.map((group) => (
            <div key={group.section}>
              <div className="nav-section">{group.section}</div>
              {group.items.map((item) => {
                const Icon = item.icon;
                const badge = item.badgeKey === 'lowStock' ? lowStock : 0;
                return (
                  <NavLink key={item.to} to={item.to} end={item.end} title={collapsed ? item.label : undefined}
                    className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
                    {({ isActive }) => (
                      <>
                        {isActive && <motion.span layoutId="nav-pill" className="nav-pill" transition={{ type: 'spring', stiffness: 480, damping: 38 }} />}
                        <Icon className="nav-icon" size={18} strokeWidth={isActive ? 2.3 : 1.9} />
                        <span className="nav-label">{item.label}</span>
                        {badge > 0 && <span className="nav-badge">{badge} low</span>}
                      </>
                    )}
                  </NavLink>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="sidebar-foot">
          <div className="user-chip">
            <div className="avatar">{initials}</div>
            <div className="user-meta">
              <strong>{user?.name}</strong>
              <span>{user?.role === 'admin' ? 'Owner · Admin' : 'Staff'}</span>
            </div>
            <button className="icon-btn side-foot-extra" onClick={logout} title="Sign out" aria-label="Sign out" style={{ marginLeft: 'auto' }}>
              <LogOut size={17} />
            </button>
          </div>
          <button className="collapse-btn" onClick={() => setCollapsed((v) => !v)} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
            {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
            <span className="side-foot-extra" style={{ fontFamily: 'var(--font-mono)' }}>{collapsed ? '' : 'COLLAPSE'}</span>
          </button>
        </div>
      </aside>

      {/* ============ main column ============ */}
      <div className="main-col">
        <header className="topbar">
          <button className="icon-btn hamburger" onClick={() => setMobileOpen((v) => !v)} aria-label="Toggle menu" style={{ color: 'var(--text)' }}>
            {mobileOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
          <button className="search-pill" onClick={() => setPaletteOpen(true)} aria-label="Open command palette">
            <Search size={16} />
            <span>Search products, bills, people…</span>
            <kbd className="kbd">⌘K</kbd>
          </button>
          <div className="topbar-right">
            <LiveClock />
            <button className="btn btn-primary" onClick={() => navigate('/billing')} style={{ height: 38 }}>
              <Zap size={15} strokeWidth={2.4} /> <span className="btn-label">New Sale</span>
            </button>
          </div>
        </header>

        <main className="content" id="main-content">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={location.pathname}
              initial={{ opacity: 0, y: 14, filter: 'blur(6px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              exit={{ opacity: 0, y: -8, filter: 'blur(4px)' }}
              transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}>
              <Outlet />
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  );
}
