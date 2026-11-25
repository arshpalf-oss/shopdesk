// shopdesk — dashboard
import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Banknote, TrendingUp, HandCoins, TriangleAlert, Zap, Plus, Truck, Wallet, ChevronRight,
  ArrowRight, Flame, PackageCheck, Percent, ArrowUpRight, ArrowDownRight,
} from 'lucide-react';
import { api } from '../api.js';
import { useApp } from '../store.jsx';
import { useToast, KpiCard, AreaChart, Donut, BarList, TableSkeleton, EmptyState, InvoiceStatusPill } from '../components/ui.jsx';
import { PAY_METHOD_LABEL, formatDate, timeAgo } from '../api.js';

export default function Dashboard() {
  const { user, business, money, compact, currency } = useApp();
  const toast = useToast();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [restocking, setRestocking] = useState(null);

  const load = useCallback(() => {
    api('/dashboard').then(setData).catch((e) => setError(e.message));
  }, []);
  useEffect(() => { load(); }, [load]);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  const pctDelta = (cur, prev) => (prev > 0 ? ((cur - prev) / prev) * 100 : null);

  const restock = async (product) => {
    setRestocking(product.id);
    // optimistic: pop it out of the alert list immediately
    setData((d) => d ? { ...d, lowStock: d.lowStock.filter((p) => p.id !== product.id), lowStockCount: Math.max(0, d.lowStockCount - 1) } : d);
    try {
      await api(`/products/${product.id}/adjust-stock`, { method: 'POST', body: { delta: 25, reason: 'Quick restock (dashboard)' } });
      toast.success('Restocked', `+25 units of “${product.name}” added.`);
    } catch (err) {
      toast.error('Restock failed', err.message);
      load(); // roll back optimistic state
    } finally {
      setRestocking(null);
    }
  };

  if (error) {
    return <EmptyState icon={TriangleAlert} title="Couldn’t load the dashboard" message={error} actionLabel="Retry" onAction={() => { setError(''); load(); }} />;
  }

  if (!data) {
    return (
      <div>
        <div className="page-head"><div><div className="page-title">Loading your <em>desk…</em></div></div></div>
        <div className="kpi-grid">{[0, 1, 2, 3].map((i) => <div className="skeleton" key={i} style={{ height: 118 }} />)}</div>
        <div className="grid-dashboard">
          <div className="skeleton" style={{ height: 280 }} />
          <div className="skeleton" style={{ height: 280 }} />
        </div>
        <div className="grid-dashboard-2"><TableSkeleton rows={5} cols={5} /><div className="skeleton" style={{ height: 240 }} /></div>
      </div>
    );
  }

  const todayDelta = pctDelta(data.today.sales, data.yesterday.sales);
  const monthDelta = pctDelta(data.month.sales, data.prevMonthSales);
  const thirtyDayTotal = data.salesByDay.reduce((s, d) => s + d.total, 0);
  const bestDay = data.salesByDay.reduce((best, d) => (d.total > (best?.total || 0) ? d : best), null);
  const avgDay = thirtyDayTotal / Math.max(1, data.salesByDay.length);
  const tickerItems = [...data.ticker, ...data.ticker];

  return (
    <div>
      {/* ---------- header row ---------- */}
      <div className="page-head">
        <div>
          <h1 className="page-title">{greeting}, <em>{(user?.name || 'there').split(' ')[0]}</em> 👋</h1>
          <div className="page-sub">
            {business?.name} · {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button className="btn btn-ghost btn-sm" onClick={() => navigate('/purchases?new=1')}><Truck size={14} /> Record purchase</button>
          <button className="btn btn-ghost btn-sm" onClick={() => navigate('/expenses?new=1')}><Wallet size={14} /> Add expense</button>
          <button className="btn btn-primary" onClick={() => navigate('/billing')}><Zap size={16} /> New Sale <kbd className="kbd" style={{ background: 'rgba(0,0,0,.18)', borderColor: 'rgba(0,0,0,.25)', color: '#0b120a' }}>F2</kbd></button>
        </div>
      </div>

      {/* ---------- KPI grid ---------- */}
      <div className="kpi-grid">
        <KpiCard label="Today’s sales" icon={Banknote} value={data.today.sales} format={(v) => money(v, 0)}
          delta={todayDelta} deltaLabel={`vs ${money(data.yesterday.sales, 0)} yesterday · ${data.today.invoices} bills`}
          iconColor="#b7f04f" iconBg="rgba(183,240,79,.13)" glow="rgba(183,240,79,.35)" delay={0} />
        <KpiCard label="This month" icon={TrendingUp} value={data.month.sales} format={(v) => money(v, 0)}
          delta={monthDelta} deltaLabel={`vs ${money(data.prevMonthSales, 0)} last month · ${data.month.invoices} bills`}
          iconColor="#5eead4" iconBg="rgba(94,234,212,.12)" glow="rgba(94,234,212,.3)" delay={0.06} />
        <KpiCard label="Outstanding credit" icon={HandCoins} value={data.outstanding.total} format={(v) => money(v, 0)}
          deltaLabel={`udhaar across ${data.outstanding.invoices} bills`}
          iconColor="#ffc24b" iconBg="rgba(255,194,75,.13)" glow="rgba(255,194,75,.3)" delay={0.12}
          onClick={() => navigate('/invoices?status=unpaid')} />
        <KpiCard label="Low stock items" icon={TriangleAlert} value={data.lowStockCount} format={(v) => String(Math.round(v))}
          deltaLabel="tap to restock"
          iconColor="#fb6f92" iconBg="rgba(251,111,146,.13)" glow="rgba(251,111,146,.32)" delay={0.18}
          onClick={() => navigate('/products?stock=low')} />
      </div>

      {/* ---------- live ticker ---------- */}
      <div className="ticker-wrap section-gap" style={{ border: '1px solid var(--line)', borderRadius: 12 }}>
        <span className="ticker-live"><span className="live-dot" /> LIVE BILLS</span>
        <div className="ticker">
          <div className="ticker-inner">
            {tickerItems.map((t, i) => (
              <span className="tick-item" key={i}>
                <b>{t.invoice_no}</b> · {t.customer_name.slice(0, 22)} · ₹{Number(t.grand_total).toFixed(0)} · {t.payment_method.toUpperCase()}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* ---------- sales chart + payments ---------- */}
      <div className="grid-dashboard">
        <div className="card card-pad">
          <div className="card-title">
            <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}><Flame size={16} color="var(--amber)" /> Sales — last 30 days</span>
            <small>{money(thirtyDayTotal, 0)} total</small>
          </div>
          <AreaChart data={data.salesByDay} formatValue={(v) => money(v, 0)} height={196} />
          <div style={{ display: 'flex', gap: 18, marginTop: 12, flexWrap: 'wrap' }}>
            <div style={{ fontSize: 10.5, color: 'var(--muted)' }}><span className="mono" style={{ color: 'var(--lime)' }}>{bestDay ? formatDate(bestDay.day) : '—'}</span><br />best day · {bestDay ? money(bestDay.total, 0) : ''}</div>
            <div style={{ fontSize: 10.5, color: 'var(--muted)' }}><span className="mono" style={{ color: 'var(--teal)' }}>{money(avgDay, 0)}</span><br />daily average</div>
            <div style={{ fontSize: 10.5, color: 'var(--muted)' }}><span className="mono" style={{ color: 'var(--violet)' }}>{data.salesByDay.reduce((s, d) => s + d.invoices, 0)}</span><br />bills this month</div>
          </div>
        </div>

        <div className="card card-pad">
          <div className="card-title"><span style={{ display: 'flex', alignItems: 'center', gap: 10 }}><Percent size={16} color="var(--violet)" /> How they pay — this month</span></div>
          {data.paymentModes.length ? (
            <Donut
              data={data.paymentModes.map((p) => ({ label: PAY_METHOD_LABEL[p.method] || p.method, value: p.total }))}
              centerValue={money(data.month.sales, 0)} centerLabel="MONTH" />
          ) : <p style={{ color: 'var(--muted)', fontSize: 12 }}>No bills yet this month.</p>}
          <div className="divider" />
          <div className="card-title" style={{ marginBottom: 8 }}><span style={{ display: 'flex', alignItems: 'center', gap: 10 }}><TriangleAlert size={15} color="var(--amber)" /> Reorder soon</span><small>{data.lowStockCount} below level</small></div>
          <div style={{ maxHeight: 190, overflowY: 'auto' }} className="scroll-thin">
            {data.lowStock.length === 0 && <p style={{ color: 'var(--muted)', fontSize: 12 }}>Everything is well stocked. Impressive.</p>}
            {data.lowStock.slice(0, 4).map((p) => (
              <div className="low-stock-row" key={p.id}>
                <PackageCheck size={16} color="var(--amber)" style={{ flex: 'none' }} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="low-stock-name" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
                  <div className="low-stock-meta">{p.stock} {p.unit} left · reorder at {p.reorder_level}</div>
                </div>
                <button className="btn btn-ghost btn-sm" disabled={restocking === p.id} onClick={() => restock(p)} style={{ flex: 'none' }}>
                  {restocking === p.id ? <span className="spinner light" style={{ width: 12, height: 12 }} /> : <Plus size={13} />} +25
                </button>
              </div>
            ))}
            {data.lowStockCount > 4 && (
              <Link to="/products?stock=low" style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'center', marginTop: 8, color: 'var(--amber)', fontSize: 11, textDecoration: 'none', fontWeight: 600 }}>
                View all {data.lowStockCount} low-stock items <ArrowRight size={13} />
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* ---------- recent bills + top products ---------- */}
      <div className="grid-dashboard-2">
        <div className="card card-pad">
          <div className="card-title">
            <span>Recent bills</span>
            <Link to="/invoices" style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--lime)', fontSize: 11, fontWeight: 700, textDecoration: 'none', fontFamily: 'var(--font-mono)', letterSpacing: '.06em' }}>ALL BILLS <ChevronRight size={13} /></Link>
          </div>
          <div className="table-wrap">
            <table className="data">
              <thead><tr><th>Bill</th><th>Customer</th><th className="num">Amount</th><th>Status</th><th>When</th></tr></thead>
              <tbody>
                {data.recentInvoices.map((inv) => (
                  <tr key={inv.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/invoices?q=${inv.invoice_no}`)}>
                    <td className="mono" style={{ color: 'var(--lime)' }}>{inv.invoice_no}</td>
                    <td>{inv.customer_name}</td>
                    <td className="num mono">{money(inv.grand_total, 0)}</td>
                    <td><InvoiceStatusPill status={inv.status} /></td>
                    <td style={{ color: 'var(--muted)' }}>{timeAgo(inv.date)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card card-pad">
          <div className="card-title"><span style={{ display: 'flex', alignItems: 'center', gap: 10 }}><ArrowUpRight size={16} color="var(--lime)" /> Top sellers — 30 days</span></div>
          {data.topProducts.length ? (
            <BarList items={data.topProducts} valueKey="qty" formatValue={(v) => `${Math.round(v)} pcs`} />
          ) : (
            <EmptyState icon={ArrowDownRight} title="No sales yet" message="Once you bill, your best-sellers appear here." />
          )}
        </div>
      </div>
    </div>
  );
}
