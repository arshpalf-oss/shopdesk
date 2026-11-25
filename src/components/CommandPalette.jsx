// shopdesk — command palette (⌘K / Ctrl+K)
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, ArrowRight, LayoutDashboard, Zap, ReceiptText, Package, Truck, Users, Factory,
  Wallet, BarChart3, Settings, Plus, UserPlus, FileDown, Loader2, ScanLine,
} from 'lucide-react';
import { api } from '../api.js';

const NAV_COMMANDS = [
  { group: 'Go to', label: 'Dashboard', icon: LayoutDashboard, path: '/' },
  { group: 'Go to', label: 'New Sale / Billing Counter', icon: Zap, path: '/billing' },
  { group: 'Go to', label: 'Bills & Invoices', icon: ReceiptText, path: '/invoices' },
  { group: 'Go to', label: 'Products & Stock', icon: Package, path: '/products' },
  { group: 'Go to', label: 'Purchases', icon: Truck, path: '/purchases' },
  { group: 'Go to', label: 'Customers', icon: Users, path: '/customers' },
  { group: 'Go to', label: 'Suppliers', icon: Factory, path: '/suppliers' },
  { group: 'Go to', label: 'Expenses', icon: Wallet, path: '/expenses' },
  { group: 'Go to', label: 'Reports & GST', icon: BarChart3, path: '/reports' },
  { group: 'Go to', label: 'Settings', icon: Settings, path: '/settings' },
  { group: 'Quick actions', label: 'Create a new bill', icon: Zap, path: '/billing' },
  { group: 'Quick actions', label: 'Add a product', icon: Plus, path: '/products?new=1' },
  { group: 'Quick actions', label: 'Add a customer', icon: UserPlus, path: '/customers?new=1' },
  { group: 'Quick actions', label: 'Record an expense', icon: Wallet, path: '/expenses?new=1' },
  { group: 'Quick actions', label: 'Download sales CSV (30 days)', icon: FileDown, href: '/api/reports/export' },
];

export function useCommandPalette() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return { open, setOpen };
}

export default function CommandPalette({ open, onClose }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef(null);

  useEffect(() => {
    if (open) {
      setQuery('');
      setResults(null);
      setActive(0);
      setTimeout(() => inputRef.current?.focus(), 40);
    }
  }, [open, location.pathname]);

  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    if (q.length < 2) { setResults(null); setLoading(false); return; }
    setLoading(true);
    const t = setTimeout(async () => {
      try { setResults(await api(`/search?q=${encodeURIComponent(q)}`)); }
      catch { setResults({ products: [], customers: [], invoices: [] }); }
      finally { setLoading(false); }
    }, 170);
    return () => clearTimeout(t);
  }, [query, open]);

  const q = query.trim().toLowerCase();
  const items = useMemo(() => {
    const nav = NAV_COMMANDS.filter((c) => !q || c.label.toLowerCase().includes(q));
    const dynamic = [];
    if (results) {
      for (const p of results.products) dynamic.push({ group: 'Products', label: p.name, hint: `${p.sku} · ₹${p.price}`, path: `/products?q=${encodeURIComponent(p.name)}`, icon: Package });
      for (const c of results.customers) dynamic.push({ group: 'Customers', label: c.name, hint: c.phone || '', path: `/customers?q=${encodeURIComponent(c.name)}`, icon: Users });
      for (const inv of results.invoices) dynamic.push({ group: 'Bills', label: `${inv.invoice_no} — ${inv.customer_name}`, hint: `₹${Number(inv.grand_total).toFixed(0)}`, path: `/invoices?q=${encodeURIComponent(inv.invoice_no)}`, icon: ReceiptText });
    }
    return [...nav, ...dynamic].slice(0, 14);
  }, [q, results]);

  useEffect(() => { setActive(0); }, [items.length]);

  const activate = useCallback((item) => {
    if (!item) return;
    if (item.href) { window.location.href = item.href; return; }
    navigate(item.path);
    onClose();
  }, [navigate, onClose]);

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((v) => (v + 1) % Math.max(1, items.length)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((v) => (v - 1 + items.length) % Math.max(1, items.length)); }
    else if (e.key === 'Enter') { e.preventDefault(); activate(items[active]); }
    else if (e.key === 'Escape') onClose();
  };

  const groups = [];
  for (const item of items) {
    const existing = groups.find((g) => g.name === item.group);
    if (existing) existing.items.push(item); else groups.push({ name: item.group, items: [item] });
  }
  let flatIndex = -1;

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="palette-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={onClose}>
          <motion.div className="palette" role="dialog" aria-label="Command palette"
            initial={{ opacity: 0, y: -18, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -12, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 420, damping: 34 }}
            onMouseDown={(e) => e.stopPropagation()}>
            <div className="palette-input-row">
              {loading ? <Loader2 size={20} className="spin-slow" style={{ color: 'var(--lime)', animation: 'spin 1s linear infinite' }} /> : <Search size={20} style={{ color: 'var(--muted)' }} />}
              <input ref={inputRef} value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={onKeyDown}
                placeholder="Type a command, product, customer or bill number…" aria-label="Search" />
              <kbd className="kbd">ESC</kbd>
            </div>
            <div className="palette-body">
              {items.length === 0 && !loading && (
                <div style={{ padding: '26px 14px', textAlign: 'center', color: 'var(--muted)', fontSize: 12.5 }}>
                  <ScanLine size={26} style={{ margin: '0 auto 10px', opacity: 0.6 }} />
                  Nothing matches “{query}”. Try a bill number like INV-0924.
                </div>
              )}
              {groups.map((group) => (
                <div key={group.name}>
                  <div className="palette-group">{group.name}</div>
                  {group.items.map((item) => {
                    flatIndex += 1;
                    const idx = flatIndex;
                    const Icon = item.icon;
                    return (
                      <button key={idx} className={`palette-item${idx === active ? ' active' : ''}`}
                        onMouseEnter={() => setActive(idx)} onClick={() => activate(item)}>
                        <Icon size={17} style={{ color: idx === active ? 'var(--lime)' : 'var(--muted)', flex: 'none' }} />
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 13 }}>{item.label}</span>
                        {item.hint && <small>{item.hint}</small>}
                        <ArrowRight size={14} style={{ marginLeft: item.hint ? 0 : 'auto', opacity: 0.5 }} />
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
            <div className="palette-foot">
              <span><kbd className="kbd">↑↓</kbd> navigate</span>
              <span><kbd className="kbd">↵</kbd> select</span>
              <span><kbd className="kbd">esc</kbd> close</span>
              <span style={{ marginLeft: 'auto' }}><kbd className="kbd">⌘K</kbd> toggle</span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
