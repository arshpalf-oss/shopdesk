import { money, stateName, amountWords } from "./shared.js";

// Layout preferences are separate from the immutable details on issued invoices.
export const PRINT_DEFAULTS = {
  invoice_template: "corporate",
  default_print_format: "a4",
  thermal_width: "80",
  receipt_footer: "",
  receipt_show_terms: false,
  print_show_qr: true,
};
export const INVOICE_TEMPLATES = [
  {
    id: "corporate",
    name: "Corporate",
    description:
      "Professional black-and-white invoice. Clear hierarchy and ruled item rows.",
  },
  {
    id: "compact",
    name: "Compact",
    description:
      "The same information with tighter spacing for longer item lists.",
  },
  {
    id: "classic",
    name: "Classic",
    description: "A traditional centred heading and fully bordered item table.",
  },
];
export function printPreferences(settings = {}) {
  const p = { ...PRINT_DEFAULTS, ...settings };
  return {
    ...p,
    invoice_template: INVOICE_TEMPLATES.some((t) => t.id === p.invoice_template)
      ? p.invoice_template
      : "corporate",
    default_print_format:
      p.default_print_format === "thermal" ? "thermal" : "a4",
    thermal_width: p.thermal_width === "58" ? "58" : "80",
  };
}
export const printDate = (value) =>
  value
    ? new Date(value + "T12:00:00Z").toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        timeZone: "Asia/Kolkata",
      })
    : "—";
export const escapeHTML = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
export const taxLabel = (line) =>
  line.tax_treatment === "taxable" || line.treatment === "taxable"
    ? `${line.gst_rate ?? line.rate}% GST`
    : { exempt: "Exempt", nil: "Nil-rated", non_gst: "Non-GST" }[
        line.tax_treatment || line.treatment
      ] || "No GST";
export function taxSummary(inv) {
  const groups = new Map();
  for (const line of inv.lines) {
    const key = `${line.hsn}|${line.gst_rate}|${line.tax_treatment}`;
    if (!groups.has(key))
      groups.set(key, {
        hsn: line.hsn,
        gst_rate: line.gst_rate,
        tax_treatment: line.tax_treatment,
        taxable: 0,
        cgst: 0,
        sgst: 0,
        igst: 0,
      });
    const group = groups.get(key);
    for (const field of ["taxable", "cgst", "sgst", "igst"])
      group[field] += line[field] || 0;
  }
  return [...groups.values()];
}
export function documentIdentity(inv, credit = null) {
  return {
    title: credit
      ? "CREDIT NOTE"
      : inv.status === "draft"
        ? "DRAFT — NOT A TAX DOCUMENT"
        : inv.document_type.toUpperCase(),
    number: credit?.number || inv.number || "Not yet issued",
    date: credit?.date || inv.date,
  };
}
export function paymentURI(inv, options = {}) {
  const p = printPreferences(options.settings || inv.clinic);
  if (
    !p.print_show_qr ||
    options.credit ||
    !inv.clinic.upi_id ||
    inv.status !== "issued" ||
    !(inv.balance > 0)
  )
    return "";
  return `upi://pay?pa=${encodeURIComponent(inv.clinic.upi_id)}&pn=${encodeURIComponent(inv.clinic.name)}&am=${(inv.balance / 100).toFixed(2)}&cu=INR&tn=${encodeURIComponent(inv.number)}`;
}
export function batchDetails(line) {
  return (line.batches || [])
    .filter((b) => b.batch_no || b.expiry)
    .map(
      (b) =>
        `Batch ${b.batch_no || "—"}${b.expiry ? " · Exp " + printDate(b.expiry) : ""} · ${b.qty} ${line.unit}`,
    );
}
export function totalRows(inv, credit = null) {
  const rows = [["Supply value", inv.taxable]];
  if (inv.discount) rows.push(["Discount (included)", -inv.discount]);
  if (inv.cgst || inv.sgst)
    rows.push(["CGST", inv.cgst], ["SGST / UTGST", inv.sgst]);
  if (inv.igst) rows.push(["IGST", inv.igst]);
  if (inv.rounding) rows.push(["Round off", inv.rounding]);
  rows.push([credit ? "Credit total" : "Grand total", inv.total, "total"]);
  if (!credit && inv.status !== "draft") {
    rows.push(["Net payment received", inv.paid || 0]);
    rows.push([
      inv.status === "credited" ? "Refund due" : "Balance due",
      inv.status === "credited" ? inv.refund_due || 0 : inv.balance || 0,
      "balance",
    ]);
  }
  return rows;
}
export function bankDetails(inv) {
  const c = inv.clinic;
  return [
    c.bank_name,
    c.account_name,
    c.account_number ? `A/c: ${c.account_number}` : "",
    c.ifsc ? `IFSC: ${c.ifsc}` : "",
    c.upi_id ? `UPI: ${c.upi_id}` : "",
  ].filter(Boolean);
}

// The HTML and PDF thermal renderers consume exactly the same bill content.
export function receiptBlocks(inv, options = {}) {
  const p = printPreferences(options.settings || inv.clinic);
  const credit = options.credit || null;
  const d = documentIdentity(inv, credit);
  const blocks = [];
  const text = (value, extra = {}) => {
    if (value) blocks.push({ kind: "text", text: String(value), ...extra });
  };
  const pair = (label, value, extra = {}) =>
    blocks.push({
      kind: "pair",
      label: String(label),
      value: String(value),
      ...extra,
    });
  const rule = () => blocks.push({ kind: "rule" });
  text(inv.clinic.name, { bold: true, center: true, heading: true });
  text(
    [inv.clinic.address, `${inv.clinic.city}, ${stateName(inv.clinic.state)}`]
      .filter(Boolean)
      .join("\n"),
    { center: true },
  );
  text([inv.clinic.phone, inv.clinic.email].filter(Boolean).join(" · "), {
    center: true,
  });
  if (inv.clinic.gst_registered)
    text(`GSTIN: ${inv.clinic.gstin}`, { bold: true, center: true });
  if (inv.clinic.registration_no)
    text(`Vet registration: ${inv.clinic.registration_no}`, { small: true });
  if (inv.clinic.drug_license)
    text(`Drug licence: ${inv.clinic.drug_license}`, { small: true });
  rule();
  text(d.title, { bold: true, center: true });
  pair(credit ? "Credit no." : "Bill no.", d.number, { bold: true });
  pair("Date", printDate(d.date));
  if (credit) pair("Original bill", inv.number);
  else if (inv.status === "issued" && inv.balance > 0)
    pair("Due date", printDate(inv.due_date));
  if (!credit && inv.status === "credited")
    text(`CREDITED IN FULL · ${inv.credit?.number || ""}`, { bold: true });
  rule();
  text(`Bill to: ${inv.customer.name || "Walk-in client"}`, { bold: true });
  text(
    [
      inv.customer.address,
      inv.customer.state ? stateName(inv.customer.state) : "",
      inv.customer.phone,
    ]
      .filter(Boolean)
      .join("\n"),
  );
  if (inv.customer.gstin)
    text(`Customer GSTIN: ${inv.customer.gstin}`, { bold: true });
  if (inv.pet.name) text(`Patient: ${inv.pet.name} · ${inv.pet.species}`);
  text(
    `Place of supply: ${inv.place_of_supply} · ${stateName(inv.place_of_supply)}`,
    { small: true },
  );
  text(
    `Prices: GST ${inv.inclusive ? "inclusive" : "exclusive"}${inv.clinic.gst_registered ? " · Reverse charge: No" : " · GST not charged"}`,
    { small: true },
  );
  rule();
  inv.lines.forEach((line, index) => {
    text(`${index + 1}. ${line.name}`, { bold: true });
    text(
      `HSN/SAC ${line.hsn} · ${line.unit} · ${taxLabel(line)}${Number(line.discount) ? ` · Discount ${line.discount}%` : ""}`,
      { small: true },
    );
    pair(`${line.qty} × ${money(line.rate)}`, money(line.total), {
      bold: true,
    });
    for (const batch of batchDetails(line)) text(batch, { small: true });
    if (index < inv.lines.length - 1) blocks.push({ kind: "space" });
  });
  rule();
  for (const [label, value, style] of totalRows(inv, credit))
    pair(label, money(value), { bold: !!style, total: style === "total" });
  text(amountWords(inv.total), { small: true });
  if (inv.clinic.gst_registered) {
    rule();
    text("HSN / SAC TAX SUMMARY", { bold: true, small: true });
    for (const group of taxSummary(inv)) {
      text(
        `${group.hsn} · ${taxLabel(group)} · Value ${money(group.taxable)}`,
        { small: true },
      );
      if (group.cgst || group.sgst)
        text(`CGST ${money(group.cgst)} · SGST / UTGST ${money(group.sgst)}`, {
          small: true,
        });
      if (group.igst) text(`IGST ${money(group.igst)}`, { small: true });
    }
  }
  const payments = (options.payments || []).filter(
    (payment) => payment.invoice_id === inv.id,
  );
  if (payments.length && !credit) {
    rule();
    text("PAYMENTS RECORDED", { bold: true, small: true });
    for (const payment of payments) {
      pair(
        `${payment.direction === "refund" ? "Refund · " : ""}${payment.method} · ${printDate(payment.date)}`,
        money(payment.amount),
      );
      if (payment.reference) text(`Ref: ${payment.reference}`, { small: true });
    }
  }
  if (credit) text(`Reason for credit: ${credit.reason}`);
  if (inv.notes) {
    rule();
    text("NOTES", { bold: true, small: true });
    text(inv.notes, { small: true });
  }
  if (
    inv.clinic.upi_id &&
    !credit &&
    inv.status === "issued" &&
    inv.balance > 0
  ) {
    rule();
    text(`UPI: ${inv.clinic.upi_id}`, { center: true });
    if (paymentURI(inv, options))
      blocks.push({ kind: "qr", uri: paymentURI(inv, options) });
    text(
      `Amount due: ${money(inv.balance)}. Payment is not automatically verified.`,
      { small: true, center: true },
    );
  }
  if (p.receipt_show_terms && inv.terms) {
    rule();
    text("TERMS & CONDITIONS", { small: true, bold: true });
    text(inv.terms, { small: true });
  }
  rule();
  if (p.receipt_footer) text(p.receipt_footer, { center: true });
  text(
    inv.status === "draft" && !credit
      ? "DRAFT — NOT VALID FOR PAYMENT OR TAX"
      : "Computer-generated document",
    { small: true, center: true },
  );
  return blocks;
}

const e = escapeHTML;
const multiline = (value) => e(value).replaceAll("\n", "<br>");
function receiptBody(inv, options) {
  const validQR = /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(
    options.qrData || "",
  )
    ? options.qrData
    : "";
  return `<article class="receipt" aria-label="Thermal bill">${receiptBlocks(
    inv,
    options,
  )
    .map((b) => {
      const classes = [
        b.bold && "bold",
        b.center && "center",
        b.small && "small",
        b.heading && "heading",
        b.total && "total",
      ]
        .filter(Boolean)
        .join(" ");
      if (b.kind === "rule") return "<hr>";
      if (b.kind === "space") return '<div class="receipt-space"></div>';
      if (b.kind === "pair")
        return `<div class="receipt-pair ${classes}"><span>${multiline(b.label)}</span><span>${multiline(b.value)}</span></div>`;
      if (b.kind === "qr")
        return validQR
          ? `<figure><img alt="UPI payment QR" src="${validQR}"><figcaption>Scan to pay outstanding balance</figcaption></figure>`
          : "";
      return `<p class="${classes}">${multiline(b.text)}</p>`;
    })
    .join("")}</article>`;
}
function a4Body(inv, options) {
  const d = documentIdentity(inv, options.credit);
  const c = inv.clinic;
  const qr =
    paymentURI(inv, options) &&
    /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(options.qrData || "")
      ? options.qrData
      : "";
  const address = [
    c.address,
    `${c.city}, ${stateName(c.state)}`,
    [c.phone, c.email].filter(Boolean).join(" · "),
  ]
    .filter(Boolean)
    .join("\n");
  return `<article class="a4-document">
    <header class="doc-head"><div class="doc-seller"><h1>${e(c.name)}</h1><p>${multiline(address)}</p>${c.gst_registered ? `<p class="bold">GSTIN: ${e(c.gstin)}</p>` : ""}${c.registration_no ? `<p>Vet registration: ${e(c.registration_no)}</p>` : ""}${c.drug_license ? `<p>Drug licence: ${e(c.drug_license)}</p>` : ""}</div>
    <div class="doc-meta"><h2>${e(d.title)}</h2><dl><div><dt>Document no.</dt><dd>${e(d.number)}</dd></div><div><dt>Date</dt><dd>${e(printDate(d.date))}</dd></div>${options.credit ? `<div><dt>Original invoice</dt><dd>${e(inv.number)}</dd></div>` : `<div><dt>Due date</dt><dd>${e(printDate(inv.due_date))}</dd></div>`}</dl></div></header>
    ${inv.status === "credited" && !options.credit ? `<p class="status-notice">CREDITED IN FULL · ${e(inv.credit?.number)}</p>` : ""}
    <section class="parties"><div><h3>BILL TO</h3><strong>${e(inv.customer.name || "Walk-in client")}</strong><p>${multiline([inv.customer.address, inv.customer.state ? stateName(inv.customer.state) : "", inv.customer.phone, inv.customer.gstin ? `GSTIN: ${inv.customer.gstin}` : ""].filter(Boolean).join("\n"))}</p></div><div><h3>SUPPLY DETAILS</h3><p>Place of supply: ${e(inv.place_of_supply + " · " + stateName(inv.place_of_supply))}${inv.pet.name ? `<br>Patient: ${e(inv.pet.name + " · " + inv.pet.species)}` : ""}<br>Prices: GST ${inv.inclusive ? "inclusive" : "exclusive"}<br>${c.gst_registered ? "Reverse charge: No" : "Unregistered supplier · GST not charged"}</p></div></section>
    <table class="items"><thead><tr><th>No.</th><th>DESCRIPTION / HSN OR SAC</th><th class="num">QTY</th><th class="num">RATE</th><th class="num">GST</th><th class="num">AMOUNT</th></tr></thead><tbody>${inv.lines
      .map(
        (l, index) =>
          `<tr><td>${index + 1}</td><td><strong>${e(l.name)}</strong><small>HSN/SAC ${e(l.hsn)} · ${e(l.unit)}${Number(l.discount) ? ` · Discount ${e(l.discount)}%` : ""}</small>${batchDetails(
            l,
          )
            .map((b) => `<small>${e(b)}</small>`)
            .join(
              "",
            )}</td><td class="num">${e(l.qty)}</td><td class="num">${e(money(l.rate))}</td><td class="num">${e(taxLabel(l))}</td><td class="num">${e(money(l.total))}</td></tr>`,
      )
      .join("")}</tbody></table>
    ${
      c.gst_registered
        ? `<section class="tax-summary"><h3>HSN / SAC TAX SUMMARY</h3><table><thead><tr><th>CODE / TREATMENT</th><th class="num">SUPPLY VALUE</th><th class="num">CGST</th><th class="num">SGST / UTGST</th><th class="num">IGST</th></tr></thead><tbody>${taxSummary(
            inv,
          )
            .map(
              (g) =>
                `<tr><td>${e(g.hsn)} · ${e(taxLabel(g))}</td><td class="num">${e(money(g.taxable))}</td><td class="num">${e(money(g.cgst))}</td><td class="num">${e(money(g.sgst))}</td><td class="num">${e(money(g.igst))}</td></tr>`,
            )
            .join("")}</tbody></table></section>`
        : ""
    }
    <section class="summary"><div class="words"><strong>${e(amountWords(inv.total))}</strong>${options.credit ? `<h3>REASON FOR CREDIT</h3><p>${multiline(options.credit.reason)}</p>` : ""}${inv.notes ? `<h3>NOTES</h3><p>${multiline(inv.notes)}</p>` : ""}</div><dl class="totals">${totalRows(
      inv,
      options.credit,
    )
      .map(
        ([label, value, style]) =>
          `<div class="${style || ""}"><dt>${e(label)}</dt><dd>${e(money(value))}</dd></div>`,
      )
      .join("")}</dl></section>
    ${bankDetails(inv).length ? `<section class="bank"><div><h3>PAYMENT DETAILS</h3><p>${multiline(bankDetails(inv).join(" · "))}</p></div>${qr ? `<figure><img alt="UPI payment QR" src="${qr}"><figcaption>Scan to pay ${e(money(inv.balance))}<br>Receipt is not automatically verified.</figcaption></figure>` : ""}</section>` : ""}
    ${inv.terms ? `<section class="terms"><h3>TERMS & CONDITIONS</h3><p>${multiline(inv.terms)}</p></section>` : ""}
    <footer><span>${inv.status === "draft" && !options.credit ? "Draft — not a tax document" : "Computer-generated document"}</span><span>For ${e(c.name)}<br><br>Authorised signatory</span></footer>
  </article>`;
}

export function renderDocumentHTML(inv, options = {}) {
  const p = printPreferences(options.settings || inv.clinic);
  const format = options.format === "thermal" ? "thermal" : "a4";
  const width =
    options.width === "58"
      ? "58"
      : options.width === "80"
        ? "80"
        : p.thermal_width;
  const template = INVOICE_TEMPLATES.some((t) => t.id === options.template)
    ? options.template
    : p.invoice_template;
  const opts = { ...options, settings: p, width, template };
  const d = documentIdentity(inv, options.credit);
  const toolbar = options.controls
    ? `<aside class="print-toolbar"><button id="print-document" type="button">Print</button><span>${format === "thermal" ? `${width} mm thermal · Select matching roll size, 100% scale, headers/footers off.` : "A4 · 100% scale · Browser headers/footers off."}</span></aside>`
    : "";
  const css = `
    *{box-sizing:border-box}html{background:#fff}body{margin:0;color:#111;background:#fff;font:11px/1.42 Arial,Helvetica,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}h1,h2,h3,p,dl,dd,figure{margin:0}p{white-space:normal;overflow-wrap:anywhere}h1{font-size:22px;line-height:1.2;font-weight:700;letter-spacing:0}h2{font-size:15px;line-height:1.35;font-weight:700;letter-spacing:.4px}h3{font-size:9px;font-weight:700;letter-spacing:.5px;margin:0 0 7px}.bold{font-weight:700}.small{font-size:9px}.center{text-align:center}.num{text-align:right;font-variant-numeric:tabular-nums}.a4-document{max-width:190mm;margin:0 auto;padding:12px}.doc-head{display:flex;justify-content:space-between;gap:25px;padding-bottom:15px;border-bottom:1.5px solid #111}.doc-seller{flex:1;min-width:0}.doc-seller p{margin-top:5px;font-size:10px;line-height:1.4}.doc-meta{width:235px;flex-shrink:0;text-align:right}.doc-meta h2{margin-bottom:12px}.doc-meta dl>div{display:flex;justify-content:space-between;gap:12px;margin-top:4px}.doc-meta dt{color:#444;text-align:left}.doc-meta dd{font-weight:600;overflow-wrap:anywhere}.parties{display:grid;grid-template-columns:1fr 1fr;gap:28px;padding:15px 0}.parties p{margin-top:4px;line-height:1.45}.items,table{width:100%;border-collapse:collapse;table-layout:auto}.items th,th{font-size:9px;text-align:left;padding:7px 6px;border-bottom:1px solid #555;border-top:1px solid #555;background:#f4f4f4}.items th.num,th.num{text-align:right}.items td,td{padding:8px 6px;border-bottom:1px solid #ccc;vertical-align:top;overflow-wrap:anywhere}.items td:first-child{width:25px}.items td:nth-child(2){width:43%}.items td:nth-child(n+3){white-space:nowrap}.items small{display:block;font-size:9px;line-height:1.4;margin-top:3px;color:#333}.tax-summary{margin-top:16px}.tax-summary table{font-size:9px}.tax-summary td,.tax-summary th{padding:5px 6px}.summary{display:grid;grid-template-columns:1fr 265px;gap:25px;margin-top:17px}.words{font-size:10px;line-height:1.5}.words h3{margin-top:13px;margin-bottom:4px}.totals>div{display:flex;justify-content:space-between;gap:15px;padding:4px 0}.totals dd{font-variant-numeric:tabular-nums;white-space:nowrap}.totals .total{font-size:14px;font-weight:700;border-top:1.5px solid #111;border-bottom:1px solid #111;padding:7px 0;margin:4px 0}.totals .balance{font-weight:700}.bank,.terms{border-top:1px solid #bbb;padding-top:10px;margin-top:15px;font-size:10px}.bank{display:flex;align-items:flex-start;justify-content:space-between;gap:20px}.bank>div{flex:1}.bank img{width:90px;height:90px}.bank figure{text-align:center;flex:0 0 128px}.bank figcaption{font-size:8px}footer{display:flex;justify-content:space-between;gap:20px;border-top:1px solid #aaa;padding-top:10px;margin-top:23px;font-size:9px}footer>span:last-child{text-align:right}.status-notice{border:1px solid #333;padding:7px;margin-top:10px;font-weight:bold}.template-compact{font-size:10px;line-height:1.3}.template-compact h1{font-size:19px}.template-compact .doc-seller p{font-size:9px;margin-top:3px}.template-compact .doc-head{padding-bottom:10px}.template-compact .parties{padding:10px 0}.template-compact .items td{padding:5px}.template-compact .items small{font-size:8px;margin-top:2px}.template-compact .summary{margin-top:12px}.template-compact .totals>div{padding:3px 0}.template-classic .doc-head{display:block;text-align:center;border-bottom:2px solid #111}.template-classic .doc-meta{width:100%;text-align:center;margin-top:13px;border-top:1px solid #aaa;padding-top:10px}.template-classic .doc-meta dl{display:flex;justify-content:center;flex-wrap:wrap;gap:18px}.template-classic .doc-meta dl>div{gap:8px}.template-classic .doc-meta h2{margin-bottom:6px}.template-classic .items th,.template-classic .items td{border:1px solid #777}.receipt{width:${Number(width) - 6}mm;margin:0 auto;padding:0;color:#000;font-size:${width === "58" ? "11" : "12"}px;line-height:1.32;overflow-wrap:anywhere}.receipt p{margin:3px 0}.receipt .heading{font-size:${width === "58" ? "15" : "17"}px;line-height:1.2;margin:4px 0 7px}.receipt .small{font-size:${width === "58" ? "9.5" : "10"}px}.receipt hr{border:0;border-top:1px dashed #222;margin:8px 0}.receipt-pair{display:flex;justify-content:space-between;gap:8px;margin:4px 0;break-inside:avoid}.receipt-pair>span:first-child{flex:1;min-width:0}.receipt-pair>span:last-child{flex:0 0 auto;max-width:52%;text-align:right;overflow-wrap:anywhere;font-variant-numeric:tabular-nums}.receipt-pair.total{font-size:15px;padding:6px 0;border-top:1px solid #000;border-bottom:1px solid #000;margin:7px 0}.receipt-space{height:5px}.receipt figure{text-align:center;margin:8px 0}.receipt figure img{width:32mm;height:32mm;max-width:100%}.receipt figcaption{font-size:9px}.print-toolbar{font:12px Arial,sans-serif;background:#eee;color:#222;padding:12px;margin-bottom:18px;display:flex;align-items:center;justify-content:center;gap:15px}.print-toolbar button{border:1px solid #777;background:#fff;color:#111;padding:7px 20px;border-radius:3px;cursor:pointer}thead{display:table-header-group}tr,figure,.receipt-pair,footer{break-inside:avoid}h3{break-after:avoid}.terms p{orphans:2;widows:2}
    @page{size:${format === "thermal" ? `${width}mm ${Math.max(50, Math.min(1000, Number(options.pageHeightMm) || 297))}mm` : "A4"};margin:${format === "thermal" ? "3mm" : "12mm"}}
    @media screen{body{padding:10px 0}.a4-document{min-width:575px}body[data-format=thermal]{padding:12px 0}}
    @media print{body{padding:0!important}.print-toolbar{display:none!important}.a4-document{padding:0;max-width:none;min-width:0}.receipt{margin:0;width:${Number(width) - 6}mm}a{color:inherit;text-decoration:none}}
  `;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${e(d.title + " " + d.number)}</title><style>${css}</style></head><body data-format="${format}" data-width="${width}" data-template="${template}" class="template-${template}">${toolbar}${format === "thermal" ? receiptBody(inv, opts) : a4Body(inv, opts)}</body></html>`;
}
