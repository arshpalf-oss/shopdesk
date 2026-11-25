// shopdesk — customers (khata book) with detail drawer
import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, Plus, Users, Phone, Mail, MapPin, X, Pencil, Trash2, Zap, Building2, ReceiptText, HandCoins,
} from 'lucide-react';
import { api, timeAgo } from '../api.js';
import { useApp } from '../store.jsx';
import { useToast, Modal, EmptyState, InvoiceStatusPill, TableSkeleton } from '../components/ui.jsx';

const blank = { name: '', phone: '', email: '', gstin: '', address: '', city: '', notes: '' };

export default function Customers() {
  const { money, user } = useApp();
  const toast = useToast();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(searchParams.get('q') || '');
  const [editing, setEditing] = useState(null); // null | 'new' | customer
  const [form, setForm] = useState(blank);
  const [saving, setSaving] = useState(false);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    const params = search ? `?q=${encodeURIComponent(search)}` : '';
    api(`/customers${params}`)
      .then(setCustomers)
      .catch((err) => toast.error('Couldn’t load customers', err.message))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  useEffect(() => { const t = setTimeout(load, search ? 220 : 0); return () => clearTimeout(t); }, [load, search]);

  useEffect(() => {
    setSearchParams(search ? { q: search } : {}, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  useEffect(() => {
    if (searchParams.get('new') === '1') { openNew(); setSearchParams({}, { replace: true }); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const openNew = () => { setForm(blank); setEditing('new'); };
  const openEdit = (c) => { setForm({ ...c }); setEditing(c); };

  const openDetail = async (c) => {
    setDetail({ ...c, stats: null, recentInvoices: [] });
    setDetailLoading(true);
    try { setDetail(await api(`/customers/${c.id}`)); }
    catch (err) { toast.error('Couldn’t open customer', err.message); }
    finally { setDetailLoading(false); }
  };

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editing === 'new') {
        const created = await api('/customers', { method: 'POST', body: form });
        setCustomers((prev) => [...prev, { ...created, bill_count: 0, total_spent: 0, outstanding: 0, last_visit: null }].sort((a, b) => a.name.localeCompare(b.name)));
        toast.success('Customer added', created.name);
      } else {
        const updated = await api(`/customers/${editing.id}`, { method: 'PUT', body: form });
        setCustomers((prev) => prev.map((c) => (c.id === updated.id ? { ...c, ...updated } : c)));
        toast.success('Customer updated', updated.name);
      }
      setEditing(null);
    } catch (err) {
      toast.error('Save failed', err.message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (c) => {
    const snapshot = customers;
    setCustomers((prev) => prev.filter((x) => x.id !== c.id)); // optimistic
    setConfirmDelete(null);
    setDetail(null);
    try {
      await api(`/customers/${c.id}`, { method: 'DELETE' });
      toast.success('Customer deleted', `${c.name} — their bills keep their name snapshot.`);
    } catch (err) {
      setCustomers(snapshot);
      toast.error('Delete failed', err.message);
    }
  };

  const totalOutstanding = customers.reduce((s, c) => s + Number(c.outstanding || 0), 0);

  return (
    <div>
      <div className="page-head">
        <div>
          <h1 className="page-title">Customers &amp; <em>khata</em></h1>
          <div className="page-sub">{customers.length} saved contacts{totalOutstanding > 0 && <> · <span style={{ color: 'var(--amber)' }}>{money(totalOutstanding)} udhaar outstanding</span></>}</div>
        </div>
        <button className="btn btn-primary" onClick={openNew}><Plus size={16} /> Add Customer</button>
      </div>

      <div className="card card-pad" style={{ marginBottom: 14 }}>
        <div className="bill-search" style={{ height: 42 }}>
          <Search size={16} color="var(--muted)" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, phone or city…" aria-label="Search customers" />
          {search && <button className="icon-btn" onClick={() => setSearch('')}><X size={15} /></button>}
        </div>
      </div>

      <div className="card card-pad">
        {loading ? <TableSkeleton rows={8} cols={6} /> : customers.length === 0 ? (
          <EmptyState icon={Users} title="No customers yet"
            message={search ? `Nobody matches “${search}”.` : 'Add regulars and business customers — their bills and udhaar will collect here.'}
            actionLabel={search ? 'Clear search' : 'Add Customer'}
            onAction={() => (search ? setSearch('') : openNew())} />
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr><th>Name</th><th>Phone</th><th className="num">Bills</th><th className="num">Total spent</th><th className="num">Outstanding</th><th>Last visit</th><th></th></tr>
              </thead>
              <tbody>
                {customers.map((c) => (
                  <tr key={c.id} style={{ cursor: 'pointer' }} onClick={() => openDetail(c)}>
                    <td>
                      <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 7 }}>
                        {c.gstin && <Building2 size={12} color="var(--violet)" title="GST business" />}
                        {c.name}
                      </div>
                      {c.city && <div className="cell-sub">{c.city}</div>}
                    </td>
                    <td className="mono" style={{ color: 'var(--muted)' }}>{c.phone || '—'}</td>
                    <td className="num mono">{c.bill_count}</td>
                    <td className="num mono">{money(c.total_spent, 0)}</td>
                    <td className="num mono" style={{ color: c.outstanding > 0 ? 'var(--amber)' : 'var(--muted)', fontWeight: c.outstanding > 0 ? 700 : 400 }}>
                      {c.outstanding > 0 ? money(c.outstanding) : '—'}
                    </td>
                    <td style={{ color: 'var(--muted)' }}>{c.last_visit ? timeAgo(c.last_visit) : '—'}</td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <div className="row-actions">
                        <button className="icon-btn" title="Bill this customer" aria-label="New bill" onClick={() => navigate(`/billing?customer=${c.id}`)}><Zap size={15} color="var(--lime)" /></button>
                        <button className="icon-btn" title="Edit" aria-label="Edit customer" onClick={() => openEdit(c)}><Pencil size={15} /></button>
                        {user?.role === 'admin' && (
                          <button className="icon-btn" title="Delete" aria-label="Delete customer" style={{ color: 'var(--rose)' }} onClick={() => setConfirmDelete(c)}><Trash2 size={15} /></button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ================= detail drawer ================= */}
      <AnimatePresence>
        {detail && (
          <>
            <motion.div className="drawer-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setDetail(null)} />
            <motion.aside className="drawer-panel" role="dialog" aria-label={`Customer ${detail.name}`}
              initial={{ x: 480, opacity: 0.6 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 480, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 320, damping: 34 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                <div className="avatar" style={{ width: 52, height: 52, borderRadius: 16, fontSize: 18 }}>
                  {detail.name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()}
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: 19, fontWeight: 700 }}>{detail.name}</div>
                  <div style={{ color: 'var(--muted)', fontSize: 11 }}>{detail.gstin ? `GSTIN ${detail.gstin}` : 'Regular customer'}</div>
                </div>
                <button className="icon-btn" onClick={() => setDetail(null)} aria-label="Close"><X size={19} /></button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 7, fontSize: 12, color: 'var(--muted)', marginBottom: 16 }}>
                {detail.phone && <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}><Phone size={13} /> <a href={`tel:${detail.phone}`} style={{ color: 'inherit', textDecoration: 'none' }}>{detail.phone}</a></span>}
                {detail.email && <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}><Mail size={13} /> {detail.email}</span>}
                {(detail.address || detail.city) && <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}><MapPin size={13} /> {[detail.address, detail.city].filter(Boolean).join(', ')}</span>}
              </div>

              {detailLoading || !detail.stats ? (
                <div className="skeleton" style={{ height: 92, marginBottom: 14 }} />
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
                  <div className="stat-tile"><b>{money(detail.stats.total_spent, 0)}</b><span>Lifetime spend</span></div>
                  <div className="stat-tile"><b>{detail.stats.bill_count}</b><span>Bills billed</span></div>
                  <div className="stat-tile"><b style={{ color: detail.stats.outstanding > 0 ? 'var(--amber)' : undefined }}>{money(detail.stats.outstanding, 0)}</b><span>Udhaar due</span></div>
                  <div className="stat-tile"><b>{detail.stats.last_visit ? timeAgo(detail.stats.last_visit) : '—'}</b><span>Last visited</span></div>
                </div>
              )}

              <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', marginBottom: 18 }} onClick={() => navigate(`/billing?customer=${detail.id}`)}>
                <Zap size={16} /> Bill {detail.name.split(' ')[0]} now
              </button>

              <div className="card-title" style={{ marginBottom: 8 }}><span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><ReceiptText size={15} /> Recent bills</span>{detail.stats?.outstanding > 0 && <span className="pill partial">{money(detail.stats.outstanding)} due</span>}</div>
              {(!detail.recentInvoices || detail.recentInvoices.length === 0) && !detailLoading && <p style={{ color: 'var(--muted)', fontSize: 12 }}>No bills yet — their first purchase starts the story.</p>}
              {detail.recentInvoices?.map((inv) => (
                <div key={inv.id} className="low-stock-row" style={{ cursor: 'pointer' }} onClick={() => navigate(`/invoices?q=${inv.invoice_no}`)}>
                  <HandCoins size={15} color={inv.status === 'paid' ? 'var(--teal)' : 'var(--amber)'} style={{ flex: 'none' }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="mono" style={{ fontSize: 11.5, color: 'var(--lime)' }}>{inv.invoice_no}</div>
                    <div className="low-stock-meta">{timeAgo(inv.date)}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div className="mono" style={{ fontSize: 12 }}>{money(inv.grand_total, 0)}</div>
                    <InvoiceStatusPill status={inv.status} />
                  </div>
                </div>
              ))}
              {user?.role === 'admin' && (
                <button className="btn btn-danger btn-sm" style={{ marginTop: 16 }} onClick={() => setConfirmDelete(detail)}><Trash2 size={13} /> Delete customer</button>
              )}
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* ================= add/edit modal ================= */}
      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing === 'new' ? 'Add customer' : `Edit — ${editing?.name}`} sub="Their GSTIN prints on bills automatically."
        footer={<>
          <button className="btn btn-ghost" onClick={() => setEditing(null)}>Cancel</button>
          <button className="btn btn-primary" form="customer-form" type="submit" disabled={saving}>{saving ? <span className="spinner" /> : 'Save customer'}</button>
        </>}>
        <form id="customer-form" className="form-grid" onSubmit={save}>
          <div className="field span-2"><label htmlFor="c-name">Name *</label>
            <input id="c-name" className="input" required autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Rohit Agarwal" /></div>
          <div className="field"><label htmlFor="c-phone">Phone</label>
            <input id="c-phone" className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="98XXXXXXXX" /></div>
          <div className="field"><label htmlFor="c-email">Email</label>
            <input id="c-email" type="email" className="input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="name@example.com" /></div>
          <div className="field"><label htmlFor="c-gstin">GSTIN</label>
            <input id="c-gstin" className="input mono" value={form.gstin} onChange={(e) => setForm({ ...form, gstin: e.target.value.toUpperCase() })} placeholder="09ABCDE1234F1Z5" /></div>
          <div className="field"><label htmlFor="c-city">City</label>
            <input id="c-city" className="input" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} placeholder="Mathura" /></div>
          <div className="field span-2"><label htmlFor="c-addr">Address</label>
            <input id="c-addr" className="input" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="14 Nayee Basi, Mathura" /></div>
          <div className="field span-2"><label htmlFor="c-notes">Notes</label>
            <input id="c-notes" className="input" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Prefers morning delivery…" /></div>
        </form>
      </Modal>

      {/* ================= delete confirm ================= */}
      <Modal open={!!confirmDelete} onClose={() => setConfirmDelete(null)} title="Delete customer?"
        sub={confirmDelete && confirmDelete.name}
        footer={<>
          <button className="btn btn-ghost" onClick={() => setConfirmDelete(null)}>Keep</button>
          <button className="btn btn-danger" onClick={() => remove(confirmDelete)}><Trash2 size={15} /> Delete</button>
        </>}>
        <p style={{ color: 'var(--muted)', fontSize: 12.5 }}>Past bills keep this customer’s name. Their udhaar balance disappears from the khata.</p>
      </Modal>
    </div>
  );
}
