// shopdesk — suppliers (vendors who stock your shelves)
import React, { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Search, Plus, Factory, X, Pencil, Trash2, Phone, Mail, MapPin, Building2, Truck,
} from 'lucide-react';
import { api } from '../api.js';
import { useApp } from '../store.jsx';
import { useToast, Modal, EmptyState, TableSkeleton } from '../components/ui.jsx';

const blank = { name: '', phone: '', email: '', gstin: '', address: '', city: '', notes: '' };

export default function Suppliers() {
  const { money, user } = useApp();
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(searchParams.get('q') || '');
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(blank);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    const params = search ? `?q=${encodeURIComponent(search)}` : '';
    api(`/suppliers${params}`)
      .then(setSuppliers)
      .catch((err) => toast.error('Couldn’t load suppliers', err.message))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  useEffect(() => { const t = setTimeout(load, search ? 220 : 0); return () => clearTimeout(t); }, [load, search]);

  useEffect(() => { if (searchParams.get('new') === '1') { setForm(blank); setEditing('new'); setSearchParams({}, { replace: true }); } }, [searchParams, setSearchParams]);

  const openNew = () => { setForm(blank); setEditing('new'); };
  const openEdit = (s) => { setForm({ ...s }); setEditing(s); };

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editing === 'new') {
        const created = await api('/suppliers', { method: 'POST', body: form });
        setSuppliers((prev) => [...prev, { ...created, purchase_count: 0, total_purchased: 0 }].sort((a, b) => a.name.localeCompare(b.name)));
        toast.success('Supplier added', created.name);
      } else {
        const updated = await api(`/suppliers/${editing.id}`, { method: 'PUT', body: form });
        setSuppliers((prev) => prev.map((s) => (s.id === updated.id ? { ...s, ...updated } : s)));
        toast.success('Supplier updated', updated.name);
      }
      setEditing(null);
    } catch (err) {
      toast.error('Save failed', err.message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (s) => {
    const snapshot = suppliers;
    setSuppliers((prev) => prev.filter((x) => x.id !== s.id)); // optimistic
    setConfirmDelete(null);
    try {
      await api(`/suppliers/${s.id}`, { method: 'DELETE' });
      toast.success('Supplier deleted', s.name);
    } catch (err) {
      setSuppliers(snapshot);
      toast.error('Delete failed', err.message);
    }
  };

  const totalPurchased = suppliers.reduce((sum, s) => sum + Number(s.total_purchased || 0), 0);

  return (
    <div>
      <div className="page-head">
        <div>
          <h1 className="page-title">Suppliers &amp; <em>vendors</em></h1>
          <div className="page-sub">{suppliers.length} vendors · {money(totalPurchased, 0)} purchased all-time</div>
        </div>
        <button className="btn btn-primary" onClick={openNew}><Plus size={16} /> Add Supplier</button>
      </div>

      <div className="card card-pad" style={{ marginBottom: 14 }}>
        <div className="bill-search" style={{ height: 42 }}>
          <Search size={16} color="var(--muted)" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search supplier, phone or city…" aria-label="Search suppliers" />
          {search && <button className="icon-btn" onClick={() => setSearch('')}><X size={15} /></button>}
        </div>
      </div>

      <div className="card card-pad">
        {loading ? <TableSkeleton rows={7} cols={5} /> : suppliers.length === 0 ? (
          <EmptyState icon={Factory} title="No suppliers yet"
            message={search ? `Nobody matches “${search}”.` : 'Add the distributors you buy from — purchase bills will track themselves.'}
            actionLabel={search ? 'Clear search' : 'Add Supplier'}
            onAction={() => (search ? setSearch('') : openNew())} />
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr><th>Supplier</th><th>Contact</th><th className="num">Purchases</th><th className="num">Total bought</th><th></th></tr>
              </thead>
              <tbody>
                {suppliers.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 7 }}>
                        {s.gstin && <Building2 size={12} color="var(--violet)" title="GST registered" />}
                        {s.name}
                      </div>
                      <div className="cell-sub" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 3 }}>
                        {s.city && <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><MapPin size={10} />{s.city}</span>}
                        {s.gstin && <span>GSTIN {s.gstin}</span>}
                      </div>
                    </td>
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                        {s.phone && <a href={`tel:${s.phone}`} style={{ color: 'var(--muted)', textDecoration: 'none', display: 'flex', gap: 6, alignItems: 'center', fontSize: 11.5 }}><Phone size={11} />{s.phone}</a>}
                        {s.email && <span style={{ color: 'var(--muted)', display: 'flex', gap: 6, alignItems: 'center', fontSize: 11.5 }}><Mail size={11} />{s.email}</span>}
                      </div>
                    </td>
                    <td className="num mono">{s.purchase_count}</td>
                    <td className="num mono">{money(s.total_purchased, 0)}</td>
                    <td>
                      <div className="row-actions">
                        <button className="icon-btn" title="Edit" aria-label="Edit supplier" onClick={() => openEdit(s)}><Pencil size={15} /></button>
                        {user?.role === 'admin' && (
                          <button className="icon-btn" title="Delete" aria-label="Delete supplier" style={{ color: 'var(--rose)' }} onClick={() => setConfirmDelete(s)}><Trash2 size={15} /></button>
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

      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing === 'new' ? 'Add supplier' : `Edit — ${editing?.name}`} sub="Input tax credit works when their GSTIN is saved."
        footer={<>
          <button className="btn btn-ghost" onClick={() => setEditing(null)}>Cancel</button>
          <button className="btn btn-primary" form="supplier-form" type="submit" disabled={saving}>{saving ? <span className="spinner" /> : 'Save supplier'}</button>
        </>}>
        <form id="supplier-form" className="form-grid" onSubmit={save}>
          <div className="field span-2"><label htmlFor="s-name">Firm name *</label>
            <input id="s-name" className="input" required autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Shri Mahadev Distribution Co." /></div>
          <div className="field"><label htmlFor="s-phone">Phone</label>
            <input id="s-phone" className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="98XXXXXXXX" /></div>
          <div className="field"><label htmlFor="s-email">Email</label>
            <input id="s-email" type="email" className="input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="sales@vendor.in" /></div>
          <div className="field"><label htmlFor="s-gstin">GSTIN</label>
            <input id="s-gstin" className="input mono" value={form.gstin} onChange={(e) => setForm({ ...form, gstin: e.target.value.toUpperCase() })} placeholder="09ABCDE1234F1Z5" /></div>
          <div className="field"><label htmlFor="s-city">City</label>
            <input id="s-city" className="input" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} placeholder="Mathura" /></div>
          <div className="field span-2"><label htmlFor="s-addr">Address</label>
            <input id="s-addr" className="input" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="12 Katra Road, Mathura" /></div>
          <div className="field span-2"><label htmlFor="s-notes">Notes</label>
            <input id="s-notes" className="input" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Delivers Tuesdays & Saturdays…" /></div>
        </form>
      </Modal>

      <Modal open={!!confirmDelete} onClose={() => setConfirmDelete(null)} title="Delete supplier?"
        sub={confirmDelete && confirmDelete.name}
        footer={<>
          <button className="btn btn-ghost" onClick={() => setConfirmDelete(null)}>Keep</button>
          <button className="btn btn-danger" onClick={() => remove(confirmDelete)}><Trash2 size={15} /> Delete</button>
        </>}>
        <p style={{ color: 'var(--muted)', fontSize: 12.5 }}>Purchase bills from this vendor keep their name. Stock already received stays in inventory.</p>
      </Modal>
    </div>
  );
}
