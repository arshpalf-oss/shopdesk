// shopdesk — billing counter (POS). F2 focus search · Ctrl+Enter complete sale
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import confetti from 'canvas-confetti';
import {
  Search, Zap, Trash2, Minus, Plus, ScanLine, ShoppingBag, Banknote, Smartphone, CreditCard,
  Landmark, BookOpen, User, ReceiptText, Printer, CheckCircle2, X, UserPlus, TriangleAlert, BadgePercent,
} from 'lucide-react';
import { api } from '../api.js';
import { useApp } from '../store.jsx';
import { useToast, Modal, EmptyState } from '../components/ui.jsx';
import { PAY_METHODS } from '../api.js';

const PAY_ICONS = { cash: Banknote, upi: Smartphone, card: CreditCard, bank: Landmark, credit: BookOpen };
const CART_KEY = 'shopdesk-cart-v1';
const round2 = (n) => Math.round(n * 100) / 100;

export default function Billing() {
  const { business, money } = useApp();
  const toast = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [customerList, setCustomerList] = useState([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [query, setQuery] = useState('');
  const [categoryId, setCategoryId] = useState('all');
  const [cart, setCart] = useState(() => {
    try { return JSON.parse(localStorage.getItem(CART_KEY)) || []; } catch { return []; }
  });
  const [customerId, setCustomerId] = useState('');
  const [billDiscount, setBillDiscount] = useState(0);
  const [isInterstate, setIsInterstate] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('upi');
  const [tendered, setTendered] = useState('');
  const [notes, setNotes] = useState('');
  const [completing, setCompleting] = useState(false);
  const [success, setSuccess] = useState(null);
  const [showAddCustomer, setShowAddCustomer] = useState(false);
  const [newCustomer, setNewCustomer] = useState({ name: '', phone: '', gstin: '' });
  const [savingCustomer, setSavingCustomer] = useState(false);

  const searchRef = useRef(null);
  const currency = business?.currency || 'INR';

  const loadProducts = useCallback(async () => {
    setLoadingProducts(true);
    try {
      const [prods, cats, custs] = await Promise.all([api('/products'), api('/categories'), api('/customers')]);
      setProducts(prods);
      setCategories(cats);
      setCustomerList(custs);
    } catch (err) {
      toast.error('Couldn’t load the catalogue', err.message);
    } finally {
      setLoadingProducts(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { loadProducts(); }, [loadProducts]);
  useEffect(() => { searchRef.current?.focus(); }, []);
  useEffect(() => {
    const cid = searchParams.get('customer');
    if (cid) setCustomerId(cid);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { localStorage.setItem(CART_KEY, JSON.stringify(cart)); }, [cart]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'F2') { e.preventDefault(); searchRef.current?.focus(); }
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); completeSale(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  });

  /* ---------- derived ---------- */
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products.filter((p) => {
      if (categoryId !== 'all' && p.category_id !== categoryId) return false;
      if (!q) return true;
      return p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q) || (p.barcode && p.barcode.includes(q));
    });
  }, [products, query, categoryId]);

  const totals = useMemo(() => {
    let gross = 0, taxable = 0, tax = 0;
    for (const line of cart) {
      const lineGross = line.qty * line.price;
      const lineTaxable = lineGross * (1 - (line.discount || 0) / 100);
      const lineTax = lineTaxable * (line.tax_rate || 0) / 100;
      gross += lineGross; taxable += lineTaxable; tax += lineTax;
    }
    taxable = round2(taxable); tax = round2(tax); gross = round2(gross);
    const cgst = isInterstate ? 0 : round2(tax / 2);
    const sgst = isInterstate ? 0 : round2(tax - cgst);
    const igst = isInterstate ? tax : 0;
    const grand = Math.max(0, round2(taxable + tax - (Number(billDiscount) || 0)));
    return { gross, taxable, tax, cgst, sgst, igst, grand, itemDiscount: round2(gross - taxable) };
  }, [cart, billDiscount, isInterstate]);

  const tenderedNum = Number(tendered) || 0;
  const change = paymentMethod === 'cash' ? Math.max(0, round2(tenderedNum - totals.grand)) : 0;
  const shortBy = paymentMethod === 'cash' && tendered !== '' ? Math.max(0, round2(totals.grand - tenderedNum)) : 0;

  /* ---------- cart ops ---------- */
  const addToCart = useCallback((product) => {
    if (product.stock <= 0) { toast.error('Out of stock', `“${product.name}” has zero stock. Record a purchase first.`); return; }
    setCart((prev) => {
      const existing = prev.find((l) => l.product_id === product.id);
      if (existing) {
        if (existing.qty + 1 > product.stock) { toast.error('Not enough stock', `Only ${product.stock} ${product.unit} available.`); return prev; }
        return prev.map((l) => l.product_id === product.id ? { ...l, qty: l.qty + 1 } : l);
      }
      return [...prev, { product_id: product.id, name: product.name, unit: product.unit, price: product.price, cost: product.cost, tax_rate: product.tax_rate, discount: 0, qty: 1, stock: product.stock }];
    });
  }, [toast]);

  const updateQty = (productId, delta) => {
    setCart((prev) => prev.map((l) => {
      if (l.product_id !== productId) return l;
      const qty = Math.max(0, l.qty + delta);
      return { ...l, qty: Math.min(qty, l.stock ?? 9999) };
    }).filter((l) => l.qty > 0));
  };
  const removeLine = (productId) => setCart((prev) => prev.filter((l) => l.product_id !== productId));
  const clearCart = () => { setCart([]); setBillDiscount(0); setTendered(''); setNotes(''); setCustomerId(''); };

  const onSearchKeyDown = (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    const exact = products.find((p) => p.barcode === q || p.sku.toLowerCase() === q.toLowerCase());
    if (exact) { addToCart(exact); setQuery(''); return; }
    if (filtered.length === 1) { addToCart(filtered[0]); setQuery(''); }
  };

  /* ---------- complete sale ---------- */
  const completeSale = async () => {
    if (completing || cart.length === 0) return;
    if (paymentMethod === 'cash' && tendered !== '' && shortBy > 0) { toast.error('Cash is short', `Tendered is ₹${shortBy.toFixed(2)} less than the bill.`); return; }
    setCompleting(true);
    try {
      const payload = {
        customer_id: customerId ? Number(customerId) : null,
        is_interstate: isInterstate,
        discount: Number(billDiscount) || 0,
        payment_method: paymentMethod,
        paid: paymentMethod === 'credit' ? 0 : undefined, // credit = full udhaar; others auto-paid
        notes,
        items: cart.map((l) => ({ product_id: l.product_id, name: l.name, qty: l.qty, price: l.price, discount: l.discount || 0, tax_rate: l.tax_rate || 0 })),
      };
      const invoice = await api('/invoices', { method: 'POST', body: payload });
      setSuccess(invoice);
      clearCart();
      loadProducts();
      fireConfetti();
    } catch (err) {
      toast.error('Bill not saved', err.message);
    } finally {
      setCompleting(false);
    }
  };

  const fireConfetti = () => {
    const colors = ['#b7f04f', '#2dd4a7', '#a78bfa', '#ffc24b', '#ffffff'];
    const opts = { colors, disableForReducedMotion: true, zIndex: 9999 };
    confetti({ ...opts, particleCount: 90, spread: 75, origin: { y: 0.7 }, scalar: 0.9 });
    setTimeout(() => confetti({ ...opts, particleCount: 60, spread: 100, origin: { x: 0.15, y: 0.8 }, angle: 60 }), 180);
    setTimeout(() => confetti({ ...opts, particleCount: 60, spread: 100, origin: { x: 0.85, y: 0.8 }, angle: 120 }), 320);
  };

  const addCustomer = async (e) => {
    e.preventDefault();
    setSavingCustomer(true);
    try {
      const created = await api('/customers', { method: 'POST', body: { name: newCustomer.name, phone: newCustomer.phone, gstin: newCustomer.gstin } });
      setCustomerList((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
      setCustomerId(String(created.id));
      setShowAddCustomer(false);
      setNewCustomer({ name: '', phone: '', gstin: '' });
      toast.success('Customer added', created.name);
    } catch (err) {
      toast.error('Couldn’t add customer', err.message);
    } finally {
      setSavingCustomer(false);
    }
  };

  const selectedCustomer = customerList.find((c) => String(c.id) === String(customerId));
  const fmt = (n, fd = 2) => money(n, fd);

  return (
    <div>
      <div className="page-head">
        <div>
          <h1 className="page-title">Billing <em>counter</em></h1>
          <div className="page-sub">Scan, tap, bill. Stock updates itself. <kbd className="kbd">F2</kbd> focus search · <kbd className="kbd">Ctrl ↵</kbd> complete sale</div>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <span className="pill upi" style={{ fontSize: 10 }}>FY 2026–27</span>
          {cart.length > 0 && <button className="btn btn-ghost btn-sm" onClick={clearCart}><Trash2 size={13} /> Clear cart ({cart.length})</button>}
        </div>
      </div>

      <div className="billing-grid">
        {/* ================= left: product picker ================= */}
        <div className="card card-pad">
          <div className="bill-search-row">
            <div className="bill-search">
              <Search size={20} color="var(--lime)" />
              <input ref={searchRef} value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={onSearchKeyDown}
                placeholder="Scan barcode or search product, SKU…" aria-label="Search products" autoComplete="off" />
              {query && <button className="icon-btn" onClick={() => setQuery('')} aria-label="Clear"><X size={16} /></button>}
              <span className="scan-badge"><ScanLine size={12} /> SCAN</span>
            </div>
          </div>

          <div className="chip-row" role="tablist" aria-label="Filter by category">
            <button className={`chip${categoryId === 'all' ? ' active' : ''}`} onClick={() => setCategoryId('all')}>All ({products.length})</button>
            {categories.map((c) => (
              <button key={c.id} className={`chip${categoryId === c.id ? ' active' : ''}`} onClick={() => setCategoryId(c.id)}>
                {c.name}
              </button>
            ))}
          </div>

          {loadingProducts ? (
            <div className="product-grid">{Array.from({ length: 12 }).map((_, i) => <div key={i} className="skeleton" style={{ height: 118 }} />)}</div>
          ) : filtered.length === 0 ? (
            <EmptyState icon={Search} title="Nothing matches" message={`No products for “${query}”. Try scanning the barcode or add this item to the catalogue.`} />
          ) : (
            <div className="product-grid">
              {filtered.map((p) => (
                <button key={p.id} className={`product-tile${p.stock <= 0 ? ' oos' : ''}`} onClick={() => addToCart(p)} aria-label={`Add ${p.name}`}>
                  <span className="pt-cat" style={{ color: p.category_color || 'var(--muted)' }}>{p.category_name || 'General'}</span>
                  <span className="pt-name">{p.name}</span>
                  <span className="pt-foot">
                    <span className="pt-price">{fmt(p.price, p.price % 1 ? 2 : 0)}</span>
                    <span className={`pt-stock${p.stock <= p.reorder_level ? ' low' : ''}`}>{p.stock <= 0 ? 'OUT' : `${p.stock} ${p.unit}`}</span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ================= right: cart / bill ================= */}
        <div className="card card-pad cart-panel">
          <div style={{ display: 'flex', gap: 8 }}>
            <div className="field" style={{ flex: 1 }}>
              <label htmlFor="customer">Customer</label>
              <div style={{ position: 'relative' }}>
                <User size={15} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)', pointerEvents: 'none' }} />
                <select id="customer" className="input" value={customerId} onChange={(e) => setCustomerId(e.target.value)} style={{ paddingLeft: 34 }}>
                  <option value="">Walk-in Customer</option>
                  {customerList.map((c) => <option key={c.id} value={c.id}>{c.name}{c.phone ? ` · ${c.phone}` : ''}</option>)}
                </select>
              </div>
            </div>
            <button className="icon-btn" style={{ alignSelf: 'end', height: 41, border: '1px dashed var(--line-strong)' }} onClick={() => setShowAddCustomer(true)} title="Quick add customer" aria-label="Quick add customer">
              <UserPlus size={17} />
            </button>
          </div>
          {selectedCustomer?.gstin && <div style={{ fontSize: 9.5, fontFamily: 'var(--font-mono)', color: 'var(--violet)', marginTop: 6, letterSpacing: '.06em' }}>GSTIN {selectedCustomer.gstin}</div>}

          {/* lines */}
          <div className="cart-lines scroll-thin">
            {cart.length === 0 ? (
              <div className="empty-state" style={{ padding: '34px 10px' }}>
                <div className="empty-orb" style={{ width: 64, height: 64 }}><ShoppingBag size={26} strokeWidth={1.6} /></div>
                <h3 style={{ fontSize: 14 }}>Cart is empty</h3>
                <p style={{ fontSize: 11 }}>Tap products on the left or scan a barcode. The bill writes itself.</p>
              </div>
            ) : (
              <AnimatePresence initial={false}>
                {cart.map((line) => {
                  const lineTotal = round2(line.qty * line.price * (1 - line.discount / 100) * (1 + line.tax_rate / 100));
                  return (
                    <motion.div key={line.product_id} className="cart-line" layout
                      initial={{ opacity: 0, x: 44, scale: 0.94 }} animate={{ opacity: 1, x: 0, scale: 1 }}
                      exit={{ opacity: 0, x: 60, scale: 0.9, transition: { duration: 0.16 } }}
                      transition={{ type: 'spring', stiffness: 480, damping: 36 }}>
                      <div style={{ minWidth: 0 }}>
                        <div className="cart-line-name">{line.name}</div>
                        <div className="cart-line-meta">
                          <span>{fmt(line.price)} × {line.qty} {line.unit}</span>
                          <span>· GST {line.tax_rate}%</span>
                          {line.discount > 0 && <span style={{ color: 'var(--teal)' }}>· −{line.discount}%</span>}
                        </div>
                        <div className="qty-ctrl" style={{ marginTop: 6 }}>
                          <button className="qty-btn" onClick={() => updateQty(line.product_id, -1)} aria-label="Decrease"><Minus size={13} /></button>
                          <span className="qty-num">{line.qty}</span>
                          <button className="qty-btn" onClick={() => updateQty(line.product_id, +1)} aria-label="Increase"><Plus size={13} /></button>
                        </div>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', justifyContent: 'space-between' }}>
                        <button className="cart-remove" onClick={() => removeLine(line.product_id)} aria-label="Remove item"><Trash2 size={15} /></button>
                        <div className="cart-line-total">{fmt(lineTotal)}</div>
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            )}
          </div>

          {/* totals */}
          <div className="totals-box">
            <div className="totals-row"><span>Subtotal</span><span>{fmt(totals.gross)}</span></div>
            {totals.itemDiscount > 0 && <div className="totals-row discount"><span>Item discounts</span><span>− {fmt(totals.itemDiscount)}</span></div>}
            <div className="totals-row"><span>Taxable value</span><span>{fmt(totals.taxable)}</span></div>
            {isInterstate ? (
              <div className="totals-row"><span>IGST</span><span>+ {fmt(totals.igst)}</span></div>
            ) : (
              <>
                <div className="totals-row"><span>CGST + SGST</span><span>+ {fmt(totals.cgst)} + {fmt(totals.sgst)}</span></div>
              </>
            )}
            <div className="totals-row" style={{ alignItems: 'center' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><BadgePercent size={12} /> Bill discount (₹)</span>
              <input type="number" min="0" className="input mono" value={billDiscount} onChange={(e) => setBillDiscount(Math.max(0, Number(e.target.value) || 0))} style={{ width: 84, padding: '5px 8px', fontSize: 12, textAlign: 'right' }} aria-label="Bill discount" />
            </div>
            <div className="totals-row grand"><span>Total</span><b>{fmt(totals.grand)}</b></div>
          </div>

          {/* interstate toggle */}
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: 'var(--muted)', margin: '8px 2px 0', cursor: 'pointer' }}>
            <input type="checkbox" checked={isInterstate} onChange={(e) => setIsInterstate(e.target.checked)} />
            Interstate supply — charge IGST instead of CGST/SGST
          </label>

          {/* payment methods */}
          <div className="pay-methods" role="radiogroup" aria-label="Payment method">
            {PAY_METHODS.map(({ id, label }) => {
              const Icon = PAY_ICONS[id];
              return (
                <button key={id} className={`pay-method${paymentMethod === id ? ' active' : ''}`} onClick={() => setPaymentMethod(id)} role="radio" aria-checked={paymentMethod === id}>
                  <Icon size={19} strokeWidth={1.9} />
                  {label}
                </button>
              );
            })}
          </div>

          {/* cash tender widget */}
          {paymentMethod === 'cash' && (
            <>
              <div className="cash-tender">
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', letterSpacing: '.1em' }}>TENDERED</span>
                <input type="number" min="0" className="input mono" placeholder="Amount received…" value={tendered} onChange={(e) => setTendered(e.target.value)} style={{ flex: 1, padding: '8px 10px' }} />
                {[totals.grand, 100, 200, 500, 2000].map((v, i) => (
                  <button key={i} className="tender-chip" onClick={() => setTendered(i === 0 ? totals.grand.toFixed(2) : String(v))}>
                    {i === 0 ? 'Exact' : `₹${v}`}
                  </button>
                ))}
              </div>
              {tendered !== '' && (
                shortBy > 0
                  ? <div className="change-back" style={{ background: 'rgba(251,111,146,.09)', borderColor: 'rgba(251,111,146,.3)', color: 'var(--rose)' }}><span>Short by</span><span>₹{shortBy.toFixed(2)}</span></div>
                  : <div className="change-back"><span>Change to return</span><span>₹{change.toFixed(2)}</span></div>
              )}
            </>
          )}
          {paymentMethod === 'credit' && (
            <div className="change-back" style={{ background: 'rgba(255,194,75,.07)', borderColor: 'rgba(255,194,75,.3)', color: 'var(--amber)' }}>
              <span>Billed to udhaar</span><span>due ₹{totals.grand.toFixed(2)}</span>
            </div>
          )}

          <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Note for this bill (optional)…" style={{ marginBottom: 10, fontSize: 12 }} />

          <button className="btn btn-primary btn-lg" disabled={cart.length === 0 || completing || (paymentMethod === 'cash' && tendered !== '' && shortBy > 0)}
            onClick={completeSale} style={{ width: '100%', justifyContent: 'center', fontSize: 15 }}>
            {completing ? <span className="spinner" /> : <><Zap size={18} strokeWidth={2.5} /> Complete Sale · {fmt(totals.grand)}</>}
          </button>
        </div>
      </div>

      {/* ================= success modal ================= */}
      <Modal open={!!success} onClose={() => setSuccess(null)} title="" wide={false}>
        {success && (
          <div style={{ textAlign: 'center', padding: '6px 6px 2px' }}>
            <motion.div initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 320, damping: 17 }}
              style={{ width: 74, height: 74, borderRadius: '50%', background: 'rgba(183,240,79,.14)', border: '1px solid rgba(183,240,79,.4)', display: 'grid', placeItems: 'center', margin: '0 auto 14px' }}>
              <CheckCircle2 size={38} color="var(--lime)" strokeWidth={1.8} />
            </motion.div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '.22em', color: 'var(--muted)' }}>BILL SAVED</div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 30, fontWeight: 700, margin: '4px 0 2px' }}>{success.invoice_no}</div>
            <div style={{ color: 'var(--muted)', fontSize: 12 }}>{success.customer_name} · {success.payment_method?.toUpperCase()}</div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 38, fontWeight: 700, color: 'var(--lime)', margin: '12px 0 4px', letterSpacing: '-0.02em' }}>{fmt(success.grand_total)}</div>
            <div style={{ fontSize: 10.5, color: 'var(--muted)', fontFamily: 'var(--font-mono)' }}>status: {success.status.toUpperCase()}{success.status !== 'paid' ? ` · balance ₹${(success.grand_total - success.paid).toFixed(2)}` : ''}</div>
            <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
              <button className="btn btn-ghost" style={{ flex: 1, justifyContent: 'center' }} onClick={() => navigate(`/invoice/${success.id}/print`)}>
                <Printer size={16} /> Print bill
              </button>
              <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }} onClick={() => { setSuccess(null); searchRef.current?.focus(); }}>
                <Zap size={16} /> New sale
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* ================= quick-add customer ================= */}
      <Modal open={showAddCustomer} onClose={() => setShowAddCustomer(false)} title="Quick add customer" sub="Saved to your khata instantly.">
        <form onSubmit={addCustomer} className="form-grid">
          <div className="field span-2"><label htmlFor="nc-name">Name *</label>
            <input id="nc-name" className="input" required autoFocus value={newCustomer.name} onChange={(e) => setNewCustomer({ ...newCustomer, name: e.target.value })} placeholder="Rohit Agarwal" /></div>
          <div className="field"><label htmlFor="nc-phone">Phone</label>
            <input id="nc-phone" className="input" value={newCustomer.phone} onChange={(e) => setNewCustomer({ ...newCustomer, phone: e.target.value })} placeholder="98XXXXXXXX" /></div>
          <div className="field"><label htmlFor="nc-gstin">GSTIN</label>
            <input id="nc-gstin" className="input" value={newCustomer.gstin} onChange={(e) => setNewCustomer({ ...newCustomer, gstin: e.target.value.toUpperCase() })} placeholder="09ABCDE1234F1Z5" /></div>
          <div className="span-2" style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
            <button type="button" className="btn btn-ghost" onClick={() => setShowAddCustomer(false)}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={savingCustomer}>{savingCustomer ? <span className="spinner" /> : 'Save customer'}</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
