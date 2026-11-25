// shopdesk — products & inventory
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Search, Plus, Package, Pencil, Trash2, Boxes, Star, X, History, TriangleAlert, ChevronDown, Dices, Tags, Wrench,
} from 'lucide-react';
import { api, UNIT_OPTIONS } from '../api.js';
import { useApp } from '../store.jsx';
import { useToast, Modal, EmptyState, StockPill, TableSkeleton } from '../components/ui.jsx';
import { formatDate } from '../api.js';

const TAX_RATES = [0, 5, 12, 18, 28];
const blankProduct = { sku: '', barcode: '', name: '', category_id: '', unit: 'pcs', price: '', cost: '', tax_rate: 5, stock: '', reorder_level: 10, favorite: false };

export default function Products() {
  const { money, user } = useApp();
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(searchParams.get('q') || '');
  const [categoryId, setCategoryId] = useState('all');
  const [stockFilter, setStockFilter] = useState(searchParams.get('stock') || 'all');
  const [editing, setEditing] = useState(null);       // null | 'new' | product object
  const [form, setForm] = useState(blankProduct);
  const [saving, setSaving] = useState(false);
  const [adjusting, setAdjusting] = useState(null);   // product
  const [adjustDelta, setAdjustDelta] = useState('25');
  const [adjustReason, setAdjustReason] = useState('Stock correction');
  const [savingAdjust, setSavingAdjust] = useState(false);
  const [historyFor, setHistoryFor] = useState(null);
  const [movements, setMovements] = useState([]);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [showCategories, setShowCategories] = useState(false);
  const [newCategory, setNewCategory] = useState({ name: '', color: '#a3e635' });

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (search) params.set('q', search);
    if (categoryId !== 'all') params.set('category_id', categoryId);
    if (stockFilter !== 'all') params.set('stock', stockFilter);
    Promise.all([api(`/products?${params}`), api('/categories')])
      .then(([p, c]) => { setProducts(p); setCategories(c); })
      .catch((err) => toast.error('Couldn’t load products', err.message))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, categoryId, stockFilter]);

  useEffect(() => { const t = setTimeout(load, search ? 220 : 0); return () => clearTimeout(t); }, [load, search]);

  useEffect(() => {
    const next = {};
    if (search) next.q = search;
    if (stockFilter !== 'all') next.stock = stockFilter;
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, stockFilter]);

  useEffect(() => {
    if (searchParams.get('new') === '1') { openNew(); setSearchParams({}, { replace: true }); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const openNew = () => { setForm({ ...blankProduct, sku: `SD-${String(Math.floor(Math.random() * 900) + 61).padStart(3, '0')}` }); setEditing('new'); };
  const openEdit = (p) => { setForm({ ...p, category_id: p.category_id ?? '', favorite: !!p.favorite }); setEditing(p); };

  const saveProduct = async (e) => {
    e.preventDefault();
    setSaving(true);
    const payload = {
      ...form,
      category_id: form.category_id === '' ? null : Number(form.category_id),
      price: Number(form.price) || 0,
      cost: Number(form.cost) || 0,
      stock: Number(form.stock) || 0,
      reorder_level: Number(form.reorder_level) || 0,
      tax_rate: Number(form.tax_rate),
      barcode: String(form.barcode || '').trim(),
    };
    try {
      if (editing === 'new') {
        const created = await api('/products', { method: 'POST', body: payload });
        setProducts((prev) => [...prev, created]);
        toast.success('Product added', created.name);
      } else {
        const updated = await api(`/products/${editing.id}`, { method: 'PUT', body: payload });
        setProducts((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
        toast.success('Product updated', updated.name);
      }
      setEditing(null);
      load();
    } catch (err) {
      toast.error('Save failed', err.message);
    } finally {
      setSaving(false);
    }
  };

  const deleteProduct = async (p) => {
    const snapshot = products;
    setProducts((prev) => prev.filter((x) => x.id !== p.id)); // optimistic
    setConfirmDelete(null);
    try {
      await api(`/products/${p.id}`, { method: 'DELETE' });
      toast.success('Product deleted', p.name);
    } catch (err) {
      setProducts(snapshot); // roll back
      toast.error('Can’t delete', err.message);
    }
  };

  const submitAdjust = async (e) => {
    e.preventDefault();
    if (!adjusting) return;
    const delta = Number(adjustDelta);
    if (!delta || Number.isNaN(delta)) { toast.error('Enter a quantity', 'Use a negative number to remove stock.'); return; }
    setSavingAdjust(true);
    const original = adjusting;
    // optimistic
    setProducts((prev) => prev.map((p) => (p.id === original.id ? { ...p, stock: Math.max(0, Math.round((p.stock + delta) * 100) / 100) } : p)));
    try {
      const updated = await api(`/products/${original.id}/adjust-stock`, { method: 'POST', body: { delta, reason: adjustReason } });
      setProducts((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
      toast.success('Stock adjusted', `${updated.name}: ${updated.stock} ${updated.unit} on hand.`);
      setAdjusting(null);
    } catch (err) {
      setProducts((prev) => prev.map((p) => (p.id === original.id ? original : p)));
      toast.error('Adjustment failed', err.message);
    } finally {
      setSavingAdjust(false);
    }
  };

  const openHistory = async (p) => {
    setHistoryFor(p);
    setMovements([]);
    try { setMovements(await api(`/products/${p.id}/movements`)); }
    catch (err) { toast.error('Couldn’t load history', err.message); }
  };

  const addCategory = async (e) => {
    e.preventDefault();
    if (newCategory.name.trim().length < 2) return;
    try {
      const created = await api('/categories', { method: 'POST', body: newCategory });
      setCategories((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
      setNewCategory({ name: '', color: '#a3e635' });
      toast.success('Category added', created.name);
    } catch (err) {
      toast.error('Couldn’t add category', err.message);
    }
  };

  const deleteCategory = async (c) => {
    try {
      await api(`/categories/${c.id}`, { method: 'DELETE' });
      setCategories((prev) => prev.filter((x) => x.id !== c.id));
      toast.success('Category deleted', c.name);
    } catch (err) {
      toast.error('Can’t delete', err.message);
    }
  };

  const lowCount = products.filter((p) => p.stock <= p.reorder_level).length;
  const outCount = products.filter((p) => p.stock <= 0).length;

  const marginOf = (p) => (p.price > 0 ? Math.round(((p.price - p.cost) / p.price) * 100) : 0);

  return (
    <div>
      <div className="page-head">
        <div>
          <h1 className="page-title">Products &amp; <em>stock</em></h1>
          <div className="page-sub">{products.length} products{lowCount > 0 && <> · <span style={{ color: 'var(--amber)' }}>{lowCount} low</span></>}{outCount > 0 && <> · <span style={{ color: 'var(--rose)' }}>{outCount} out</span></>}</div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-ghost btn-sm" onClick={() => setShowCategories(true)}><Tags size={14} /> Categories</button>
          <button className="btn btn-primary" onClick={openNew}><Plus size={16} /> Add Product</button>
        </div>
      </div>

      {/* ---------- filters ---------- */}
      <div className="card card-pad" style={{ marginBottom: 14, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <div className="bill-search" style={{ flex: '1 1 230px', height: 42 }}>
          <Search size={16} color="var(--muted)" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, SKU or barcode…" aria-label="Search products" />
          {search && <button className="icon-btn" onClick={() => setSearch('')}><X size={15} /></button>}
        </div>
        <div style={{ position: 'relative' }}>
          <select className="input" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} style={{ paddingRight: 34, appearance: 'none' }} aria-label="Category">
            <option value="all">All categories</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <ChevronDown size={15} style={{ position: 'absolute', right: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)', pointerEvents: 'none' }} />
        </div>
        <div className="seg" role="tablist" aria-label="Stock filter">
          {[['all', 'All'], ['low', 'Low stock'], ['out', 'Out of stock']].map(([v, label]) => (
            <button key={v} className={`seg-item${stockFilter === v ? ' active' : ''}`} onClick={() => setStockFilter(v)}>{label}</button>
          ))}
        </div>
      </div>

      {/* ---------- table ---------- */}
      <div className="card card-pad">
        {loading ? <TableSkeleton rows={9} cols={7} /> : products.length === 0 ? (
          <EmptyState icon={Package} title="No products found"
            message={search || categoryId !== 'all' || stockFilter !== 'all' ? 'Nothing matches these filters.' : 'Add your first product and it will appear here.'}
            actionLabel={search || categoryId !== 'all' || stockFilter !== 'all' ? 'Clear filters' : 'Add Product'}
            onAction={() => { setSearch(''); setCategoryId('all'); setStockFilter('all'); if (!search) openNew(); }} />
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr><th>Product</th><th>Category</th><th className="num">Price</th><th className="num">Margin</th><th>Stock</th><th>GST</th><th></th></tr>
              </thead>
              <tbody>
                {products.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                        {p.favorite ? <Star size={13} fill="var(--amber)" color="var(--amber)" /> : <span style={{ width: 13 }} />}
                        <div>
                          <div style={{ fontWeight: 600 }}>{p.name}</div>
                          <div className="cell-sub">{p.sku}{p.barcode ? ` · ${p.barcode}` : ''}</div>
                        </div>
                      </div>
                    </td>
                    <td><span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: 'var(--muted)' }}><span className="legend-dot" style={{ background: p.category_color || 'var(--muted-2)' }} />{p.category_name || '—'}</span></td>
                    <td className="num mono">{money(p.price)}<div className="cell-sub">cost {money(p.cost)}</div></td>
                    <td className="num mono" style={{ color: marginOf(p) >= 20 ? 'var(--teal)' : 'var(--muted)' }}>{marginOf(p)}%</td>
                    <td><StockPill stock={p.stock} reorder={p.reorder_level} unit={p.unit} /></td>
                    <td className="mono" style={{ color: 'var(--muted)' }}>{p.tax_rate}%</td>
                    <td>
                      <div className="row-actions">
                        <button className="icon-btn" title="Adjust stock" aria-label="Adjust stock" onClick={() => { setAdjusting(p); setAdjustDelta('25'); }}><Wrench size={15} /></button>
                        <button className="icon-btn" title="Stock history" aria-label="Stock history" onClick={() => openHistory(p)}><History size={15} /></button>
                        <button className="icon-btn" title="Edit" aria-label="Edit product" onClick={() => openEdit(p)}><Pencil size={15} /></button>
                        {user?.role === 'admin' && (
                          <button className="icon-btn" title="Delete" aria-label="Delete product" style={{ color: 'var(--rose)' }} onClick={() => setConfirmDelete(p)}><Trash2 size={15} /></button>
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

      {/* ================= add/edit modal ================= */}
      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing === 'new' ? 'Add product' : `Edit — ${editing?.name}`} sub="Prices include GST as set per line on the bill." wide
        footer={<>
          <button className="btn btn-ghost" onClick={() => setEditing(null)}>Cancel</button>
          <button className="btn btn-primary" form="product-form" type="submit" disabled={saving}>{saving ? <span className="spinner" /> : editing === 'new' ? 'Add product' : 'Save changes'}</button>
        </>}>
        <form id="product-form" className="form-grid" onSubmit={saveProduct}>
          <div className="field span-2"><label htmlFor="p-name">Product name *</label>
            <input id="p-name" className="input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Fortune Sunflower Oil 1L" /></div>
          <div className="field"><label htmlFor="p-sku">SKU *</label>
            <input id="p-sku" className="input mono" required value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} placeholder="SD-061" /></div>
          <div className="field"><label htmlFor="p-barcode">Barcode</label>
            <div style={{ display: 'flex', gap: 6 }}>
              <input id="p-barcode" className="input mono" value={form.barcode} onChange={(e) => setForm({ ...form, barcode: e.target.value })} placeholder="8901234567890" />
              <button type="button" className="icon-btn" style={{ border: '1px solid var(--line-strong)', height: 41 }} title="Generate random barcode" aria-label="Generate barcode"
                onClick={() => setForm({ ...form, barcode: String(Math.floor(8900000000000 + Math.random() * 89999999999)) })}><Dices size={17} /></button>
            </div></div>
          <div className="field"><label htmlFor="p-cat">Category</label>
            <select id="p-cat" className="input" value={form.category_id} onChange={(e) => setForm({ ...form, category_id: e.target.value })}>
              <option value="">Uncategorised</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select></div>
          <div className="field"><label htmlFor="p-unit">Unit</label>
            <select id="p-unit" className="input" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })}>
              {UNIT_OPTIONS.map((u) => <option key={u} value={u}>{u}</option>)}
            </select></div>
          <div className="field"><label htmlFor="p-price">MRP / Selling price (₹) *</label>
            <input id="p-price" type="number" min="0" step="0.01" className="input mono" required value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} /></div>
          <div className="field"><label htmlFor="p-cost">Purchase cost (₹)</label>
            <input id="p-cost" type="number" min="0" step="0.01" className="input mono" value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} /></div>
          <div className="field"><label>GST rate</label>
            <div className="seg">{TAX_RATES.map((r) => <button type="button" key={r} className={`seg-item${Number(form.tax_rate) === r ? ' active' : ''}`} onClick={() => setForm({ ...form, tax_rate: r })}>{r}%</button>)}</div></div>
          <div className="field"><label htmlFor="p-stock">Opening stock</label>
            <input id="p-stock" type="number" min="0" step="0.01" className="input mono" value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} /></div>
          <div className="field"><label htmlFor="p-reorder">Reorder level</label>
            <input id="p-reorder" type="number" min="0" className="input mono" value={form.reorder_level} onChange={(e) => setForm({ ...form, reorder_level: e.target.value })} /></div>
          <label className="span-2" style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12.5, color: 'var(--muted)', cursor: 'pointer', padding: '4px 0' }}>
            <input type="checkbox" checked={!!form.favorite} onChange={(e) => setForm({ ...form, favorite: e.target.checked })} />
            <Star size={14} color="var(--amber)" /> Mark as favourite (quick-pinned for billing)
          </label>
        </form>
      </Modal>

      {/* ================= adjust stock ================= */}
      <Modal open={!!adjusting} onClose={() => setAdjusting(null)} title="Adjust stock" sub={adjusting && `${adjusting.name} · currently ${adjusting.stock} ${adjusting.unit}`}>
        <form onSubmit={submitAdjust}>
          <div className="field" style={{ marginBottom: 12 }}>
            <label htmlFor="adj-delta">Quantity change (+ add / − remove)</label>
            <input id="adj-delta" type="number" step="1" className="input mono" style={{ fontSize: 20, padding: '12px 14px' }} value={adjustDelta} onChange={(e) => setAdjustDelta(e.target.value)} autoFocus />
          </div>
          <div className="seg" style={{ marginBottom: 12 }}>
            {['-10', '+10', '+25', '+50', '+100'].map((v) => <button type="button" key={v} className="seg-item" onClick={() => setAdjustDelta(v)}>{v}</button>)}
          </div>
          <div className="field" style={{ marginBottom: 4 }}>
            <label htmlFor="adj-reason">Reason</label>
            <select id="adj-reason" className="input" value={adjustReason} onChange={(e) => setAdjustReason(e.target.value)}>
              {['Stock correction', 'Damaged / expired', 'Received goods', 'Customer return', 'Theft / shrinkage', 'Quick restock (dashboard)'].map((r) => <option key={r}>{r}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 14 }}>
            <button type="button" className="btn btn-ghost" onClick={() => setAdjusting(null)}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={savingAdjust}>{savingAdjust ? <span className="spinner" /> : 'Save adjustment'}</button>
          </div>
        </form>
      </Modal>

      {/* ================= stock history ================= */}
      <Modal open={!!historyFor} onClose={() => setHistoryFor(null)} title="Stock history" sub={historyFor?.name}>
        {movements.length === 0 ? (
          <p style={{ color: 'var(--muted)', fontSize: 12.5, padding: '14px 4px' }}><TriangleAlert size={14} style={{ verticalAlign: '-2px' }} /> Loading movements… or this product never moved.</p>
        ) : (
          <div style={{ maxHeight: 380, overflowY: 'auto' }} className="scroll-thin">
            {movements.map((m) => (
              <div key={m.id} className="low-stock-row" style={{ borderColor: 'transparent' }}>
                <Boxes size={15} color={m.delta >= 0 ? 'var(--teal)' : 'var(--rose)'} style={{ flex: 'none' }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 600 }}>{m.reason}</div>
                  <div className="low-stock-meta">{formatDate(m.created_at, { time: true })}{m.ref ? ` · ${m.ref}` : ''}</div>
                </div>
                <span className="mono" style={{ fontWeight: 700, color: m.delta >= 0 ? 'var(--teal)' : 'var(--rose)' }}>{m.delta >= 0 ? '+' : ''}{m.delta}</span>
              </div>
            ))}
          </div>
        )}
      </Modal>

      {/* ================= categories ================= */}
      <Modal open={showCategories} onClose={() => setShowCategories(false)} title="Categories" sub="Colour-code your shelves.">
        <form onSubmit={addCategory} style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          <input className="input" placeholder="New category name…" value={newCategory.name} onChange={(e) => setNewCategory({ ...newCategory, name: e.target.value })} aria-label="New category" />
          <input type="color" className="input" value={newCategory.color} onChange={(e) => setNewCategory({ ...newCategory, color: e.target.value })} style={{ width: 52, padding: 4 }} aria-label="Category colour" />
          <button type="submit" className="btn btn-primary"><Plus size={16} /></button>
        </form>
        {categories.map((c) => (
          <div key={c.id} className="low-stock-row">
            <span className="legend-dot" style={{ background: c.color, width: 12, height: 12, borderRadius: 4 }} />
            <div style={{ flex: 1 }}><div style={{ fontSize: 12.5, fontWeight: 600 }}>{c.name}</div><div className="low-stock-meta">{c.product_count} products</div></div>
            {user?.role === 'admin' && c.product_count === 0 && (
              <button className="icon-btn" style={{ color: 'var(--rose)' }} onClick={() => deleteCategory(c)} aria-label={`Delete ${c.name}`}><Trash2 size={15} /></button>
            )}
          </div>
        ))}
      </Modal>

      {/* ================= delete confirm ================= */}
      <Modal open={!!confirmDelete} onClose={() => setConfirmDelete(null)} title="Delete product?"
        sub={confirmDelete && confirmDelete.name}
        footer={<>
          <button className="btn btn-ghost" onClick={() => setConfirmDelete(null)}>Keep it</button>
          <button className="btn btn-danger" onClick={() => deleteProduct(confirmDelete)}><Trash2 size={15} /> Delete</button>
        </>}>
        <p style={{ color: 'var(--muted)', fontSize: 12.5 }}>Products used in saved bills can’t be deleted — the ledger must stay intact. You can set stock to zero instead.</p>
      </Modal>
    </div>
  );
}
