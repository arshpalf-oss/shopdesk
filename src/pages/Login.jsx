// shopdesk — sign in
import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Zap, Mail, Lock, Eye, EyeOff, AlertOctagon, ArrowRight, Sparkles, Printer, TrendingUp, ShieldCheck, Store, Pill, Cpu, Croissant, Shirt, Coffee, Wrench, ShoppingBasket } from 'lucide-react';
import { useApp } from '../store.jsx';

const BUSINESS_TYPES = [
  { label: 'kirana stores', icon: Store },
  { label: 'pharmacies', icon: Pill },
  { label: 'electronics shops', icon: Cpu },
  { label: 'bakeries', icon: Croissant },
  { label: 'boutiques', icon: Shirt },
  { label: 'cafes', icon: Coffee },
  { label: 'hardware stores', icon: Wrench },
  { label: 'supermarts', icon: ShoppingBasket },
];

function WordRotator() {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setIndex((i) => (i + 1) % BUSINESS_TYPES.length), 2200);
    return () => clearInterval(t);
  }, []);
  const Current = BUSINESS_TYPES[index];
  return (
    <span className="word-rotator" style={{ minWidth: '11ch' }}>
      <AnimatePresence mode="wait">
        <motion.span
          key={index}
          initial={{ y: 22, opacity: 0, rotateX: -70, filter: 'blur(6px)' }}
          animate={{ y: 0, opacity: 1, rotateX: 0, filter: 'blur(0px)' }}
          exit={{ y: -18, opacity: 0, rotateX: 60, filter: 'blur(6px)' }}
          transition={{ duration: 0.38, ease: [0.22, 1, 0.36, 1] }}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 12 }}>
          <Current.icon strokeWidth={1.8} size="0.8em" />
          {Current.label}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

function FloatingReceipt() {
  return (
    <div className="float-card receipt-card" aria-hidden="true">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px dashed var(--line-strong)', paddingBottom: 8, marginBottom: 8 }}>
        <Zap size={13} color="var(--lime)" fill="var(--lime)" />
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '.18em', color: 'var(--muted)' }}>GST BILL · INV-0924</span>
      </div>
      {[
        ['Fortune Oil 1L', '₹137'],
        ['Kurkure Masala 110g', '₹20'],
        ['Amul Gold Milk 1L', '₹68'],
        ['Tata Salt 1kg', '₹24'],
      ].map(([name, price], i) => (
        <div className="float-chip" key={i} style={{ animationDelay: `${0.35 + i * 0.24}s` }}>
          <span style={{ width: 5, height: 5, borderRadius: 2, background: 'var(--teal)', flex: 'none' }} />
          <span style={{ fontSize: 10.5, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
          <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)' }}>{price}</span>
        </div>
      ))}
      <div style={{ borderTop: '1px dashed var(--line-strong)', marginTop: 9, paddingTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--muted)', letterSpacing: '.1em' }}>TOTAL</span>
        <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 15, color: 'var(--lime)' }}>₹249</span>
      </div>
      <div className="float-barcode" aria-hidden="true">
        {[3, 1.5, 4, 1.5, 2.5, 4.5, 1.5, 3, 1.5, 2, 5, 1.5, 3, 2, 1.5, 4, 2.5, 1.5, 3.5, 2].map((w, i) => (
          <i key={i} style={{ width: `${w * 1.6}px` }} />
        ))}
      </div>
    </div>
  );
}

export default function Login() {
  const { user, login } = useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('aarav@shopdesk.demo');
  const [password, setPassword] = useState('demo1234');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [shake, setShake] = useState(false);

  useEffect(() => { if (user) navigate('/', { replace: true }); }, [user, navigate]);

  const from = location.state?.from;

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await login(email.trim(), password);
      navigate(from && from !== '/login' ? from : '/', { replace: true });
    } catch (err) {
      setError(err.message || 'Could not sign you in.');
      setShake(true);
      setTimeout(() => setShake(false), 600);
      setBusy(false);
    }
  };

  const fillDemo = (who) => {
    setEmail(who === 'owner' ? 'aarav@shopdesk.demo' : 'riya@shopdesk.demo');
    setPassword('demo1234');
    setError('');
  };

  const barcode = useMemo(() => [2, 4, 1.5, 3, 1.5, 2.5, 4, 1.5, 3.5, 1.5, 2, 4.5, 1.5, 3, 1.5, 2.5], []);

  return (
    <div className="login-shell">
      {/* ================= hero side ================= */}
      <div className="login-hero">
        <div className="hero-logo">
          <div className="hero-mark">
            <svg width="30" height="30" viewBox="0 0 64 64" fill="none" aria-hidden="true">
              <path d="M19 12h26a3 3 0 0 1 3 3v31l-4.6-3.5-5.9 4.9-5.6-4.9-5.5 4.9-5.9-4.9L16 46V15a3 3 0 0 1 3-3z" fill="#0b120a" />
              <circle cx="32" cy="25" r="2.6" fill="#b7f04f" />
              <circle cx="32" cy="35" r="2.6" fill="#b7f04f" opacity="0.72" />
            </svg>
          </div>
          <div>
            <div className="wordmark" style={{ fontSize: 30 }}>shop<em>desk</em></div>
            <div className="wordmark-sub" style={{ fontSize: 9 }}>Every business. One desk.</div>
          </div>
        </div>

        <h1 className="hero-headline">
          Billing &amp; stock for<br />
          <WordRotator /><br />
          <span className="serif">without the chaos.</span>
        </h1>
        <p className="hero-sub">
          GST invoices in seconds, live stock control, barcode billing, udhaar tracking,
          expense bookkeeping and accountant-ready reports — one beautifully fast desk for your whole shop.
        </p>

        <div className="hero-stats">
          <div className="hero-stat"><b>924+</b><span>demo bills loaded</span></div>
          <div className="hero-stat"><b>₹3.5L</b><span>sample sales history</span></div>
          <div className="hero-stat"><b>75</b><span>days of live reports</span></div>
        </div>

        <FloatingReceipt />

        <div className="float-card toast-card" aria-hidden="true">
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <span style={{ width: 30, height: 30, borderRadius: 10, background: 'rgba(45,212,167,.15)', display: 'grid', placeItems: 'center', color: 'var(--teal)' }}><Printer size={16} /></span>
            <span>
              <span style={{ fontSize: 10.5, fontWeight: 700, display: 'block' }}>Bill INV-0924 printed</span>
              <span style={{ fontSize: 9, color: 'var(--muted)', fontFamily: 'var(--font-mono)' }}>UPI · ₹681.65 · just now</span>
            </span>
          </div>
        </div>

        <div className="float-badge" aria-hidden="true">
          <TrendingUp size={14} /> Sales up 12.4% vs yesterday
        </div>
      </div>

      {/* ================= form side ================= */}
      <div className="login-panel">
        <div className={`login-card${shake ? ' shake' : ''}`}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <ShieldCheck size={16} color="var(--teal)" />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '.22em', color: 'var(--muted)', textTransform: 'uppercase' }}>Secure sign in</span>
          </div>
          <h1>Welcome back, <span style={{ color: 'var(--lime)' }}>shopkeeper.</span></h1>
          <p className="sub">Sign in to open your counter. New here? Ask your admin to create your account.</p>

          {error && (
            <div className="error-banner" role="alert">
              <AlertOctagon size={17} style={{ flex: 'none' }} />
              <span>{error}</span>
            </div>
          )}

          <div className="demo-chips">
            <button type="button" className="demo-chip" onClick={() => fillDemo('owner')}>
              <span><small>Demo · Owner</small><span>Aarav Sharma</span></span>
            </button>
            <button type="button" className="demo-chip" onClick={() => fillDemo('staff')}>
              <span><small>Demo · Staff</small><span>Riya Verma</span></span>
            </button>
          </div>

          <form onSubmit={submit}>
            <div className="field" style={{ marginBottom: 12 }}>
              <label htmlFor="email">Email</label>
              <div style={{ position: 'relative' }}>
                <Mail size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }} />
                <input id="email" className="input" type="email" autoComplete="email" value={email}
                  onChange={(e) => setEmail(e.target.value)} placeholder="you@yourshop.in" required
                  style={{ paddingLeft: 38 }} />
              </div>
            </div>
            <div className="field" style={{ marginBottom: 18 }}>
              <label htmlFor="password">Password</label>
              <div style={{ position: 'relative' }}>
                <Lock size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }} />
                <input id="password" className="input" type={showPassword ? 'text' : 'password'} autoComplete="current-password"
                  value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required
                  style={{ paddingLeft: 38, paddingRight: 44 }} />
                <button type="button" className="icon-btn" aria-label={showPassword ? 'Hide password' : 'Show password'}
                  onClick={() => setShowPassword((v) => !v)}
                  style={{ position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)', width: 34, height: 34 }}>
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            <button type="submit" className="btn btn-primary btn-lg" disabled={busy} style={{ width: '100%', justifyContent: 'center' }}>
              {busy ? <span className="spinner" /> : <>Unlock my counter <ArrowRight size={17} strokeWidth={2.4} /></>}
            </button>
          </form>

          <div className="divider" style={{ display: 'flex', alignItems: 'center', gap: 12, border: 'none', background: 'none', margin: '20px 0 14px' }}>
            <span style={{ flex: 1, height: 1, background: 'var(--line)' }} />
            <Sparkles size={13} color="var(--lime)" />
            <span style={{ flex: 1, height: 1, background: 'var(--line)' }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 18, color: 'var(--muted)', fontSize: 10.5 }}>
            <span>GST invoices</span><span>·</span><span>Live stock</span><span>·</span><span>UPI QR on every bill</span><span>·</span><span>JSON backup</span>
          </div>
          <div className="login-foot">shopdesk v2.0 — made for Indian retail, ready for everywhere</div>
        </div>
      </div>
    </div>
  );
}
