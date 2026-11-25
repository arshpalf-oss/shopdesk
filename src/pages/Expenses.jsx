// shopdesk — expenses (the money that quietly leaves)
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Search, Plus, Wallet, Trash2, Pencil, X, ChevronLeft, ChevronRight, Flame, Receipt,
} from 'lucide-react';
import { api, formatDate, PAY_METHOD_LABEL } from '../api.js';
import { useApp } from '../store.jsx';
import { useToast, Modal, EmptyState, TableSkeleton } from '../components/ui.jsx';

const SUGGESTIONS = ['Rent', 'Salary', 'Electricity', 'Internet & Phone', 'Transport', 'Packaging', 'Marketing', 'Repair & Maintenance', 'Chai & Refreshment', 'Stationery & Printing', 'Miscellaneous'];
const FILTERS = ['All', 'Rent', 'Salary', 'Electricity', 'Internet', 'Transport', 'Packaging', 'Maintenance', 'Miscellaneous'];
const blank = { category: '', amount: '', date: '', payment_method: 'cash', notes: '' };

export default function Expenses() {
  const { money, user } = useApp();
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  const [rows, setRows] = useState([]);
  const [monthTotal, setMonthTotal] = useState(0);
  const [byCategory, setByCategory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('All');
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [editing, setEditing] = useState(null); // null | 'new' | expense
  const [form, setForm] = useState(blank);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({ month });
    if (search) params.set('q', search);
    if (filter !== 'All') params.set('category', filter);
    api(`/expenses?${params}`)
      .then((d) => { setRows(d.rows); setMonthTotal(d.monthTotal); setByCategory(d.byCategory || []); })
      .catch((err) => toast.error('Couldn’t load expenses', err.message))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, filter, month]);

  useEffect(() => { const t = setTimeout(load, search ? 220 : 0); return () => clearTimeout(t); }, [load, search]);
  useEffect(() => { if (searchParams.get('new') === '1') { openNew(); setSearchParams({}, { replace: true }); } }, [searchParams, setSearchParams]);

  const openNew = () => { setForm({ ...blank, date: new Date().toISOString().slice(0, 10) }); setEditing('new'); };
  const openEdit = (e) => { setForm({ category: e.category, amount: String(e.amount), date: (e.date || '').slice(0, 10), payment_method: e.payment_method, notes: e.notes || '' }); setEditing(e); };

  const shiftMonth = (delta) => {
    const [y, m] = month.split('-').map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  };
  const monthLabel = new Date(`${month}-02T00:00:00`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  const isCurrentMonth = month === new Date().toISOString().slice(0, 7);

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    const payload = { category: form.category.trim(), amount: Number(form.amount), date: form.date ? `${form.date} 00:00:00` : undefined, payment_method: form.payment_method, notes: form.notes };
    try {
      if (editing === 'new') {
        await api('/expenses', { method: 'POST', body: payload });
        toast.success('Expense recorded', `${payload.category} · ${money(payload.amount)}`);
      } else {
        await api(`/expenses/${editing.id}`, { method: 'PUT', body: payload });
        toast.success('Expense updated', payload.category);
      }
      setEditing(null);
      load();
    } catch (err) {
      toast.error('Save failed', err.message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (expense) => {
    const snapshot = rows;
    setRows((prev) => prev.filter((x) => x.id !== expense.id)); // optimistic
    setConfirmDelete(null);
    try {
      await api(`/expenses/${expense.id}`, { method: 'DELETE' });
      toast.success('Expense deleted', expense.category);
      load();
    } catch (err) {
      setRows(snapshot);
      toast.error('Delete failed', err.message);
    }
  };

  const maxCat = Math.max(...byCategory.map((c) => c.total), 1);
  const filteredTotal = useMemo(() => rows.reduce((s, r) => s + Number(r.amount), 0), [rows]);

  return (
    <div>
      <div className="page-head">
        <div>
          <h1 className="page-title">Expenses &amp; <em>kharchas</em></h1>
          <div className="page-sub">Every rupee out — accounted for. {monthLabel} so far: <b style={{ color: 'var(--rose)' }}>{money(monthTotal, 0)}</b></div>
        </div>
        <button className="btn btn-primary" onClick={openNew}><Plus size={16} /> Add Expense</button>
      </div>

      <div className="grid-dashboard" style={{ marginTop: 0 }}>
        {/* ------- list ------- */}
        <div>
          <div className="card card-pad" style={{ marginBottom: 14, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <div className="pager-btns" style={{ flex: 'none' }}>
              <button className="btn btn-ghost btn-sm btn-icon" onClick={() => shiftMonth(-1)} aria-label="Previous month"><ChevronLeft size={15} /></button>
              <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, minWidth: 118, textAlign: 'center' }}>{monthLabel}</span>
              <button className="btn btn-ghost btn-sm btn-icon" onClick={() => shiftMonth(1)} disabled={isCurrentMonth} aria-label="Next month"><ChevronRight size={15} /></button>
            </div>
            <div className="bill-search" style={{ flex: '1 1 180px', height: 42 }}>
              <Search size={16} color="var(--muted)" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search expenses…" aria-label="Search expenses" />
              {search && <button className="icon-btn" onClick={() => setSearch('')}><X size={15} /></button>}
            </div>
          </div>
          <div className="chip-row" style={{ marginBottom: 12 }}>
            {FILTERS.map((f) => <button key={f} className={`chip${filter === f ? ' active' : ''}`} onClick={() => setFilter(f)}>{f}</button>)}
          </div>

          <div className="card card-pad">
            <div className="card-title">
              <span>{filter === 'All' ? 'All expenses' : filter} — {rows.length} entries</span>
              <small>{money(filteredTotal, 0)} shown</small>
            </div>
            {loading ? <TableSkeleton rows={7} cols={4} /> : rows.length === 0 ? (
              <EmptyState icon={Wallet} title="Nothing spent here"
                message={search || filter !== 'All' ? 'No expenses match — try another month or filter.' : 'When the shop spends, it lands here. Rent, salary, electricity, chai.'}
                actionLabel="Add Expense" onAction={openNew} />
            ) : (
              <div className="table-wrap">
                <table className="data">
                  <thead><tr><th>Category</th><th>Date</th><th>Paid via</th><th className="num">Amount</th><th></th></tr></thead>
                  <tbody>
                    {rows.map((e) => (
                      <tr key={e.id}>
                        <td><div style={{ fontWeight: 600 }}>{e.category}</div>{e.notes && <div className="cell-sub">{e.notes}</div>}</td>
                        <td style={{ color: 'var(--muted)' }}>{formatDate(e.date)}</td>
                        <td><span className={`pill ${e.payment_method}`}>{PAY_METHOD_LABEL[e.payment_method]?.split(' ')[0] || e.payment_method}</span></td>
                        <td className="num mono" style={{ color: 'var(--rose)', fontWeight: 700 }}>−{money(e.amount)}</td>
                        <td>
                          <div className="row-actions">
                            <button className="icon-btn" title="Edit" aria-label="Edit expense" onClick={() => openEdit(e)}><Pencil size={15} /></button>
                            {user?.role === 'admin' && (
                              <button className="icon-btn" title="Delete" aria-label="Delete expense" style={{ color: 'var(--rose)' }} onClick={() => setConfirmDelete(e)}><Trash2 size={15} /></button>
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
        </div>

        {/* ------- breakdown ------- */}
        <div className="card card-pad" style={{ alignSelf: 'start' }}>
          <div className="card-title"><span style={{ display: 'flex', alignItems: 'center', gap: 9 }}><Flame size={16} color="var(--amber)" /> Where the money went — {monthLabel}</span></div>
          {byCategory.length === 0 ? (
            <p style={{ color: 'var(--muted)', fontSize: 12 }}>No expenses logged this month. Suspicious.</p>
          ) : (
            byCategory.map((c) => (
              <div key={c.category} style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, marginBottom: 4, gap: 10 }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.category}</span>
                  <span className="mono" style={{ color: 'var(--muted)' }}>{money(c.total, 0)}</span>
                </div>
                <div className="top-bar-track"><div className="top-bar-fill" style={{ transform: `scaleX(${c.total / maxCat})`, background: 'linear-gradient(90deg,#fb6f92,#ffc24b)' }} /></div>
              </div>
            ))
          )}
          <div className="divider" />
          <div className="totals-row" style={{ fontSize: 13, alignItems: 'center' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Receipt size={14} /> Total this month</span>
            <b className="mono" style={{ color: 'var(--rose)' }}>{money(monthTotal, 0)}</b>
          </div>
        </div>
      </div>

      {/* ================= add/edit ================= */}
      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing === 'new' ? 'Add expense' : `Edit — ${editing?.category}`} sub="Kharcha track kiya hua kharcha kahin nahi jaata."
        footer={<>
          <button className="btn btn-ghost" onClick={() => setEditing(null)}>Cancel</button>
          <button className="btn btn-primary" form="expense-form" type="submit" disabled={saving}>{saving ? <span className="spinner" /> : 'Save expense'}</button>
        </>}>
        <form id="expense-form" className="form-grid" onSubmit={save}>
          <div className="field span-2"><label htmlFor="e-cat">Category *</label>
            <input id="e-cat" className="input" required autoFocus list="expense-suggestions" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="Rent, Salary, Electricity…" />
            <datalist id="expense-suggestions">{SUGGESTIONS.map((s) => <option key={s} value={s} />)}</datalist></div>
          <div className="field"><label htmlFor="e-amount">Amount (₹) *</label>
            <input id="e-amount" type="number" min="1" step="0.01" className="input mono" required value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="0.00" /></div>
          <div className="field"><label htmlFor="e-date">Date</label>
            <input id="e-date" type="date" className="input" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></div>
          <div className="field span-2"><label>Paid via</label>
            <div className="seg">{['cash', 'upi', 'card', 'bank'].map((m) => <button type="button" key={m} className={`seg-item${form.payment_method === m ? ' active' : ''}`} onClick={() => setForm({ ...form, payment_method: m })}>{PAY_METHOD_LABEL[m]}</button>)}</div></div>
          <div className="field span-2"><label htmlFor="e-notes">Notes</label>
            <input id="e-notes" className="input" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="What was this for…" /></div>
        </form>
      </Modal>

      <Modal open={!!confirmDelete} onClose={() => setConfirmDelete(null)} title="Delete expense?"
        sub={confirmDelete && `${confirmDelete.category} · ${money(confirmDelete.amount)}`}
        footer={<>
          <button className="btn btn-ghost" onClick={() => setConfirmDelete(null)}>Keep</button>
          <button className="btn btn-danger" onClick={() => remove(confirmDelete)}><Trash2 size={15} /> Delete</button>
        </>}>
        <p style={{ color: 'var(--muted)', fontSize: 12.5 }}>The expense disappears from this month’s profit math.</p>
      </Modal>
    </div>
  );
}
