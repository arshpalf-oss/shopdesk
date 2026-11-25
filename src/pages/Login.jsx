// shopdesk — sign in
import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Zap, Mail, Lock, Eye, EyeOff, AlertOctagon, ArrowRight, Sparkles, Printer, TrendingUp, ShieldCheck, Store, Pill, Cpu, Croissant, Shirt, Coffee, Wrench, ShoppingBasket, Building2, User, PackageCheck, BadgeCheck } from 'lucide-react';
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
  const { user, login, signup } = useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const [mode, setMode] = useState('signin'); // 'signin' | 'signup'
  const [businessName, setBusinessName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [email, setEmail] = useState('aarav@shopdesk.demo');
  const [password, setPassword] = useState('demo1234');
  const [withSampleData, setWithSampleData] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [shake, setShake] = useState(false);

  useEffect(() => { if (user) navigate('/', { replace: true }); }, [user, navigate]);

  const from = location.state?.from;

  const switchMode = (next) => {
    setMode(next);
    setError('');
    if (next === 'signup') { setEmail(''); setPassword(''); } else { setEmail('aarav@shopdesk.demo'); setPassword('demo1234'); }
  };

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      if (mode === 'signup') {
        await signup({ businessName: businessName.trim(), name: ownerName.trim(), email: email.trim(), password, withSampleData });
      } else {
        await login(email.trim(), password);
      }
      navigate(from && from !== '/login' ? from : '/', { replace: true });
    } catch (err) {
      setError(err.message || (mode === 'signup' ? 'Could not create your workspace.' : 'Could not sign you in.'));
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
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '.22em', color: 'var(--muted)', textTransform: 'uppercase' }}>{mode === 'signup' ? 'Create your workspace' : 'Secure sign in'}</span>
          </div>
          <div className="seg" style={{ marginBottom: 18 }} role="tablist" aria-label="Sign in or create workspace">
            <button type="button" role="tab" aria-selected={mode === 'signin'} className={`seg-item${mode === 'signin' ? ' active' : ''}`} onClick={() => switchMode('signin')}>Sign in</button>
            <button type="button" role="tab" aria-selected={mode === 'signup'} className={`seg-item${mode === 'signup' ? ' active' : ''}`} onClick={() => switchMode('signup')}>Create workspace</button>
          </div>
          <h1>{mode === 'signup' ? <>Your shop, <span style={{ color: 'var(--lime)' }}>ready in a minute.</span></> : <>Welcome back, <span style={{ color: 'var(--lime)' }}>shopkeeper.</span></>}</h1>
          <p className="sub">{mode === 'signup' ? 'Free while in early access — no card required. Your data stays yours, exports anytime.' : 'Sign in to open your counter. Or spin up a brand-new workspace of your own.'}</p>

          {error && (
            <div className="error-banner" role="alert">
              <AlertOctagon size={17} style={{ flex: 'none' }} />
              <span>{error}</span>
            </div>
          )}

          {mode === 'signin' && (
            <div className="demo-chips">
              <button type="button" className="demo-chip" onClick={() => fillDemo('owner')}>
                <span><small>Demo · Owner</small><span>Aarav Sharma</span></span>
              </button>
              <button type="button" className="demo-chip" onClick={() => fillDemo('staff')}>
                <span><small>Demo · Staff</small><span>Riya Verma</span></span>
              </button>
            </div>
          )}

          <form onSubmit={submit}>
            {mode === 'signup' && (
              <>
                <div className="field" style={{ marginBottom: 12 }}>
                  <label htmlFor="businessName">Business name</label>
                  <div style={{ position: 'relative' }}>
                    <Building2 size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }} />
                    <input id="businessName" className="input" type="text" autoComplete="organization" value={businessName}
                      onChange={(e) => setBusinessName(e.target.value)} placeholder="e.g. Shivam General Store" required
                      style={{ paddingLeft: 38 }} />
                  </div>
                </div>
                <div className="field" style={{ marginBottom: 12 }}>
                  <label htmlFor="ownerName">Your name</label>
                  <div style={{ position: 'relative' }}>
                    <User size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }} />
                    <input id="ownerName" className="input" type="text" autoComplete="name" value={ownerName}
                      onChange={(e) => setOwnerName(e.target.value)} placeholder="e.g. Aarav Sharma" required
                      style={{ paddingLeft: 38 }} />
                  </div>
                </div>
              </>
            )}
            <div className="field" style={{ marginBottom: 12 }}>
              <label htmlFor="email">Email</label>
              <div style={{ position: 'relative' }}>
                <Mail size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }} />
                <input id="email" className="input" type="email" autoComplete="email" value={email}
                  onChange={(e) => setEmail(e.target.value)} placeholder="you@yourshop.in" required
                  style={{ paddingLeft: 38 }} />
              </div>
            </div>
            <div className="field" style={{ marginBottom: mode === 'signup' ? 12 : 18 }}>
              <label htmlFor="password">Password{mode === 'signup' && <span style={{ color: 'var(--muted)', fontWeight: 400 }}> — min 8 characters</span>}</label>
              <div style={{ position: 'relative' }}>
                <Lock size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }} />
                <input id="password" className="input" type={showPassword ? 'text' : 'password'} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                  value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required
                  style={{ paddingLeft: 38, paddingRight: 44 }} />
                <button type="button" className="icon-btn" aria-label={showPassword ? 'Hide password' : 'Show password'}
                  onClick={() => setShowPassword((v) => !v)}
                  style={{ position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)', width: 34, height: 34 }}>
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            {mode === 'signup' && (
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, padding: '10px 12px', border: '1px solid var(--line)', borderRadius: 12, cursor: 'pointer', background: 'rgba(183,240,79,.04)' }}>
                <input type="checkbox" checked={withSampleData} onChange={(e) => setWithSampleData(e.target.checked)}
                  style={{ width: 17, height: 17, accentColor: 'var(--lime)', cursor: 'pointer', flex: 'none' }} />
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <PackageCheck size={17} color="var(--lime)" />
                  <span style={{ fontSize: 12, lineHeight: 1.35 }}><b>Start with a lived-in shop</b><br /><span style={{ color: 'var(--muted)' }}>924 sample bills, 75 days of sales, products &amp; reports — explored in seconds. Optional.</span></span>
                </span>
              </label>
            )}
            <button type="submit" className="btn btn-primary btn-lg" disabled={busy} style={{ width: '100%', justifyContent: 'center' }}>
              {busy
                ? <span className="spinner" />
                : mode === 'signup'
                  ? <>Open my workspace <ArrowRight size={17} strokeWidth={2.4} /></>
                  : <>Unlock my counter <ArrowRight size={17} strokeWidth={2.4} /></>}
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
          <div className="login-foot">shopdesk v3.0 · cloud edition — your counter, on every device</div>
        </div>
      </div>
    </div>
  );
}
