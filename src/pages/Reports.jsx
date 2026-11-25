// shopdesk — reports & GST (accountant-ready)
import React, { useCallback, useEffect, useState } from 'react';
import {
  BarChart3, Download, IndianRupee, ReceiptText, ShoppingBag, Gauge, Landmark, TrendingUp, Flame, Wallet, PiggyBank, CalendarDays,
} from 'lucide-react';
import { api, PAY_METHOD_LABEL } from '../api.js';
import { useApp } from '../store.jsx';
import { useToast, AreaChart, Donut, BarList, KpiCard, Skeleton, EmptyState } from '../components/ui.jsx';

const iso = (d) => {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};
const addDays = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d; };

const PRESETS = [
  { id: 'today', label: 'Today' },
  { id: '7d', label: '7 days' },
  { id: '30d', label: '30 days' },
  { id: '90d', label: '90 days' },
  { id: 'fy', label: 'FY 26–27' },
];

export default function Reports() {
  const { money } = useApp();
  const toast = useToast();
  const [preset, setPreset] = useState('30d');
  const [from, setFrom] = useState(iso(addDays(-29)));
  const [to, setTo] = useState(iso(new Date()));
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    api(`/reports/summary?from=${from}&to=${to}`)
      .then(setData)
      .catch((err) => toast.error('Report failed', err.message))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to]);

  useEffect(() => { load(); }, [load]);

  const applyPreset = (id) => {
    setPreset(id);
    const end = iso(new Date());
    setTo(end);
    if (id === 'today') setFrom(end);
    else if (id === '7d') setFrom(iso(addDays(-6)));
    else if (id === '30d') setFrom(iso(addDays(-29)));
    else if (id === '90d') setFrom(iso(addDays(-89)));
    else if (id === 'fy') setFrom('2026-04-01');
  };

  const exportCsv = () => { window.location.href = `/api/reports/export?from=${from}&to=${to}`; };

  const revDelta = data && data.previous.revenue > 0 ? ((data.kpis.revenue - data.previous.revenue) / data.previous.revenue) * 100 : null;
  const gstTotals = data ? data.gst.reduce((acc, r) => ({ taxable: acc.taxable + r.taxable, cgst: acc.cgst + r.cgst, sgst: acc.sgst + r.sgst, tax: acc.tax + r.tax }), { taxable: 0, cgst: 0, sgst: 0, tax: 0 }) : null;

  return (
    <div>
      <div className="page-head">
        <div>
          <h1 className="page-title">Reports &amp; <em>GST</em></h1>
          <div className="page-sub"><CalendarDays size={11} style={{ verticalAlign: '-1px' }} /> {from} → {to} · {data?.kpis.invoices ?? 0} bills</div>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={exportCsv}><Download size={14} /> Export sales CSV</button>
      </div>

      {/* ---------- period controls ---------- */}
      <div className="card card-pad" style={{ marginBottom: 14, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <div className="seg">
          {PRESETS.map((p) => <button key={p.id} className={`seg-item${preset === p.id ? ' active' : ''}`} onClick={() => applyPreset(p.id)}>{p.label}</button>)}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginLeft: 'auto' }}>
          <input type="date" className="input" value={from} onChange={(e) => { setFrom(e.target.value); setPreset(null); }} style={{ width: 148 }} aria-label="From" />
          <span style={{ color: 'var(--muted)' }}>→</span>
          <input type="date" className="input" value={to} onChange={(e) => { setTo(e.target.value); setPreset(null); }} style={{ width: 148 }} aria-label="To" />
        </div>
      </div>

      {loading || !data ? (
        <>
          <div className="kpi-grid">{[0, 1, 2, 3].map((i) => <div className="skeleton" key={i} style={{ height: 118 }} />)}</div>
          <div className="skeleton" style={{ height: 260, marginTop: 14 }} />
        </>
      ) : (
        <>
          {/* ---------- KPI strips ---------- */}
          <div className="kpi-grid">
            <KpiCard label="Revenue" icon={IndianRupee} value={data.kpis.revenue} format={(v) => money(v, 0)}
              delta={revDelta} deltaLabel="vs previous period" iconColor="#b7f04f" iconBg="rgba(183,240,79,.13)" glow="rgba(183,240,79,.3)" delay={0} />
            <KpiCard label="Bills" icon={ReceiptText} value={data.kpis.invoices} format={(v) => String(Math.round(v))}
              deltaLabel={`avg bill ${money(data.kpis.avgBill, 0)}`} iconColor="#5eead4" iconBg="rgba(94,234,212,.12)" glow="rgba(94,234,212,.28)" delay={0.05} />
            <KpiCard label="Items sold" icon={ShoppingBag} value={data.kpis.itemsSold} format={(v) => Math.round(v).toLocaleString('en-IN')}
              deltaLabel={`tax collected ${money(data.kpis.taxCollected, 0)}`} iconColor="#a78bfa" iconBg="rgba(167,139,250,.13)" glow="rgba(167,139,250,.3)" delay={0.1} />
            <KpiCard label="GST collected" icon={Landmark} value={data.kpis.taxCollected} format={(v) => money(v, 0)}
              deltaLabel="CGST + SGST output tax" iconColor="#6ea8fe" iconBg="rgba(110,168,254,.13)" glow="rgba(110,168,254,.3)" delay={0.15} />
          </div>
          <div className="kpi-grid" style={{ marginTop: 14 }}>
            <KpiCard label="Gross profit" icon={TrendingUp} value={data.kpis.grossProfit} format={(v) => money(v, 0)}
              deltaLabel="after item discounts & costs" iconColor="#2dd4a7" iconBg="rgba(45,212,167,.12)" glow="rgba(45,212,167,.28)" delay={0} />
            <KpiCard label="Expenses" icon={Wallet} value={data.kpis.expenses} format={(v) => money(v, 0)}
              deltaLabel="shop kharchas in range" iconColor="#fb6f92" iconBg="rgba(251,111,146,.12)" glow="rgba(251,111,146,.28)" delay={0.05} />
            <KpiCard label="Net profit" icon={PiggyBank} value={data.kpis.netProfit} format={(v) => money(v, 0)}
              deltaLabel="gross profit − expenses" iconColor={data.kpis.netProfit >= 0 ? '#b7f04f' : '#fb6f92'} iconBg={data.kpis.netProfit >= 0 ? 'rgba(183,240,79,.13)' : 'rgba(251,111,146,.13)'} glow={data.kpis.netProfit >= 0 ? 'rgba(183,240,79,.3)' : 'rgba(251,111,146,.3)'} delay={0.1} />
            <KpiCard label="Avg bill size" icon={Gauge} value={data.kpis.avgBill} format={(v) => money(v, 0)}
              deltaLabel="revenue ÷ bills" iconColor="#ffc24b" iconBg="rgba(255,194,75,.12)" glow="rgba(255,194,75,.28)" delay={0.15} />
          </div>

          {/* ---------- revenue chart ---------- */}
          <div className="card card-pad section-gap">
            <div className="card-title">
              <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}><Flame size={16} color="var(--amber)" /> Revenue trend</span>
              <small>{money(data.kpis.revenue, 0)} in range</small>
            </div>
            {data.byDay.some((d) => d.total > 0)
              ? <AreaChart data={data.byDay} height={200} formatValue={(v) => money(v, 0)} />
              : <EmptyState icon={BarChart3} title="No sales in this range" message="Pick a wider period or complete a sale — the curve wakes up instantly." />}
          </div>

          {/* ---------- payments + top products ---------- */}
          <div className="grid-dashboard-2">
            <div className="card card-pad">
              <div className="card-title"><span>Payment mix</span><small>{data.byPayment.reduce((s, p) => s + p.n, 0)} bills</small></div>
              {data.byPayment.length ? (
                <Donut data={data.byPayment.map((p) => ({ label: PAY_METHOD_LABEL[p.method] || p.method, value: p.total }))} centerValue={money(data.kpis.revenue, 0)} centerLabel="REVENUE" />
              ) : <p style={{ color: 'var(--muted)' }}>No payments in range.</p>}
              <div className="divider" />
              <div className="card-title"><span>Revenue by category</span></div>
              {data.byCategory.length ? <BarList items={data.byCategory} valueKey="revenue" formatValue={(v) => money(v, 0)} /> : <p style={{ color: 'var(--muted)', fontSize: 12 }}>No category sales.</p>}
            </div>
            <div className="card card-pad">
              <div className="card-title"><span>Top products by revenue</span><small>in range</small></div>
              {data.topProducts.length ? <BarList items={data.topProducts} valueKey="revenue" formatValue={(v) => money(v, 0)} color="linear-gradient(90deg,#a78bfa,#6ea8fe)" /> : <p style={{ color: 'var(--muted)', fontSize: 12 }}>No items sold.</p>}
            </div>
          </div>

          {/* ---------- GST summary ---------- */}
          <div className="card card-pad section-gap">
            <div className="card-title"><span>GST summary — output tax</span><small>CGST + SGST (intra-state)</small></div>
            <div className="table-wrap">
              <table className="data">
                <thead><tr><th>GST rate</th><th className="num">Taxable value</th><th className="num">CGST</th><th className="num">SGST</th><th className="num">Total tax</th></tr></thead>
                <tbody>
                  {data.gst.length === 0 && <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--muted)', padding: 20 }}>No taxable sales in this range.</td></tr>}
                  {data.gst.map((row) => (
                    <tr key={row.rate}>
                      <td className="mono" style={{ fontWeight: 700 }}>{row.rate}%</td>
                      <td className="num mono">{money(row.taxable)}</td>
                      <td className="num mono">{money(row.cgst)}</td>
                      <td className="num mono">{money(row.sgst)}</td>
                      <td className="num mono" style={{ color: 'var(--violet)' }}>{money(row.tax)}</td>
                    </tr>
                  ))}
                </tbody>
                {gstTotals && (
                  <tfoot>
                    <tr>
                      <td style={{ fontWeight: 800, fontFamily: 'var(--font-display)' }}>TOTAL</td>
                      <td className="num mono" style={{ fontWeight: 700 }}>{money(gstTotals.taxable)}</td>
                      <td className="num mono" style={{ fontWeight: 700 }}>{money(gstTotals.cgst)}</td>
                      <td className="num mono" style={{ fontWeight: 700 }}>{money(gstTotals.sgst)}</td>
                      <td className="num mono" style={{ fontWeight: 800, color: 'var(--lime)' }}>{money(gstTotals.tax)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
            <p style={{ color: 'var(--muted-2)', fontSize: 10.5, marginTop: 10 }}>Interstate supplies (IGST) are reported separately on those bills. Hand this table to your CA — it reconciles with GSTR-1 outward supplies.</p>
          </div>
        </>
      )}
    </div>
  );
}
