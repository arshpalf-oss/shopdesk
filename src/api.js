// shopdesk — typed API client + shared helpers
export async function api(path, { method = 'GET', body, headers } = {}) {
  const res = await fetch(`/api${path}`, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json', ...headers } : headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    credentials: 'same-origin',
  });
  if (res.status === 204) return null;
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = null; }
  if (!res.ok) {
    const err = new Error(data?.error || `Request failed (${res.status})`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

export const CURRENCIES = {
  INR: { symbol: '₹', locale: 'en-IN', label: 'Indian Rupee (₹)' },
  USD: { symbol: '$', locale: 'en-US', label: 'US Dollar ($)' },
  EUR: { symbol: '€', locale: 'de-DE', label: 'Euro (€)' },
  GBP: { symbol: '£', locale: 'en-GB', label: 'British Pound (£)' },
  AED: { symbol: 'AED', locale: 'en-AE', label: 'UAE Dirham (AED)' },
  SGD: { symbol: 'S$', locale: 'en-SG', label: 'Singapore Dollar (S$)' },
};

export function formatMoney(n, currency = 'INR', fractionDigits = 2) {
  const cfg = CURRENCIES[currency] || CURRENCIES.INR;
  const value = Number(n) || 0;
  try {
    return new Intl.NumberFormat(cfg.locale, { style: 'currency', currency, maximumFractionDigits: fractionDigits, minimumFractionDigits: fractionDigits }).format(value);
  } catch {
    return `${cfg.symbol}${value.toFixed(fractionDigits)}`;
  }
}

export function compactMoney(n, currency = 'INR') {
  const cfg = CURRENCIES[currency] || CURRENCIES.INR;
  const value = Number(n) || 0;
  const abs = Math.abs(value);
  const fmt = (v, suffix) => `${value < 0 ? '-' : ''}${cfg.symbol}${v >= 100 ? Math.round(v) : v.toFixed(1)}${suffix}`;
  if (abs >= 1e7) return fmt(abs / 1e7, ' Cr');
  if (abs >= 1e5) return fmt(abs / 1e5, ' L');
  if (abs >= 1e3) return fmt(abs / 1e3, 'k');
  return `${value < 0 ? '-' : ''}${cfg.symbol}${abs.toFixed(0)}`;
}

export function timeAgo(dateStr) {
  if (!dateStr) return '';
  const then = new Date(dateStr.replace(' ', 'T'));
  const diff = Date.now() - then.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return then.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function formatDate(dateStr, opts = {}) {
  if (!dateStr) return '—';
  const d = new Date(dateStr.replace(' ', 'T'));
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: opts.year ?? 'numeric', hour: opts.time ? '2-digit' : undefined, minute: opts.time ? '2-digit' : undefined });
}

/** Indian-system number-to-words for invoice amounts */
export function numberToWordsIndian(num) {
  num = Math.floor(Math.abs(Number(num) || 0));
  if (num === 0) return 'Zero';
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  const twoDigits = (n) => (n < 20 ? ones[n] : `${tens[Math.floor(n / 10)]}${n % 10 ? ' ' + ones[n % 10] : ''}`.trim());
  const threeDigits = (n) => {
    const h = Math.floor(n / 100), rest = n % 100;
    return `${h ? ones[h] + ' Hundred' : ''}${h && rest ? ' ' : ''}${rest ? twoDigits(rest) : ''}`.trim();
  };
  const crore = Math.floor(num / 1e7), lakh = Math.floor((num % 1e7) / 1e5), thousand = Math.floor((num % 1e5) / 1e3), rest = num % 1000;
  const parts = [];
  if (crore) parts.push(`${numberToWordsIndian(crore)} Crore`);
  if (lakh) parts.push(`${twoDigits(lakh)} Lakh`);
  if (thousand) parts.push(`${twoDigits(thousand)} Thousand`);
  if (rest) parts.push(threeDigits(rest));
  return parts.join(' ');
}

export function amountInWords(n, currency = 'INR') {
  const value = Number(n) || 0;
  const rupees = Math.floor(value);
  const paise = Math.round((value - rupees) * 100);
  const unit = currency === 'INR' ? ['Rupees', 'Paise', 'Only'] : ['Dollars', 'Cents', 'Only'];
  let words = `${unit[0]} ${numberToWordsIndian(rupees)}`;
  if (paise > 0) words += ` and ${numberToWordsIndian(paise)} ${unit[1]}`;
  return `${words} ${unit[2]}`;
}

export const PAY_METHODS = [
  { id: 'cash', label: 'Cash' },
  { id: 'upi', label: 'UPI' },
  { id: 'card', label: 'Card' },
  { id: 'bank', label: 'Bank' },
  { id: 'credit', label: 'Credit' },
];

export const PAY_METHOD_LABEL = { cash: 'Cash', upi: 'UPI', card: 'Card', bank: 'Bank Transfer', credit: 'Credit (Udhaar)' };
export const UNIT_OPTIONS = ['pcs', 'kg', 'g', 'ltr', 'ml', 'pkt', 'box', 'bottle', 'bar', 'tube', 'jar', 'pouch', 'loaf', 'block', 'can', 'tin', 'spray', 'bag', 'pack', 'cup'];
