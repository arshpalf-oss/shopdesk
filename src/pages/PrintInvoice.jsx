// shopdesk — printable GST tax invoice (/invoice/:id/print)
import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Printer, ArrowLeft, ShieldCheck } from 'lucide-react';
import { api, amountInWords, PAY_METHOD_LABEL } from '../api.js';
import { useApp } from '../store.jsx';

export default function PrintInvoice() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { money, currency } = useApp();
  const [invoice, setInvoice] = useState(null);
  const [error, setError] = useState('');
  const [qr, setQr] = useState(null);

  useEffect(() => {
    api(`/invoices/${id}`).then(setInvoice).catch((e) => setError(e.message));
  }, [id]);

  useEffect(() => {
    if (!invoice) return;
    api(`/pay-qr?amount=${invoice.grand_total.toFixed(2)}&note=${encodeURIComponent(invoice.invoice_no)}`)
      .then((d) => setQr(d.qr))
      .catch(() => setQr(null));
  }, [invoice]);

  if (error) {
    return (
      <div className="print-shell">
        <div className="print-actions"><button className="btn btn-ghost" onClick={() => navigate('/invoices')}><ArrowLeft size={16} /> Back to bills</button></div>
        <div className="invoice-sheet"><p style={{ padding: 30, textAlign: 'center' }}>{error}</p></div>
      </div>
    );
  }
  if (!invoice) {
    return <div className="print-shell"><div className="invoice-sheet"><div className="skeleton" style={{ height: 500 }} /></div></div>;
  }

  const b = invoice.business || {};
  const interstate = !!invoice.is_interstate;
  const date = new Date(String(invoice.date).replace(' ', 'T'));
  const fmt = (n, fd = 2) => money(n, fd);

  return (
    <div className="print-shell">
      <div className="print-actions">
        <button className="btn btn-ghost" style={{ background: '#fff', color: '#111', border: '1px solid #ccc' }} onClick={() => navigate('/invoices')}>
          <ArrowLeft size={16} /> Back to bills
        </button>
        <button className="btn btn-primary" onClick={() => window.print()}>
          <Printer size={16} /> Print / Save PDF
        </button>
      </div>

      <div className="invoice-sheet">
        {/* ============ header ============ */}
        <div className="inv-head">
          <div>
            <div className="inv-biz-name">{b.name || 'Your Business'}</div>
            <div className="inv-tag">Tax Invoice</div>
            <div style={{ marginTop: 8, fontSize: 11, lineHeight: 1.65, color: '#333' }}>
              {b.address && <div>{b.address}</div>}
              <div>{[b.city, b.state, b.pincode].filter(Boolean).join(', ')}</div>
              <div>{b.phone && <span>Ph: {b.phone}</span>}{b.phone && b.email && ' · '}{b.email}</div>
              {b.gstin && <div style={{ fontWeight: 700, marginTop: 2 }}>GSTIN: {b.gstin}</div>}
            </div>
          </div>
          <div className="inv-meta">
            <div style={{ fontFamily: 'JetBrains Mono', fontSize: 8, letterSpacing: '.22em', color: '#666' }}>INVOICE NO</div>
            <b>{invoice.invoice_no}</b>
            <div style={{ marginTop: 8 }}>
              <div style={{ fontFamily: 'JetBrains Mono', fontSize: 8, letterSpacing: '.22em', color: '#666' }}>DATE</div>
              <div>{date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })} · {date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</div>
            </div>
            <div style={{ marginTop: 8 }}>
              <div style={{ fontFamily: 'JetBrains Mono', fontSize: 8, letterSpacing: '.22em', color: '#666' }}>PAYMENT</div>
              <div>{PAY_METHOD_LABEL[invoice.payment_method] || invoice.payment_method}</div>
            </div>
          </div>
        </div>

        {/* ============ bill to ============ */}
        <div className="inv-bill-row">
          <div>
            <b>Bill to</b>
            <div style={{ fontSize: 13, fontWeight: 700 }}>{invoice.customer_name}</div>
            {invoice.customer_phone && <div>{invoice.customer_phone}</div>}
            {invoice.customer_address && <div>{[invoice.customer_address, invoice.customer_city].filter(Boolean).join(', ')}</div>}
            {invoice.customer_gstin && <div style={{ fontWeight: 700 }}>GSTIN: {invoice.customer_gstin}</div>}
          </div>
          <div style={{ textAlign: 'right' }}>
            <b>Status</b>
            <div style={{ fontWeight: 700, textTransform: 'uppercase', color: invoice.status === 'paid' ? '#0a7a3d' : invoice.status === 'partial' ? '#a3620a' : '#b0244a' }}>{invoice.status}</div>
            <div style={{ marginTop: 6 }}>Balance: <b>{fmt(Math.max(0, invoice.grand_total - invoice.paid))}</b></div>
          </div>
        </div>

        {/* ============ items ============ */}
        <table className="inv-table">
          <thead>
            <tr><th>#</th><th>Item</th><th className="num">Qty</th><th className="num">Rate</th><th className="num">Disc</th><th className="num">GST</th><th className="num">Amount</th></tr>
          </thead>
          <tbody>
            {invoice.items.map((it, i) => (
              <tr key={it.id}>
                <td>{i + 1}</td>
                <td>{it.name}</td>
                <td className="num">{it.qty}</td>
                <td className="num">{fmt(it.price)}</td>
                <td className="num">{it.discount > 0 ? `${it.discount}%` : '—'}</td>
                <td className="num">{it.tax_rate}%</td>
                <td className="num">{fmt(it.line_total)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* ============ totals ============ */}
        <div className="inv-totals">
          <table>
            <tbody>
              <tr><td style={{ color: '#555' }}>Subtotal</td><td className="num">{fmt(invoice.subtotal)}</td></tr>
              {invoice.discount > 0 && <tr><td style={{ color: '#555' }}>Bill discount</td><td className="num">− {fmt(invoice.discount)}</td></tr>}
              <tr><td style={{ color: '#555' }}>Taxable value</td><td className="num">{fmt(invoice.taxable)}</td></tr>
              {interstate ? (
                <tr><td style={{ color: '#555' }}>IGST</td><td className="num">{fmt(invoice.igst)}</td></tr>
              ) : (
                <>
                  <tr><td style={{ color: '#555' }}>CGST</td><td className="num">{fmt(invoice.cgst)}</td></tr>
                  <tr><td style={{ color: '#555' }}>SGST</td><td className="num">{fmt(invoice.sgst)}</td></tr>
                </>
              )}
              <tr><td style={{ color: '#555' }}>Total tax</td><td className="num">{fmt(invoice.tax_total)}</td></tr>
              <tr className="grand"><td>Grand Total</td><td className="num">{fmt(invoice.grand_total)}</td></tr>
              {invoice.paid > 0 && <tr><td style={{ color: '#555' }}>Paid</td><td className="num">{fmt(invoice.paid)}</td></tr>}
              {invoice.grand_total - invoice.paid > 0.5 && <tr><td style={{ color: '#555' }}>Balance due</td><td className="num">{fmt(invoice.grand_total - invoice.paid)}</td></tr>}
            </tbody>
          </table>
        </div>

        {/* ============ words + QR + sign ============ */}
        <div className="inv-foot">
          <div style={{ flex: 1 }}>
            <div className="inv-words">
              <b>Amount in words</b>
              {amountInWords(invoice.grand_total, currency)}
            </div>
            {b.footer_note && <p className="inv-foot-note" style={{ marginTop: 12 }}>{b.footer_note}</p>}
            {b.terms && <p style={{ fontSize: 8.5, color: '#777', marginTop: 6, maxWidth: '46ch' }}>{b.terms}</p>}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 12, fontSize: 9, color: '#555', fontFamily: 'JetBrains Mono', letterSpacing: '.08em' }}>
              <ShieldCheck size={12} /> COMPUTER GENERATED INVOICE · shopdesk
            </div>
          </div>
          <div style={{ textAlign: 'center' }}>
            {qr && (
              <>
                <img src={qr} alt="UPI payment QR" width={108} height={108} style={{ border: '1px solid #ddd', padding: 4, borderRadius: 6 }} />
                <div style={{ fontSize: 8, color: '#555', marginTop: 4, fontFamily: 'JetBrains Mono', letterSpacing: '.1em' }}>SCAN TO PAY · UPI</div>
              </>
            )}
            <div className="inv-sign">
              <div className="line" />
              <div style={{ fontWeight: 700 }}>For {b.name || 'Your Business'}</div>
              <div style={{ color: '#666' }}>Authorised signatory</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
