// shopdesk — shared UI kit: toasts, modal, KPIs, charts, empty states
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, AlertOctagon, Info, ArrowUpRight, ArrowDownRight, X, PackageOpen } from 'lucide-react';

/* ============ money formatting (reacts to business currency) ============ */
export { formatMoney, compactMoney } from '../api.js';

/* ============ toasts ============ */
const ToastCtx = createContext(null);
export function useToast() { return useContext(ToastCtx); }

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const push = useCallback((type, title, message) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t.slice(-2), { id, type, title, message }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4600);
  }, []);
  const api = useMemo(() => ({
    success: (title, message) => push('success', title, message),
    error: (title, message) => push('error', title, message),
    info: (title, message) => push('info', title, message),
  }), [push]);
  return (
    <ToastCtx.Provider value={api}>
      {children}
      <div className="toast-stack">
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div key={t.id} className={`toast ${t.type === 'success' ? '' : t.type}`}
              initial={{ opacity: 0, x: 90, scale: 0.9 }} animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 60, transition: { duration: 0.18 } }}
              transition={{ type: 'spring', stiffness: 420, damping: 32 }}>
              <span style={{ marginTop: 1, color: t.type === 'error' ? 'var(--rose)' : t.type === 'info' ? 'var(--blue)' : 'var(--lime)' }}>
                {t.type === 'error' ? <AlertOctagon size={18} /> : t.type === 'info' ? <Info size={18} /> : <CheckCircle2 size={18} />}
              </span>
              <span><strong>{t.title}</strong>{t.message && <p>{t.message}</p>}</span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastCtx.Provider>
  );
}

/* ============ modal ============ */
export function Modal({ open, onClose, title, sub, children, footer, wide }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    if (open) window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="modal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          onMouseDown={onClose}>
          <motion.div className={`modal-panel${wide ? ' wide' : ''}`}
            initial={{ opacity: 0, y: 34, scale: 0.92 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 16, scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 360, damping: 30 }}
            onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={title}>
            <div className="modal-head">
              <div>
                <h2 className="modal-title">{title}</h2>
                {sub && <p className="modal-sub">{sub}</p>}
              </div>
              <button className="icon-btn" onClick={onClose} aria-label="Close" style={{ color: 'var(--muted)' }}><X size={19} /></button>
            </div>
            {children}
            {footer && <div className="modal-foot">{footer}</div>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ============ animated number ============ */
export function AnimatedNumber({ value, format = (v) => Math.round(v).toLocaleString('en-IN'), duration = 1.1 }) {
  const [display, setDisplay] = useState(0);
  const fromRef = useRef(0);
  useEffect(() => {
    const from = fromRef.current;
    const to = Number(value) || 0;
    const start = performance.now();
    let raf;
    const tick = (now) => {
      const t = Math.min(1, (now - start) / (duration * 1000));
      const eased = 1 - Math.pow(2, -9 * t) || 1; // easeOutExpo-ish
      const current = from + (to - from) * (t === 1 ? 1 : eased);
      setDisplay(current);
      if (t < 1) raf = requestAnimationFrame(tick);
      else fromRef.current = to;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);
  return <>{format(display)}</>;
}

/* ============ KPI card ============ */
export function KpiCard({ label, icon: Icon, iconColor = 'var(--lime)', iconBg = 'rgba(183,240,79,.12)', value, format, delta, deltaLabel, glow = 'rgba(183,240,79,.3)', delay = 0, onClick }) {
  return (
    <motion.div className="kpi" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay, type: 'spring', stiffness: 300, damping: 26 }}
      onClick={onClick} role={onClick ? 'button' : undefined} tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') onClick(); } : undefined}
      style={onClick ? { cursor: 'pointer' } : undefined}>
      <div className="kpi-glow" style={{ background: glow }} />
      <div className="kpi-label">
        <span className="kpi-icon" style={{ color: iconColor, background: iconBg }}><Icon size={15} strokeWidth={2.2} /></span>
        {label}
      </div>
      <div className="kpi-value"><AnimatedNumber value={value} format={format} /></div>
      <div className="kpi-foot">
        {delta != null && (
          <span className={`delta ${delta > 0.05 ? 'up' : delta < -0.05 ? 'down' : 'flat'}`}>
            {delta > 0.05 ? <ArrowUpRight size={11} /> : delta < -0.05 ? <ArrowDownRight size={11} /> : null}
            {delta > 0 ? '+' : ''}{delta.toFixed(1)}%
          </span>
        )}
        {deltaLabel && <span>{deltaLabel}</span>}
      </div>
    </motion.div>
  );
}

/* ============ skeletons ============ */
export function Skeleton({ height = 16, width = '100%', radius = 10, style }) {
  return <div className="skeleton" style={{ height, width, borderRadius: radius, ...style }} />;
}
export function TableSkeleton({ rows = 6, cols = 5 }) {
  return (
    <div>
      {Array.from({ length: rows }).map((_, i) => (
        <div className="skeleton-row" key={i}>
          {Array.from({ length: cols }).map((_, j) => (
            <Skeleton key={j} height={13} width={j === 0 ? '28%' : j === cols - 1 ? '12%' : '16%'} />
          ))}
        </div>
      ))}
    </div>
  );
}

/* ============ empty state ============ */
export function EmptyState({ icon: Icon = PackageOpen, title, message, actionLabel, onAction }) {
  return (
    <div className="empty-state">
      <div className="empty-orb"><Icon size={38} strokeWidth={1.6} /></div>
      <h3>{title}</h3>
      <p>{message}</p>
      {actionLabel && <button className="btn btn-primary" onClick={onAction}>{actionLabel}</button>}
    </div>
  );
}

/* ============ status pills ============ */
export function InvoiceStatusPill({ status }) {
  return <span className={`pill ${status}`}>{status === 'partial' ? 'Partial' : status}</span>;
}
export function StockPill({ stock, reorder, unit }) {
  const s = Number(stock);
  const cls = s <= 0 ? 'stock-pill out' : s <= Number(reorder) ? 'stock-pill low' : 'stock-pill';
  const text = s <= 0 ? 'Out of stock' : `${s} ${unit || ''}`.trim();
  return <span className={cls}>{text}</span>;
}

/* ============ area chart (animated, hoverable) ============ */
function smoothPath(points) {
  if (points.length < 2) return '';
  const d = [`M ${points[0].x.toFixed(2)},${points[0].y.toFixed(2)}`];
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)], p1 = points[i], p2 = points[i + 1], p3 = points[Math.min(points.length - 1, i + 2)];
    const cp1x = p1.x + (p2.x - p0.x) / 6, cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6, cp2y = p2.y - (p3.y - p1.y) / 6;
    d.push(`C ${cp1x.toFixed(2)},${cp1y.toFixed(2)} ${cp2x.toFixed(2)},${cp2y.toFixed(2)} ${p2.x.toFixed(2)},${p2.y.toFixed(2)}`);
  }
  return d.join(' ');
}
const dayLabel = (iso) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

export function AreaChart({ data, height = 190, formatValue = (v) => `₹${Math.round(v).toLocaleString('en-IN')}` }) {
  const [hover, setHover] = useState(null);
  const W = 640, H = 170, PAD = 6;
  const max = Math.max(...data.map((d) => d.total), 1);
  const min = 0;
  const innerH = H - PAD * 2;
  const points = data.map((d, i) => {
    const x = (i / (data.length - 1)) * W;
    const y = PAD + innerH - ((d.total - min) / (max - min)) * innerH;
    return { x, y, ...d };
  });
  const line = smoothPath(points);
  const area = `${line} L ${W},${H} L 0,${H} Z`;
  const onMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const frac = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const idx = Math.round(frac * (data.length - 1));
    setHover(idx);
  };
  const hoverPoint = hover != null ? points[hover] : null;
  const hoverFrac = hover != null ? hover / (data.length - 1) : 0;
  return (
    <div className="chart-box" onMouseMove={onMove} onMouseLeave={() => setHover(null)} style={{ height }}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" width="100%" height="100%" style={{ display: 'block', overflow: 'visible' }}>
        <defs>
          <linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#b7f04f" stopOpacity="0.34" />
            <stop offset="100%" stopColor="#b7f04f" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((f) => (
          <line key={f} x1="0" x2={W} y1={PAD + innerH * f} y2={PAD + innerH * f} stroke="rgba(148,184,255,.12)" strokeDasharray="3 5" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        ))}
        <path d={area} fill="url(#areaFill)" />
        <motion.path d={line} fill="none" stroke="#b7f04f" strokeWidth="2.4" strokeLinecap="round"
          vectorEffect="non-scaling-stroke" style={{ filter: 'drop-shadow(0 0 6px rgba(183,240,79,.5))' }}
          initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.25, ease: 'easeOut' }} />
        {hoverPoint && (
          <circle cx={hoverPoint.x} cy={hoverPoint.y} r="4.6" fill="#b7f04f" stroke="#0a0f1e" strokeWidth="2.4" vectorEffect="non-scaling-stroke" />
        )}
      </svg>
      {hoverPoint && (
        <>
          <div style={{ position: 'absolute', top: 0, bottom: 0, left: `${hoverFrac * 100}%`, width: 1, background: 'rgba(183,240,79,.35)', pointerEvents: 'none' }} />
          <div className="chart-tip" style={{ left: `${Math.min(88, Math.max(10, hoverFrac * 100))}%`, top: Math.max(12, (hoverPoint.y / H) * height - 10) }}>
            <div style={{ color: 'var(--muted)', fontSize: 9 }}>{dayLabel(hoverPoint.day)}</div>
            <b>{formatValue(hoverPoint.total)}</b>
            <div style={{ color: 'var(--muted)', fontSize: 9 }}>{hoverPoint.invoices} bill{hoverPoint.invoices === 1 ? '' : 's'}</div>
          </div>
        </>
      )}
    </div>
  );
}

/* ============ donut chart ============ */
const DONUT_COLORS = ['#b7f04f', '#a78bfa', '#5eead4', '#ffc24b', '#6ea8fe', '#fb6f92'];
export function Donut({ data, size = 132, stroke = 16, centerLabel, centerValue }) {
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div className="donut-wrap">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: 'rotate(-90deg)', flex: 'none' }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(148,184,255,.08)" strokeWidth={stroke} />
        {data.map((d, i) => {
          const frac = d.value / total;
          const dash = frac * c;
          const el = (
            <circle key={i} cx={size / 2} cy={size / 2} r={r} fill="none"
              stroke={d.color || DONUT_COLORS[i % DONUT_COLORS.length]} strokeWidth={stroke} strokeLinecap="round"
              strokeDasharray={`${Math.max(0.5, dash - 2.5)} ${c - Math.max(0.5, dash - 2.5)}`}
              strokeDashoffset={-(offset - c / 4)}
              style={{ transition: 'stroke-dasharray 0.9s ease', filter: 'drop-shadow(0 0 4px rgba(0,0,0,.35))' }} />
          );
          offset += dash;
          return el;
        })}
        {centerValue != null && (
          <g style={{ transform: 'rotate(90deg)', transformBox: 'fill-box', transformOrigin: 'center' }}>
            <text x="50%" y="47%" textAnchor="middle" fill="#eaeef8" fontSize="16" fontWeight="700" fontFamily="'Space Grotesk'">{centerValue}</text>
            <text x="50%" y="63%" textAnchor="middle" fill="#8b96b6" fontSize="7" fontFamily="'JetBrains Mono'" letterSpacing="1.5">{centerLabel}</text>
          </g>
        )}
      </svg>
      <div className="donut-legend">
        {data.map((d, i) => (
          <div className="legend-row" key={i}>
            <span className="legend-dot" style={{ background: d.color || DONUT_COLORS[i % DONUT_COLORS.length] }} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.label}</span>
            <span className="mono">{Math.round((d.value / total) * 100)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ============ horizontal bar list (top products) ============ */
export function BarList({ items, valueKey = 'qty', formatValue = (v) => v, color = 'var(--grad-brand)' }) {
  const max = Math.max(...items.map((i) => i[valueKey] || 0), 1);
  return (
    <div>
      {items.map((item, i) => (
        <div className="top-bar-row" key={i}>
          <span className="top-bar-name" title={item.name}>{item.name}</span>
          <div className="top-bar-track">
            <motion.div className="top-bar-fill" style={{ background: color }}
              initial={{ scaleX: 0 }} animate={{ scaleX: (item[valueKey] || 0) / max }}
              transition={{ duration: 0.8, delay: i * 0.07, ease: 'easeOut' }} />
          </div>
          <span className="top-bar-val">{formatValue(item[valueKey])}</span>
        </div>
      ))}
    </div>
  );
}
