// shopdesk — bills & invoices
import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Search, ReceiptText, Download, Printer, Trash2, Eye, IndianRupee, X, ChevronLeft, ChevronRight, Zap,
} from 'lucide-react';
import { api, formatDate, PAY_METHOD_LABEL } from '../api.js';
import { useApp } from '../store.jsx';
import { useToast, Modal, InvoiceStatusPill, EmptyState, TableSkeleton } from '../components/ui.jsx';

export default function Invoices() {
  const { money, user } = useApp();
  const toast = useToast();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [data, setData] = useState({ rows: [], total: 0, page: 1, pageSize: 12 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(searchParams.get('q') || '');
  const [status, setStatus] = useState(searchParams.get('status') || 'all');
  const [from, setFrom] = useState(searchParams.get('from') || '');
  const [to, setTo] = useState(searchParams.get('to') || '');
  const [page, setPage] = useState(1);
  const [viewing, setViewing] = useState(null);
  const [paying, setPaying] = useState(null);
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState('cash');
  const [savingPayment, setSavingPayment] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (search) params.set('q', search);
    if (status !== 'all') params.set('status', status);
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    params.set('page', String(page));
    params.set('pageSize', '12');
    api(`/invoices?${params}`)
      .then(setData)
      .catch((err) => toast.error('Couldn’t load bills', err.message))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, status, from, to, page]);

  useEffect(() => { const t = setTimeout(load, search ? 250 : 0); return () => clearTimeout(t); }, [load, search]);

  useEffect(() => {
    const next = {};
    if (search) next.q = search;
    if (status !== 'all') next.status = status;
    if (from) next.from = from;
    if (to) next.to = to;
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, status, from, to]);

  const openView = async (id) => {
    try { setViewing(await api(`/invoices/${id}`)); }
    catch (err) { toast.error('Couldn’t open bill', err.message); }
  };

  const submitPayment = async (e) => {
    e.preventDefault();
    if (!paying) return;
    setSavingPayment(true);
    try {
      await api(`/invoices/${paying.id}/payments`, { method: 'POST', body: { amount: Number(payAmount), method: payMethod } });
      toast.success('Payment recorded', `${money(Number(payAmount))} against ${paying.invoice_no}`);
      setPaying(null);
      load();
      if (viewing?.id === paying.id) setViewing(await api(`/invoices/${paying.id}`));
    } catch (err) {
      toast.error('Payment not saved', err.message);
    } finally {
      setSavingPayment(false);
    }
  };

  const deleteInvoice = async (inv) => {
    // optimistic remove
    const snapshot = data;
    setData((d) => ({ ...d, rows: d.rows.filter((r) => r.id !== inv.id), total: Math.max(0, d.total - 1) }));
    setConfirmDelete(null);
    try {
      await api(`/invoices/${inv.id}`, { method: 'DELETE' });
      toast.success('Bill deleted', `${inv.invoice_no} removed and stock restored.`);
    } catch (err) {
      setData(snapshot); // roll back
      toast.error('Delete failed', err.message);
    }
  };

  const totalPages = Math.max(1, Math.ceil(data.total / data.pageSize));
  const exportCsv = () => {
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    window.location.href = `/api/reports/export?${params}`;
  };

  return (
    <div>
      <div className="page-head">
        <div>
          <h1 className="page-title">Bills &amp; <em>invoices</em></h1>
          <div className="page-sub">{data.total} bills match · latest first</div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-ghost btn-sm" onClick={exportCsv}><Download size={14} /> Export CSV</button>
          <button className="btn btn-primary" onClick={() => navigate('/billing')}><Zap size={15} /> New Sale</button>
        </div>
      </div>

      {/* ---------- filters ---------- */}
      <div className="card card-pad" style={{ marginBottom: 14, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <div className="bill-search" style={{ flex: '1 1 220px', height: 42 }}>
          <Search size={16} color="var(--muted)" />
          <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Search bill no or customer…" aria-label="Search bills" />
          {search && <button className="icon-btn" onClick={() => setSearch('')}><X size={15} /></button>}
        </div>
        <div className="seg" role="tablist" aria-label="Payment status">
          {['all', 'paid', 'partial', 'unpaid'].map((s) => (
            <button key={s} className={`seg-item${status === s ? ' active' : ''}`} onClick={() => { setStatus(s); setPage(1); }}>
              {s === 'all' ? 'All' : s[0].toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
        <input type="date" className="input" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} style={{ width: 150 }} aria-label="From date" />
        <input type="date" className="input" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} style={{ width: 150 }} aria-label="To date" />
        {(from || to) && <button className="btn btn-ghost btn-sm" onClick={() => { setFrom(''); setTo(''); }}><X size={13} /> Clear dates</button>}
      </div>

      {/* ---------- table ---------- */}
      <div className="card card-pad">
        {loading ? <TableSkeleton rows={8} cols={6} /> : data.rows.length === 0 ? (
          <EmptyState icon={ReceiptText} title="No bills here yet"
            message={search || status !== 'all' || from || to ? 'No bills match these filters. Try clearing them.' : 'Complete your first sale at the billing counter and it will show up here.'}
            actionLabel="Open billing counter" onAction={() => navigate('/billing')} />
        ) : (
          <>
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr><th>Bill</th><th>Customer</th><th>Date</th><th className="num">Total</th><th className="num">Balance</th><th>Status</th><th></th></tr>
                </thead>
                <tbody>
                  {data.rows.map((inv) => (
                    <tr key={inv.id}>
                      <td className="mono" style={{ color: 'var(--lime)', fontWeight: 600 }}>{inv.invoice_no}</td>
                      <td>{inv.customer_name}</td>
                      <td style={{ color: 'var(--muted)' }}>{formatDate(inv.date, { time: true })}</td>
                      <td className="num mono">{money(inv.grand_total)}</td>
                      <td className="num mono" style={{ color: inv.grand_total - inv.paid > 0.5 ? 'var(--amber)' : 'var(--muted)' }}>
                        {inv.grand_total - inv.paid > 0.5 ? money(inv.grand_total - inv.paid) : '—'}
                      </td>
                      <td><InvoiceStatusPill status={inv.status} /></td>
                      <td>
                        <div className="row-actions">
                          <button className="icon-btn" onClick={() => openView(inv.id)} title="View" aria-label="View bill"><Eye size={16} /></button>
                          <button className="icon-btn" onClick={() => navigate(`/invoice/${inv.id}/print`)} title="Print" aria-label="Print bill"><Printer size={16} /></button>
                          {inv.status !== 'paid' && (
                            <button className="icon-btn" style={{ color: 'var(--teal)' }} title="Record payment" aria-label="Record payment"
                              onClick={() => { const remaining = inv.grand_total - inv.paid; setPaying(inv); setPayAmount(remaining.toFixed(2)); setPayMethod('cash'); }}>
                              <IndianRupee size={16} />
                            </button>
                          )}
                          {user?.role === 'admin' && (
                            <button className="icon-btn" style={{ color: 'var(--rose)' }} title="Delete" aria-label="Delete bill" onClick={() => setConfirmDelete(inv)}><Trash2 size={16} /></button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="pager">
              <span>Showing {(data.page - 1) * data.pageSize + 1}–{Math.min(data.total, data.page * data.pageSize)} of {data.total}</span>
              <div className="pager-btns">
                <button className="btn btn-ghost btn-sm btn-icon" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} aria-label="Previous page"><ChevronLeft size={16} /></button>
                <span className="mono" style={{ fontSize: 12 }}>{page} / {totalPages}</span>
                <button className="btn btn-ghost btn-sm btn-icon" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} aria-label="Next page"><ChevronRight size={16} /></button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* ---------- view modal ---------- */}
      <Modal open={!!viewing} onClose={() => setViewing(null)} title={viewing?.invoice_no} sub={viewing && `${viewing.customer_name} · ${formatDate(viewing.date, { time: true })}`} wide
        footer={viewing && (
          <>
            <button className="btn btn-ghost" onClick={() => navigate(`/invoice/${viewing.id}/print`)}><Printer size={15} /> Print</button>
            {viewing.status !== 'paid' && (
              <button className="btn btn-primary" onClick={() => { const remaining = viewing.grand_total - viewing.paid; setPaying(viewing); setPayAmount(remaining.toFixed(2)); setViewing(null); }}>
                <IndianRupee size={15} /> Record payment
              </button>
            )}
          </>
        )}>
        {viewing && (
          <div>
            <div className="table-wrap">
              <table className="data" style={{ minWidth: 480 }}>
                <thead><tr><th>Item</th><th className="num">Qty</th><th className="num">Rate</th><th className="num">GST</th><th className="num">Amount</th></tr></thead>
                <tbody>
                  {viewing.items.map((it) => (
                    <tr key={it.id}>
                      <td>{it.name}{it.discount > 0 && <div className="cell-sub">−{it.discount}% item discount</div>}</td>
                      <td className="num mono">{it.qty}</td>
                      <td className="num mono">{money(it.price)}</td>
                      <td className="num mono">{it.tax_rate}%</td>
                      <td className="num mono">{money(it.line_total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="totals-box" style={{ border: 'none', paddingTop: 10 }}>
              <div className="totals-row"><span>Subtotal</span><span>{money(viewing.subtotal)}</span></div>
              {viewing.discount > 0 && <div className="totals-row discount"><span>Bill discount</span><span>− {money(viewing.discount)}</span></div>}
              <div className="totals-row"><span>{viewing.is_interstate ? 'IGST' : 'CGST + SGST'}</span><span>{viewing.is_interstate ? money(viewing.igst) : `${money(viewing.cgst)} + ${money(viewing.sgst)}`}</span></div>
              <div className="totals-row grand"><span>Total</span><b>{money(viewing.grand_total)}</b></div>
              <div className="totals-row"><span>Paid · {PAY_METHOD_LABEL[viewing.payment_method]}</span><span style={{ color: 'var(--teal)' }}>{money(viewing.paid)}</span></div>
              {viewing.grand_total - viewing.paid > 0.5 && <div className="totals-row"><span>Balance due</span><span style={{ color: 'var(--amber)' }}>{money(viewing.grand_total - viewing.paid)}</span></div>}
            </div>
          </div>
        )}
      </Modal>

      {/* ---------- payment modal ---------- */}
      <Modal open={!!paying} onClose={() => setPaying(null)} title="Record payment" sub={paying && `${paying.invoice_no} · balance ${money(paying.grand_total - paying.paid)}`}>
        <form onSubmit={submitPayment}>
          <div className="field" style={{ marginBottom: 12 }}>
            <label htmlFor="pay-amt">Amount (₹)</label>
            <input id="pay-amt" type="number" min="0.5" step="0.01" className="input" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} required autoFocus />
          </div>
          <div className="field" style={{ marginBottom: 4 }}>
            <label>Method</label>
            <div className="seg">
              {['cash', 'upi', 'card', 'bank'].map((m) => (
                <button type="button" key={m} className={`seg-item${payMethod === m ? ' active' : ''}`} onClick={() => setPayMethod(m)}>{PAY_METHOD_LABEL[m]}</button>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16 }}>
            <button type="button" className="btn btn-ghost" onClick={() => setPaying(null)}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={savingPayment}>{savingPayment ? <span className="spinner" /> : 'Save payment'}</button>
          </div>
        </form>
      </Modal>

      {/* ---------- delete confirm ---------- */}
      <Modal open={!!confirmDelete} onClose={() => setConfirmDelete(null)} title="Delete this bill?"
        sub={confirmDelete && `${confirmDelete.invoice_no} · ${money(confirmDelete.grand_total)} — stock will be put back`}
        footer={<>
          <button className="btn btn-ghost" onClick={() => setConfirmDelete(null)}>Keep it</button>
          <button className="btn btn-danger" onClick={() => deleteInvoice(confirmDelete)}><Trash2 size={15} /> Delete bill</button>
        </>}>
        <p style={{ color: 'var(--muted)', fontSize: 12.5 }}>This permanently removes the bill and restores the sold quantities to stock. The invoice number will not be reused.</p>
      </Modal>
    </div>
  );
}
