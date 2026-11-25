// shopdesk — purchases (stock-in)
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Search, Plus, Truck, X, Trash2, Eye, ChevronLeft, ChevronRight, PackagePlus, Factory,
} from 'lucide-react';
import { api, formatDate } from '../api.js';
import { useApp } from '../store.jsx';
import { useToast, Modal, EmptyState, TableSkeleton } from '../components/ui.jsx';

const round2 = (n) => Math.round(n * 100) / 100;

export default function Purchases() {
  const { money, user } = useApp();
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  const [data, setData] = useState({ rows: [], total: 0, page: 1, pageSize: 10, summary: { total: 0, count: 0 } });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [viewing, setViewing] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);

  // create modal state
  const [creating, setCreating] = useState(false);
  const [suppliers, setSuppliers] = useState([]);
  const [productQuery, setProductQuery] = useState('');
  const [allProducts, setAllProducts] = useState([]);
  const [supplierId, setSupplierId] = useState('');
  const [lines, setLines] = useState([]); // {product_id, name, qty, cost, tax_rate, stock}
  const [paid, setPaid] = useState('');
  const [status, setStatus] = useState('received');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), pageSize: '10' });
    if (search) params.set('q', search);
    api(`/purchases?${params}`)
      .then(setData)
      .catch((err) => toast.error('Couldn’t load purchases', err.message))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, page]);

  useEffect(() => { const t = setTimeout(load, search ? 220 : 0); return () => clearTimeout(t); }, [load, search]);
  useEffect(() => { if (searchParams.get('new') === '1') { openCreate(); setSearchParams({}, { replace: true }); } }, [searchParams, setSearchParams]);

  const openCreate = async () => {
    setCreating(true);
    setLines([]); setPaid(''); setNotes(''); setStatus('received'); setSupplierId(''); setProductQuery('');
    try {
      const [sup, prods] = await Promise.all([api('/suppliers'), api('/products')]);
      setSuppliers(sup);
      setAllProducts(prods);
    } catch (err) {
      toast.error('Couldn’t load data', err.message);
    }
  };

  const productMatches = useMemo(() => {
    const q = productQuery.trim().toLowerCase();
    if (!q || lines.length >= 60) return [];
    return allProducts.filter((p) => p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q) || (p.barcode && p.barcode.includes(q))).slice(0, 6);
  }, [productQuery, allProducts, lines.length]);

  const addLine = (p) => {
    setLines((prev) => prev.find((l) => l.product_id === p.id)
      ? prev.map((l) => l.product_id === p.id ? { ...l, qty: l.qty + 1 } : l)
      : [...prev, { product_id: p.id, name: p.name, unit: p.unit, qty: 24, cost: p.cost, tax_rate: p.tax_rate }]);
    setProductQuery('');
  };

  const updateLine = (id, field, value) => {
    setLines((prev) => prev.map((l) => (l.product_id === id ? { ...l, [field]: Math.max(0, Number(value) || 0) } : l)));
  };
  const removeLine = (id) => setLines((prev) => prev.filter((l) => l.product_id !== id));

  const totals = useMemo(() => {
    let subtotal = 0, tax = 0;
    for (const l of lines) {
      const taxable = l.qty * l.cost;
      subtotal += taxable;
      tax += (taxable * l.tax_rate) / 100;
    }
    return { subtotal: round2(subtotal), tax: round2(tax), grand: round2(subtotal + tax) };
  }, [lines]);

  const submitPurchase = async (e) => {
    e.preventDefault();
    const validLines = lines.filter((l) => l.qty > 0);
    if (validLines.length === 0) { toast.error('Empty purchase', 'Add at least one product with quantity above zero.'); return; }
    setSaving(true);
    try {
      const created = await api('/purchases', {
        method: 'POST',
        body: {
          supplier_id: supplierId || null,
          paid: paid === '' ? null : Number(paid),
          status, notes,
          items: validLines.map((l) => ({ product_id: l.product_id, qty: l.qty, cost: l.cost, tax_rate: l.tax_rate })),
        },
      });
      toast.success('Purchase recorded', `${created.purchase_no} · stock updated`);
      setCreating(false);
      load();
    } catch (err) {
      toast.error('Purchase failed', err.message);
    } finally {
      setSaving(false);
    }
  };

  const openView = async (id) => {
    try { setViewing(await api(`/purchases/${id}`)); } catch (err) { toast.error('Couldn’t open purchase', err.message); }
  };

  const removePurchase = async (p) => {
    const snapshot = data;
    setData((d) => ({ ...d, rows: d.rows.filter((r) => r.id !== p.id), total: Math.max(0, d.total - 1) })); // optimistic
    setConfirmDelete(null);
    try {
      await api(`/purchases/${p.id}`, { method: 'DELETE' });
      toast.success('Purchase deleted', `${p.purchase_no} removed · stock reduced`);
    } catch (err) {
      setData(snapshot);
      toast.error('Delete failed', err.message);
    }
  };

  const totalPages = Math.max(1, Math.ceil(data.total / data.pageSize));

  return (
    <div>
      <div className="page-head">
        <div>
          <h1 className="page-title">Purchase <em>orders</em></h1>
          <div className="page-sub">{data.summary.count} purchases all-time · {money(data.summary.total, 0)} stocked in</div>
        </div>
        <button className="btn btn-primary" onClick={openCreate}><Plus size={16} /> Record Purchase</button>
      </div>

      <div className="card card-pad" style={{ marginBottom: 14 }}>
        <div className="bill-search" style={{ height: 42 }}>
          <Search size={16} color="var(--muted)" />
          <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Search purchase no or supplier…" aria-label="Search purchases" />
          {search && <button className="icon-btn" onClick={() => setSearch('')}><X size={15} /></button>}
        </div>
      </div>

      <div className="card card-pad">
        {loading ? <TableSkeleton rows={7} cols={6} /> : data.rows.length === 0 ? (
          <EmptyState icon={Truck} title="No purchases yet"
            message={search ? `Nothing matches “${search}”.` : 'Record your first stock-in and inventory grows itself.'}
            actionLabel={search ? 'Clear search' : 'Record Purchase'}
            onAction={() => (search ? setSearch('') : openCreate())} />
        ) : (
          <>
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr><th>Purchase</th><th>Supplier</th><th>Date</th><th className="num">Total</th><th className="num">Paid</th><th>Status</th><th></th></tr>
                </thead>
                <tbody>
                  {data.rows.map((p) => (
                    <tr key={p.id}>
                      <td className="mono" style={{ color: 'var(--cyan)', fontWeight: 600 }}>{p.purchase_no}</td>
                      <td>{p.supplier_name || <span style={{ color: 'var(--muted-2)' }}>Direct / cash</span>}</td>
                      <td style={{ color: 'var(--muted)' }}>{formatDate(p.date)}</td>
                      <td className="num mono">{money(p.grand_total)}</td>
                      <td className="num mono">{money(p.paid)}</td>
                      <td><span className={`pill ${p.status}`}>{p.status}</span></td>
                      <td>
                        <div className="row-actions">
                          <button className="icon-btn" title="View" aria-label="View purchase" onClick={() => openView(p.id)}><Eye size={16} /></button>
                          {user?.role === 'admin' && (
                            <button className="icon-btn" title="Delete" aria-label="Delete purchase" style={{ color: 'var(--rose)' }} onClick={() => setConfirmDelete(p)}><Trash2 size={16} /></button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="pager">
              <span>Page {data.page} of {totalPages} · {data.total} purchases</span>
              <div className="pager-btns">
                <button className="btn btn-ghost btn-sm btn-icon" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} aria-label="Previous"><ChevronLeft size={16} /></button>
                <button className="btn btn-ghost btn-sm btn-icon" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} aria-label="Next"><ChevronRight size={16} /></button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* ================= create purchase ================= */}
      <Modal open={creating} onClose={() => setCreating(false)} title="Record purchase" sub="Stock comes in, cost price updates — automatically." wide
        footer={<>
          <div style={{ marginRight: 'auto', fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 700 }}>Total: <span style={{ color: 'var(--lime)' }}>{money(totals.grand)}</span></div>
          <button className="btn btn-ghost" onClick={() => setCreating(false)}>Cancel</button>
          <button className="btn btn-primary" form="purchase-form" type="submit" disabled={saving}>{saving ? <span className="spinner" /> : <><PackagePlus size={16} /> Save purchase</>}</button>
        </>}>
        <form id="purchase-form" onSubmit={submitPurchase}>
          <div className="form-grid" style={{ marginBottom: 12 }}>
            <div className="field"><label htmlFor="pu-supplier">Supplier</label>
              <select id="pu-supplier" className="input" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
                <option value="">No supplier / cash purchase</option>
                {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select></div>
            <div className="field"><label>Status</label>
              <div className="seg">{['received', 'pending'].map((s) => <button type="button" key={s} className={`seg-item${status === s ? ' active' : ''}`} onClick={() => setStatus(s)}>{s === 'received' ? 'Received' : 'Pending'}</button>)}</div></div>
          </div>

          {/* product picker */}
          <div className="field" style={{ position: 'relative', marginBottom: 10 }}>
            <label htmlFor="pu-search">Add products</label>
            <input id="pu-search" className="input" value={productQuery} onChange={(e) => setProductQuery(e.target.value)} placeholder="Type to search the catalogue…" autoComplete="off" />
            {productMatches.length > 0 && (
              <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20, background: '#151d38', border: '1px solid var(--line-strong)', borderRadius: 12, marginTop: 4, overflow: 'hidden', boxShadow: 'var(--shadow-soft)' }}>
                {productMatches.map((p) => (
                  <button type="button" key={p.id} onClick={() => addLine(p)} style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '9px 12px', background: 'transparent', border: 'none', color: 'var(--text)', cursor: 'pointer', textAlign: 'left' }}
                    onMouseOver={(e) => (e.currentTarget.style.background = 'rgba(183,240,79,.08)')}
                    onMouseOut={(e) => (e.currentTarget.style.background = 'transparent')}>
                    <Factory size={14} color="var(--muted)" />
                    <span style={{ fontSize: 12.5, fontWeight: 600 }}>{p.name}</span>
                    <span className="mono" style={{ marginLeft: 'auto', fontSize: 10.5, color: 'var(--muted)' }}>cost {money(p.cost)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* lines */}
          <div style={{ maxHeight: 240, overflowY: 'auto', marginBottom: 10 }} className="scroll-thin">
            {lines.length === 0 && <p style={{ color: 'var(--muted)', fontSize: 12, padding: '8px 2px' }}>No items yet — search above and tap a product.</p>}
            {lines.map((l) => (
              <div key={l.product_id} className="cart-line" style={{ gridTemplateColumns: 'minmax(0,1.6fr) repeat(3, auto) auto', alignItems: 'center' }}>
                <div style={{ minWidth: 0 }}>
                  <div className="cart-line-name" style={{ fontSize: 11.5 }}>{l.name}</div>
                  <div className="cell-sub">GST {l.tax_rate}% · {l.unit || 'pcs'}</div>
                </div>
                <div className="field" style={{ gap: 2 }}><label style={{ fontSize: 8 }}>Qty</label>
                  <input type="number" min="0.01" step="any" className="input mono" value={l.qty} onChange={(e) => updateLine(l.product_id, 'qty', e.target.value)} style={{ width: 74, padding: '6px 8px', fontSize: 12 }} aria-label="Quantity" /></div>
                <div className="field" style={{ gap: 2 }}><label style={{ fontSize: 8 }}>Cost ₹</label>
                  <input type="number" min="0" step="0.01" className="input mono" value={l.cost} onChange={(e) => updateLine(l.product_id, 'cost', e.target.value)} style={{ width: 84, padding: '6px 8px', fontSize: 12 }} aria-label="Cost per unit" /></div>
                <div className="mono" style={{ fontSize: 12, fontWeight: 700, textAlign: 'right' }}>{money(round2(l.qty * l.cost * (1 + l.tax_rate / 100)))}</div>
                <button type="button" className="cart-remove" onClick={() => removeLine(l.product_id)} aria-label="Remove line"><Trash2 size={15} /></button>
              </div>
            ))}
          </div>

          <div className="form-grid">
            <div className="field"><label htmlFor="pu-paid">Paid now (blank = full)</label>
              <input id="pu-paid" type="number" min="0" step="0.01" className="input mono" value={paid} onChange={(e) => setPaid(e.target.value)} placeholder={totals.grand.toFixed(2)} /></div>
            <div className="field"><label htmlFor="pu-notes">Notes</label>
              <input id="pu-notes" className="input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Bill no from vendor, transport…" /></div>
          </div>
        </form>
      </Modal>

      {/* ================= view purchase ================= */}
      <Modal open={!!viewing} onClose={() => setViewing(null)} title={viewing?.purchase_no} sub={viewing && `${viewing.supplier_name || 'Direct purchase'} · ${formatDate(viewing.date, { time: true })}`} wide>
        {viewing && (
          <div>
            <div className="table-wrap">
              <table className="data" style={{ minWidth: 480 }}>
                <thead><tr><th>Item</th><th className="num">Qty</th><th className="num">Cost</th><th className="num">GST</th><th className="num">Amount</th></tr></thead>
                <tbody>
                  {viewing.items.map((it) => (
                    <tr key={it.id}>
                      <td>{it.name}</td>
                      <td className="num mono">{it.qty}</td>
                      <td className="num mono">{money(it.cost)}</td>
                      <td className="num mono">{it.tax_rate}%</td>
                      <td className="num mono">{money(it.line_total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="totals-box" style={{ border: 'none' }}>
              <div className="totals-row"><span>Taxable</span><span>{money(viewing.subtotal)}</span></div>
              <div className="totals-row"><span>Tax</span><span>+ {money(viewing.tax_total)}</span></div>
              <div className="totals-row grand"><span>Total</span><b>{money(viewing.grand_total)}</b></div>
              <div className="totals-row"><span>Paid</span><span style={{ color: 'var(--teal)' }}>{money(viewing.paid)}</span></div>
            </div>
          </div>
        )}
      </Modal>

      {/* ================= delete confirm ================= */}
      <Modal open={!!confirmDelete} onClose={() => setConfirmDelete(null)} title="Delete purchase?"
        sub={confirmDelete && confirmDelete.purchase_no}
        footer={<>
          <button className="btn btn-ghost" onClick={() => setConfirmDelete(null)}>Keep</button>
          <button className="btn btn-danger" onClick={() => removePurchase(confirmDelete)}><Trash2 size={15} /> Delete</button>
        </>}>
        <p style={{ color: 'var(--muted)', fontSize: 12.5 }}>The quantities from this purchase will be removed from stock. This cannot be undone.</p>
      </Modal>
    </div>
  );
}
