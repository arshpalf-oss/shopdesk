// shopdesk — settings: business, billing, account, backup
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Store, ReceiptText, ShieldCheck, Save, Download, Upload, RotateCcw, Lock, KeyRound, UserRound, Building2, TriangleAlert,
} from 'lucide-react';
import { api } from '../api.js';
import { CURRENCIES } from '../api.js';
import { useApp } from '../store.jsx';
import { useToast, Modal } from '../components/ui.jsx';

export default function Settings() {
  const { user, business, refreshBusiness } = useApp();
  const toast = useToast();
  const isAdmin = user?.role === 'admin';

  const [form, setForm] = useState(null);
  const [savingBiz, setSavingBiz] = useState(false);
  const [dirty, setDirty] = useState(false);

  // account section
  const [displayName, setDisplayName] = useState(user?.name || '');
  const [savingName, setSavingName] = useState(false);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [changing, setChanging] = useState(false);

  // backup / reset
  const fileRef = useRef(null);
  const [restoreFile, setRestoreFile] = useState(null);
  const [restorePayload, setRestorePayload] = useState(null);
  const [restoring, setRestoring] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    if (business && !dirty) setForm({ ...business });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [business]);

  const set = (key, value) => { setForm((f) => ({ ...f, [key]: value })); setDirty(true); };

  const saveBusiness = async (e) => {
    e.preventDefault();
    setSavingBiz(true);
    try {
      await api('/settings', {
        method: 'PUT',
        body: {
          name: form.name, owner_name: form.owner_name, email: form.email, phone: form.phone,
          address: form.address, city: form.city, state: form.state, pincode: form.pincode, gstin: form.gstin,
          invoice_prefix: form.invoice_prefix, purchase_prefix: form.purchase_prefix, upi_id: form.upi_id,
          currency: form.currency, footer_note: form.footer_note, terms: form.terms,
        },
      });
      await refreshBusiness();
      setDirty(false);
      toast.success('Settings saved', 'Your invoice and business details are live.');
    } catch (err) {
      toast.error('Save failed', err.message);
    } finally {
      setSavingBiz(false);
    }
  };

  const saveName = async (e) => {
    e.preventDefault();
    setSavingName(true);
    try {
      await api('/auth/profile', { method: 'PUT', body: { name: displayName } });
      toast.success('Name updated', 'It will show on new bills you create.');
      window.location.reload();
    } catch (err) {
      toast.error('Couldn’t update name', err.message);
      setSavingName(false);
    }
  };

  const changePassword = async (e) => {
    e.preventDefault();
    setChanging(true);
    try {
      await api('/auth/change-password', { method: 'POST', body: { current, next } });
      setCurrent(''); setNext('');
      toast.success('Password changed', 'Use the new password next sign-in.');
    } catch (err) {
      toast.error('Password not changed', err.message);
    } finally {
      setChanging(false);
    }
  };

  const pickRestoreFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const payload = JSON.parse(await file.text());
      if (!payload?.tables) throw new Error('missing tables');
      setRestorePayload(payload);
      setRestoreFile({ name: file.name, size: (file.size / 1024).toFixed(0) });
    } catch {
      toast.error('Not a shopdesk backup', 'Choose a .json file exported from the Backup button.');
    }
  };

  const doRestore = async () => {
    setRestoring(true);
    try {
      await api('/restore', { method: 'POST', body: restorePayload });
      toast.success('Backup restored', 'Everything is back. Reloading…');
      setTimeout(() => window.location.reload(), 700);
    } catch (err) {
      toast.error('Restore failed', err.message);
      setRestoring(false);
    }
  };

  const doReset = async () => {
    setResetting(true);
    try {
      await api('/reset-demo', { method: 'POST' });
      toast.success('Demo data restored', 'Shivam General Store is fresh again.');
      setTimeout(() => window.location.reload(), 700);
    } catch (err) {
      toast.error('Reset failed', err.message);
      setResetting(false);
    }
  };

  const adminLock = !isAdmin && (
    <div className="error-banner" style={{ borderColor: 'rgba(255,194,75,.35)', background: 'rgba(255,194,75,.07)', color: '#ffd97a', marginBottom: 12 }}>
      <Lock size={16} style={{ flex: 'none' }} />
      <span>You’re signed in as staff. Only the owner (admin) can change business and billing settings.</span>
    </div>
  );

  if (!form) return <div className="skeleton" style={{ height: 400 }} />;

  return (
    <div>
      <div className="page-head">
        <div>
          <h1 className="page-title">Settings &amp; <em>backup</em></h1>
          <div className="page-sub">The control room. Changes apply to every new bill instantly.</div>
        </div>
        {isAdmin && (
          <button className="btn btn-primary" form="business-form" type="submit" disabled={savingBiz || !dirty}>
            {savingBiz ? <span className="spinner" /> : <><Save size={16} /> Save changes{dirty ? ' •' : ''}</>}
          </button>
        )}
      </div>

      {adminLock}

      {/* ============ business profile ============ */}
      <form id="business-form" onSubmit={saveBusiness} className="card card-pad section-gap" style={{ marginTop: 0 }}>
        <div className="card-title"><span style={{ display: 'flex', alignItems: 'center', gap: 10 }}><Building2 size={17} color="var(--lime)" /> Business profile</span><small>prints on every bill</small></div>
        <div className="form-grid">
          <div className="field span-2"><label htmlFor="b-name">Business name</label>
            <input id="b-name" className="input" disabled={!isAdmin} value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Shivam General Store" /></div>
          <div className="field"><label htmlFor="b-owner">Owner / proprietor</label>
            <input id="b-owner" className="input" disabled={!isAdmin} value={form.owner_name} onChange={(e) => set('owner_name', e.target.value)} /></div>
          <div className="field"><label htmlFor="b-phone">Phone</label>
            <input id="b-phone" className="input" disabled={!isAdmin} value={form.phone} onChange={(e) => set('phone', e.target.value)} /></div>
          <div className="field"><label htmlFor="b-email">Email</label>
            <input id="b-email" type="email" className="input" disabled={!isAdmin} value={form.email} onChange={(e) => set('email', e.target.value)} /></div>
          <div className="field"><label htmlFor="b-gstin">GSTIN</label>
            <input id="b-gstin" className="input mono" disabled={!isAdmin} value={form.gstin} onChange={(e) => set('gstin', e.target.value.toUpperCase())} placeholder="09ABCDE1234F1Z5" /></div>
          <div className="field span-2"><label htmlFor="b-addr">Address</label>
            <input id="b-addr" className="input" disabled={!isAdmin} value={form.address} onChange={(e) => set('address', e.target.value)} /></div>
          <div className="field"><label htmlFor="b-city">City</label>
            <input id="b-city" className="input" disabled={!isAdmin} value={form.city} onChange={(e) => set('city', e.target.value)} /></div>
          <div className="field" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div><label htmlFor="b-state">State</label>
              <input id="b-state" className="input" disabled={!isAdmin} value={form.state} onChange={(e) => set('state', e.target.value)} /></div>
            <div><label htmlFor="b-pin">Pincode</label>
              <input id="b-pin" className="input mono" disabled={!isAdmin} value={form.pincode} onChange={(e) => set('pincode', e.target.value)} /></div>
          </div>
        </div>
      </form>

      {/* ============ billing & GST ============ */}
      <div className="card card-pad section-gap">
        <div className="card-title"><span style={{ display: 'flex', alignItems: 'center', gap: 10 }}><ReceiptText size={17} color="var(--teal)" /> Billing &amp; documents</span><small>numbering &amp; printouts</small></div>
        <div className="form-grid">
          <div className="field"><label htmlFor="s-invprefix">Invoice prefix</label>
            <input id="s-invprefix" className="input mono" disabled={!isAdmin} maxLength={8} value={form.invoice_prefix} onChange={(e) => set('invoice_prefix', e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} /></div>
          <div className="field"><label htmlFor="s-purprefix">Purchase prefix</label>
            <input id="s-purprefix" className="input mono" disabled={!isAdmin} maxLength={8} value={form.purchase_prefix} onChange={(e) => set('purchase_prefix', e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} /></div>
          <div className="field"><label htmlFor="s-upi">UPI ID (QR on bills)</label>
            <input id="s-upi" className="input mono" disabled={!isAdmin} value={form.upi_id} onChange={(e) => set('upi_id', e.target.value)} placeholder="yourshop@ybl" /></div>
          <div className="field"><label htmlFor="s-currency">Currency</label>
            <select id="s-currency" className="input" disabled={!isAdmin} value={form.currency} onChange={(e) => set('currency', e.target.value)}>
              {Object.entries(CURRENCIES).map(([code, c]) => <option key={code} value={code}>{c.label}</option>)}
            </select></div>
          <div className="field span-2"><label htmlFor="s-footer">Bill footer note</label>
            <input id="s-footer" className="input" disabled={!isAdmin} value={form.footer_note} onChange={(e) => set('footer_note', e.target.value)} placeholder="Thank you for shopping with us!" /></div>
          <div className="field span-2"><label htmlFor="s-terms">Terms &amp; conditions (prints small)</label>
            <textarea id="s-terms" className="input" rows={2} disabled={!isAdmin} value={form.terms} onChange={(e) => set('terms', e.target.value)} /></div>
        </div>
      </div>

      <div className="grid-dashboard-2">
        {/* ============ account ============ */}
        <div className="card card-pad" style={{ alignSelf: 'start' }}>
          <div className="card-title"><span style={{ display: 'flex', alignItems: 'center', gap: 10 }}><ShieldCheck size={17} color="var(--violet)" /> Your account</span><small>{user?.email}</small></div>
          <form onSubmit={saveName} style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <div className="field" style={{ flex: 1 }}><label htmlFor="a-name">Display name</label>
              <input id="a-name" className="input" value={displayName} onChange={(e) => setDisplayName(e.target.value)} /></div>
            <button type="submit" className="btn btn-ghost" style={{ alignSelf: 'flex-end' }} disabled={savingName || displayName.trim().length < 2}>{savingName ? <span className="spinner light" /> : <UserRound size={15} />}</button>
          </form>
          <form onSubmit={changePassword} style={{ borderTop: '1px solid var(--line)', paddingTop: 14 }}>
            <div className="card-title" style={{ fontSize: 12, marginBottom: 10 }}><span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><KeyRound size={14} /> Change password</span></div>
            <div className="field" style={{ marginBottom: 10 }}><label htmlFor="a-cur">Current password</label>
              <input id="a-cur" type="password" className="input" required value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" /></div>
            <div className="field" style={{ marginBottom: 12 }}><label htmlFor="a-next">New password (min 8)</label>
              <input id="a-next" type="password" className="input" required minLength={8} value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" /></div>
            <button type="submit" className="btn btn-ghost" disabled={changing}>{changing ? <span className="spinner light" /> : 'Update password'}</button>
          </form>
        </div>

        {/* ============ backup / danger ============ */}
        <div className="card card-pad" style={{ alignSelf: 'start', borderColor: 'rgba(251,111,146,.22)' }}>
          <div className="card-title"><span style={{ display: 'flex', alignItems: 'center', gap: 10 }}><Store size={17} color="var(--amber)" /> Backup &amp; restore</span><small>owner only</small></div>
          <p style={{ color: 'var(--muted)', fontSize: 12, lineHeight: 1.6, marginTop: 0 }}>
            One click exports <b>everything</b> — products, bills, customers, stock movements — as a single JSON file. Keep it in Drive or a pen-drive; restore it on any machine.
          </p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
            <button className="btn btn-primary" disabled={!isAdmin} onClick={() => { window.location.href = '/api/backup'; }}><Download size={15} /> Download backup</button>
            <button className="btn btn-ghost" disabled={!isAdmin} onClick={() => fileRef.current?.click()}><Upload size={15} /> Restore from file</button>
            <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={pickRestoreFile} />
          </div>
          <div className="divider" />
          <div className="card-title" style={{ fontSize: 12, marginTop: 4 }}><span style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--rose)' }}><TriangleAlert size={14} /> Danger zone</span></div>
          <p style={{ color: 'var(--muted)', fontSize: 11.5, marginTop: 0 }}>Wipes the database and reloads the demo business (Shivam General Store, 924 bills of sample history).</p>
          <button className="btn btn-danger btn-sm" disabled={!isAdmin} onClick={() => setConfirmReset(true)}><RotateCcw size={13} /> Reset demo data</button>
        </div>
      </div>

      {/* ============ restore confirm ============ */}
      <Modal open={!!restoreFile} onClose={() => setRestoreFile(null)} title="Restore this backup?"
        sub={restoreFile && `${restoreFile.name} · ${restoreFile.size} KB`}
        footer={<>
          <button className="btn btn-ghost" onClick={() => setRestoreFile(null)}>Cancel</button>
          <button className="btn btn-primary" onClick={doRestore} disabled={restoring}>{restoring ? <span className="spinner" /> : 'Overwrite & restore'}</button>
        </>}>
        <p style={{ color: 'var(--muted)', fontSize: 12.5 }}><b style={{ color: 'var(--rose)' }}>Everything current will be replaced</b> — bills, products, customers. Your sign-in sessions are cleared too. This cannot be undone.</p>
      </Modal>

      {/* ============ reset confirm ============ */}
      <Modal open={confirmReset} onClose={() => setConfirmReset(false)} title="Reset demo data?"
        footer={<>
          <button className="btn btn-ghost" onClick={() => setConfirmReset(false)}>Keep my data</button>
          <button className="btn btn-danger" onClick={doReset} disabled={resetting}>{resetting ? <span className="spinner light" /> : <><RotateCcw size={14} /> Wipe & reseed</>}</button>
        </>}>
        <p style={{ color: 'var(--muted)', fontSize: 12.5 }}>All bills, products, customers and expenses will be deleted and replaced with the fresh demo dataset.</p>
      </Modal>
    </div>
  );
}
