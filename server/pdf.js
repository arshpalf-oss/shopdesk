import PDFDocument from "pdfkit";
import QRCode from "qrcode";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  money,
  stateName,
  amountWords,
  RETURN_CONDITION_LABELS,
} from "../shared.js";
import {
  printPreferences,
  documentIdentity,
  printDate,
  batchDetails,
  taxLabel,
  taxSummary,
  totalRows,
  bankDetails,
  paymentURI,
  receiptBlocks,
} from "../printing.js";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const mm = (value) => (value * 72) / 25.4;
function registerFonts(doc) {
  doc.registerFont("Regular", path.join(root, "assets", "DejaVuSans.ttf"));
  doc.registerFont("Bold", path.join(root, "assets", "DejaVuSans-Bold.ttf"));
  doc.font("Regular");
}
function font(doc, size, bold = false) {
  doc.font(bold ? "Bold" : "Regular").fontSize(size);
  if (doc.page) doc.fillColor("#111111");
  return doc;
}
// Explicit wrapping keeps long item names, licence numbers and batch lists inside the page.
function wrap(doc, value, width, size, bold = false) {
  font(doc, size, bold);
  const lines = [];
  for (const paragraph of String(value ?? "")
    .replaceAll("\r", "")
    .split("\n")) {
    if (!paragraph.trim()) {
      lines.push("");
      continue;
    }
    let current = "";
    for (const word of paragraph.trim().split(/\s+/)) {
      const candidate = current ? current + " " + word : word;
      if (doc.widthOfString(candidate) <= width) {
        current = candidate;
        continue;
      }
      if (current) {
        lines.push(current);
        current = "";
      }
      if (doc.widthOfString(word) <= width) {
        current = word;
        continue;
      }
      for (const character of Array.from(word)) {
        if (current && doc.widthOfString(current + character) > width) {
          lines.push(current);
          current = "";
        }
        current += character;
      }
    }
    if (current) lines.push(current);
  }
  return lines;
}
function drawLine(
  doc,
  value,
  x,
  y,
  width,
  size = 9,
  bold = false,
  align = "left",
) {
  font(doc, size, bold).text(String(value ?? ""), x, y, {
    width,
    height: size * 1.5,
    lineBreak: false,
    align,
  });
}
function drawText(
  doc,
  value,
  x,
  y,
  width,
  size = 9,
  bold = false,
  align = "left",
  leading = size * 1.35,
) {
  for (const line of wrap(doc, value, width, size, bold)) {
    drawLine(doc, line, x, y, width, size, bold, align);
    y += leading;
  }
  return y;
}
function rule(doc, x, y, width, dark = false) {
  doc
    .moveTo(x, y)
    .lineTo(x + width, y)
    .lineWidth(dark ? 0.8 : 0.45)
    .strokeColor(dark ? "#333333" : "#b3b3b3")
    .stroke();
}

export async function invoicePDF(res, inv, credit = null, options = {}) {
  const p = printPreferences(options.settings || inv.clinic);
  const template = ["corporate", "compact", "classic"].includes(
    options.template,
  )
    ? options.template
    : p.invoice_template;
  const compact = template === "compact",
    classic = template === "classic";
  const d = documentIdentity(inv, credit);
  const margin = compact ? 32 : 36;
  const doc = new PDFDocument({
    size: "A4",
    margins: { top: margin, left: margin, right: margin, bottom: 18 },
    bufferPages: true,
    info: {
      Title: `${d.title} ${d.number}`,
      Author: inv.clinic.name,
      Creator: "shop desk",
      Subject: `A4 ${template} invoice`,
    },
  });
  registerFonts(doc);
  doc.pipe(res);
  const left = margin,
    width = doc.page.width - 2 * margin,
    bottom = doc.page.height - 57;
  const normal = compact ? 8.1 : classic ? 8.3 : 8.8,
    small = compact ? 7 : classic ? 7.2 : 7.5;
  let y = margin;
  function newPage() {
    doc.addPage();
    const sellerBottom = drawText(
      doc,
      inv.clinic.name,
      left,
      24,
      width * 0.6,
      9,
      true,
    );
    const numberBottom = drawText(
      doc,
      `${d.number} · continued`,
      left + width * 0.6,
      24,
      width * 0.4,
      7.5,
      false,
      "right",
    );
    y = Math.max(46, sellerBottom + 8, numberBottom + 8);
    rule(doc, left, y, width);
    y += 14;
  }
  const ensure = (height) => {
    if (y + height > bottom) {
      newPage();
      return true;
    }
    return false;
  };
  function flow(value, { size = normal, bold = false, heading = "" } = {}) {
    const lines = wrap(doc, value, width, size, bold);
    if (heading) {
      ensure(size * 1.4 + 25);
      drawLine(doc, heading, left, y, width, 7.5, true);
      y += 15;
    }
    for (const line of lines) {
      ensure(size * 1.4);
      drawLine(doc, line, left, y, width, size, bold);
      y += size * 1.4;
    }
    y += 8;
  }

  const c = inv.clinic;
  const seller = [
    c.address,
    `${c.city}, ${stateName(c.state)}`,
    [c.phone, c.email].filter(Boolean).join(" · "),
    c.gst_registered ? `GSTIN: ${c.gstin}` : "",
    [
      c.registration_no ? `Vet registration: ${c.registration_no}` : "",
      c.drug_license ? `Drug licence: ${c.drug_license}` : "",
    ]
      .filter(Boolean)
      .join(" · "),
  ]
    .filter(Boolean)
    .join("\n");
  if (classic) {
    y = drawText(doc, c.name, left, y, width, 19, true, "center") + 5;
    y = drawText(doc, seller, left, y, width, normal, false, "center") + 10;
    rule(doc, left, y, width, true);
    y += 11;
    y = drawText(doc, d.title, left, y, width, 11, true, "center") + 7;
    const details = `${d.number}  |  Date: ${printDate(d.date)}  |  ${credit ? "Original: " + inv.number : "Due: " + printDate(inv.due_date)}`;
    y = drawText(doc, details, left, y, width, normal, false, "center") + 11;
  } else {
    const sellerWidth = width - 202;
    let a =
      drawText(doc, c.name, left, y, sellerWidth, compact ? 17 : 19, true) + 6;
    a = drawText(doc, seller, left, a, sellerWidth, normal) + 10;
    const right = left + sellerWidth + 18,
      rw = 184;
    let b = drawText(doc, d.title, right, y, rw, 10.5, true, "right") + 9;
    b = drawText(doc, d.number, right, b, rw, 11, true, "right") + 8;
    b =
      drawText(
        doc,
        `Date: ${printDate(d.date)}`,
        right,
        b,
        rw,
        normal,
        false,
        "right",
      ) + 4;
    b = drawText(
      doc,
      credit ? `Original: ${inv.number}` : `Due: ${printDate(inv.due_date)}`,
      right,
      b,
      rw,
      normal,
      false,
      "right",
    );
    y = Math.max(a, b) + 3;
  }
  rule(doc, left, y, width, true);
  y += 13;
  const half = (width - 28) / 2;
  drawLine(doc, "BILL TO", left, y, half, 7.5, true);
  drawLine(doc, "SUPPLY DETAILS", left + half + 28, y, half, 7.5, true);
  y += 15;
  let a =
    drawText(
      doc,
      inv.customer.name || "Walk-in client",
      left,
      y,
      half,
      10,
      true,
    ) + 4;
  a = drawText(
    doc,
    [
      inv.customer.address,
      inv.customer.state ? stateName(inv.customer.state) : "",
      inv.customer.phone,
      inv.customer.gstin ? `GSTIN: ${inv.customer.gstin}` : "",
    ]
      .filter(Boolean)
      .join("\n"),
    left,
    a,
    half,
    normal,
  );
  let b = drawText(
    doc,
    [
      `Place of supply: ${inv.place_of_supply} · ${stateName(inv.place_of_supply)}`,
      inv.pet.name ? `Patient: ${inv.pet.name} · ${inv.pet.species}` : "",
      `Prices: GST ${inv.inclusive ? "inclusive" : "exclusive"}`,
      c.gst_registered
        ? "Reverse charge: No"
        : "Unregistered supplier · GST not charged",
    ]
      .filter(Boolean)
      .join("\n"),
    left + half + 28,
    y,
    half,
    normal,
  );
  y = Math.max(a, b) + 15;
  if (inv.status === "credited" && !credit)
    flow(`CREDITED IN FULL · ${inv.credit?.number || ""}`, { bold: true });

  function table(columns, rows) {
    const pad = compact || classic ? 4 : 5;
    const headerHeight = compact || classic ? 21 : 22;
    function header() {
      doc.rect(left, y, width, headerHeight).fill("#f2f2f2");
      rule(doc, left, y, width, true);
      rule(doc, left, y + headerHeight, width, true);
      let x = left;
      for (const col of columns) {
        drawText(
          doc,
          col.title,
          x + pad,
          y + 7,
          col.width - pad * 2,
          7,
          true,
          col.align || "left",
          8,
        );
        if (classic)
          doc
            .moveTo(x, y)
            .lineTo(x, y + headerHeight)
            .lineWidth(0.45)
            .strokeColor("#777")
            .stroke();
        x += col.width;
      }
      if (classic)
        doc
          .moveTo(left + width, y)
          .lineTo(left + width, y + headerHeight)
          .stroke();
      y += headerHeight;
    }
    ensure(headerHeight + 30);
    header();
    for (const cells of rows) {
      const remaining = cells.map((cell, index) => {
        const segments = Array.isArray(cell) ? cell : [{ text: cell }];
        return segments.flatMap((segment) => {
          const size = segment.size || normal,
            leading = size * 1.35;
          return wrap(
            doc,
            segment.text,
            columns[index].width - pad * 2,
            size,
            !!segment.bold,
          ).map((text) => ({ text, size, bold: !!segment.bold, leading }));
        });
      });
      const fullHeight =
        Math.max(
          ...remaining.map((lines) =>
            lines.reduce((n, line) => n + line.leading, 0),
          ),
        ) +
        pad * 2;
      if (fullHeight < bottom - 85 && y + fullHeight > bottom) {
        newPage();
        header();
      }
      while (remaining.some((lines) => lines.length)) {
        const available = bottom - y - pad * 2;
        if (available < normal * 1.5) {
          newPage();
          header();
          continue;
        }
        const chunks = remaining.map((lines) => {
          const chunk = [];
          let height = 0;
          while (lines.length && height + lines[0].leading <= available) {
            const line = lines.shift();
            height += line.leading;
            chunk.push(line);
          }
          return { lines: chunk, height };
        });
        const height =
          Math.max(...chunks.map((chunk) => chunk.height), normal * 1.35) +
          pad * 2;
        let x = left;
        chunks.forEach((chunk, index) => {
          let cy = y + pad;
          for (const line of chunk.lines) {
            drawLine(
              doc,
              line.text,
              x + pad,
              cy,
              columns[index].width - pad * 2,
              line.size,
              line.bold,
              columns[index].align || "left",
            );
            cy += line.leading;
          }
          if (classic)
            doc
              .moveTo(x, y)
              .lineTo(x, y + height)
              .lineWidth(0.45)
              .strokeColor("#777")
              .stroke();
          x += columns[index].width;
        });
        if (classic)
          doc
            .moveTo(left + width, y)
            .lineTo(left + width, y + height)
            .stroke();
        y += height;
        rule(doc, left, y, width);
        if (remaining.some((lines) => lines.length)) {
          newPage();
          header();
        }
      }
    }
    y += 13;
  }
  const columns = [
    { title: "#", width: 24 },
    { title: "DESCRIPTION / HSN OR SAC", width: width - 308 },
    { title: "QTY", width: 42, align: "right" },
    { title: "RATE", width: 82, align: "right" },
    { title: "GST", width: 59, align: "right" },
    { title: "AMOUNT", width: 101, align: "right" },
  ];
  table(
    columns,
    inv.lines.map((line, index) => [
      String(index + 1),
      [
        { text: line.name, bold: true },
        {
          text: `HSN/SAC ${line.hsn} · ${line.unit}${Number(line.discount) ? ` · Discount ${line.discount}%` : ""}`,
          size: small,
        },
        ...batchDetails(line).map((text) => ({ text, size: small })),
      ],
      String(line.qty),
      money(line.rate),
      [{ text: taxLabel(line), size: small }],
      [{ text: money(line.total), bold: true }],
    ]),
  );

  if (c.gst_registered) {
    ensure(80);
    drawLine(doc, "HSN / SAC TAX SUMMARY", left, y, width, 7.5, true);
    y += 15;
    const taxColumns = [
      { title: "CODE / TREATMENT", width: width - 351 },
      { title: "SUPPLY VALUE", width: 100, align: "right" },
      { title: "CGST", width: 78, align: "right" },
      { title: "SGST / UTGST", width: 95, align: "right" },
      { title: "IGST", width: 78, align: "right" },
    ];
    table(
      taxColumns,
      taxSummary(inv).map((g) =>
        [
          `${g.hsn} · ${taxLabel(g)}`,
          money(g.taxable),
          money(g.cgst),
          money(g.sgst),
          money(g.igst),
        ].map((text) => [{ text, size: small }]),
      ),
    );
  }
  const rows = totalRows(inv, credit),
    totalsWidth = 237,
    wordsWidth = width - totalsWidth - 25;
  const rowHeight = compact || classic ? 16 : 17;
  const totalsHeight = rows.reduce(
    (h, row) => h + (row[2] === "total" ? rowHeight + 10 : rowHeight),
    0,
  );
  const wordsHeight =
    wrap(doc, amountWords(inv.total), wordsWidth, normal, true).length *
    normal *
    1.4;
  ensure(Math.max(totalsHeight, wordsHeight) + 10);
  const top = y;
  let leftY =
    drawText(
      doc,
      amountWords(inv.total),
      left,
      y + 4,
      wordsWidth,
      normal,
      true,
    ) + 10;
  const afterSummary = [];
  for (const [heading, value] of [
    ["REASON FOR CREDIT", credit?.reason],
    ["NOTES", inv.notes],
  ]) {
    if (!value) continue;
    const height =
      15 + wrap(doc, value, wordsWidth, normal).length * normal * 1.35 + 8;
    if (leftY + height <= top + totalsHeight) {
      drawLine(doc, heading, left, leftY, wordsWidth, 7.5, true);
      leftY = drawText(doc, value, left, leftY + 15, wordsWidth, normal) + 8;
    } else afterSummary.push([heading, value]);
  }
  for (const [label, value, style] of rows) {
    if (style === "total") {
      rule(doc, left + width - totalsWidth, y, totalsWidth, true);
      y += 6;
    }
    const size = style === "total" ? 10 : normal;
    drawLine(doc, label, left + width - totalsWidth, y + 2, 137, size, !!style);
    drawLine(
      doc,
      money(value),
      left + width - 100,
      y + 2,
      100,
      size,
      !!style,
      "right",
    );
    y += style === "total" ? rowHeight + 4 : rowHeight;
  }
  y = Math.max(y, leftY, top + wordsHeight) + 13;
  for (const [heading, value] of afterSummary) flow(value, { heading });

  const bank = bankDetails(inv);
  if (bank.length) {
    const uri = paymentURI(inv, { ...options, settings: p, credit });
    let qr = null;
    if (uri)
      qr = await QRCode.toBuffer(uri, { margin: 2, width: 240 }).catch(
        () => null,
      );
    const bankWidth = qr ? width - 120 : width;
    const bankHeight =
      wrap(doc, bank.join(" · "), bankWidth, normal).length * normal * 1.35;
    const height = Math.max(bankHeight + 26, qr ? 94 : 0);
    ensure(height + 8);
    rule(doc, left, y, width);
    y += 10;
    drawLine(doc, "PAYMENT DETAILS", left, y, bankWidth, 7.5, true);
    const bankTop = y + 15;
    drawText(doc, bank.join(" · "), left, bankTop, bankWidth, normal);
    if (qr) {
      doc.image(qr, left + width - 76, y - 4, { width: 70, height: 70 });
      drawText(
        doc,
        `Scan to pay ${money(inv.balance)}\nPayment not automatically verified.`,
        left + width - 120,
        y + 70,
        120,
        6,
        false,
        "center",
      );
    }
    y += height;
  }
  if (inv.terms)
    flow(inv.terms, { size: small, heading: "TERMS & CONDITIONS" });
  ensure(24);
  y += 12;
  drawLine(
    doc,
    "Authorised signatory",
    left + width - 180,
    y,
    180,
    7.5,
    false,
    "right",
  );

  const pages = doc.bufferedPageRange();
  for (let index = pages.start; index < pages.start + pages.count; index++) {
    doc.switchToPage(index);
    const footerY = doc.page.height - 42;
    rule(doc, left, footerY, width);
    drawLine(
      doc,
      inv.status === "draft" && !credit
        ? "DRAFT — NOT A TAX DOCUMENT"
        : "Computer-generated document",
      left,
      footerY + 8,
      width - 70,
      6.5,
    );
    drawLine(
      doc,
      `${index + 1} / ${pages.count}`,
      left + width - 65,
      footerY + 8,
      65,
      6.5,
      false,
      "right",
    );
  }
  doc.end();
}

export async function thermalPDF(res, inv, credit = null, options = {}) {
  const p = printPreferences(options.settings || inv.clinic);
  const paper =
    options.width === "58" || options.width === "80"
      ? options.width
      : p.thermal_width;
  const pageWidth = mm(Number(paper)),
    margin = mm(3),
    width = pageWidth - margin * 2;
  const d = documentIdentity(inv, credit);
  const doc = new PDFDocument({
    autoFirstPage: false,
    bufferPages: true,
    info: {
      Title: `${d.title} ${d.number}`,
      Author: inv.clinic.name,
      Creator: "shop desk",
      Subject: `${paper}mm thermal bill`,
    },
  });
  registerFonts(doc);
  doc.pipe(res);
  const base = paper === "58" ? 7.8 : 8.6;
  const blocks = receiptBlocks(inv, { ...options, settings: p, credit });
  const items = [];
  for (const block of blocks) {
    if (block.kind === "rule" || block.kind === "space") {
      items.push({ ...block, height: block.kind === "rule" ? 12 : 5 });
      continue;
    }
    if (block.kind === "qr") {
      items.push({ ...block, height: 113 });
      continue;
    }
    const size = block.heading
      ? paper === "58"
        ? 10.5
        : 12
      : block.small
        ? base - 1
        : block.total
          ? base + 1.3
          : base;
    const leading = size * 1.4;
    if (block.kind === "pair") {
      const rightWidth = Math.min(
        width * 0.52,
        Math.max(
          45,
          font(doc, size, block.bold).widthOfString(block.value) + 2,
        ),
      );
      const labelWidth = width - rightWidth - 6;
      const labelLines = wrap(doc, block.label, labelWidth, size, block.bold);
      const valueLines = wrap(doc, block.value, rightWidth, size, block.bold);
      items.push({
        ...block,
        size,
        leading,
        labelWidth,
        rightWidth,
        labelLines,
        valueLines,
        height:
          Math.max(labelLines.length, valueLines.length) * leading +
          (block.total ? 12 : 4),
      });
    } else {
      const lines = wrap(doc, block.text, width, size, block.bold);
      items.push({
        ...block,
        size,
        leading,
        lines,
        height: lines.length * leading + 4,
      });
    }
  }
  let remaining = items.reduce((sum, item) => sum + item.height, 0),
    y = margin,
    pageIndex = 0;
  const maximum = mm(1000),
    minimum = mm(50),
    footerSpace = 14;
  function addPage() {
    const continuation =
      pageIndex > 0
        ? wrap(doc, inv.clinic.name, width, 8, true).length * 8 * 1.35 +
          wrap(doc, `${d.number} · continued`, width, 6.7).length * 6.7 * 1.35 +
          13
        : 0;
    const height = Math.min(
      maximum,
      Math.max(
        minimum,
        remaining + margin * 2 + footerSpace + continuation + 4,
      ),
    );
    doc.addPage({
      size: [pageWidth, height],
      margins: { top: margin, left: margin, right: margin, bottom: 5 },
    });
    y = margin;
    pageIndex++;
    if (continuation) {
      y =
        drawText(doc, inv.clinic.name, margin, y, width, 8, true, "center") + 2;
      y =
        drawText(
          doc,
          `${d.number} · continued`,
          margin,
          y,
          width,
          6.7,
          false,
          "center",
        ) + 5;
      rule(doc, margin, y, width);
      y += 6;
    }
  }
  const ensure = (height) => {
    if (y + height > doc.page.height - margin - footerSpace) addPage();
  };
  addPage();
  for (const item of items) {
    if (item.kind === "rule") {
      ensure(12);
      doc.save().dash(1.5, { space: 1.5 });
      rule(doc, margin, y + 6, width, true);
      doc.restore();
      y += 12;
      remaining -= 12;
    } else if (item.kind === "space") {
      ensure(5);
      y += 5;
      remaining -= 5;
    } else if (item.kind === "qr") {
      ensure(item.height);
      const qr = await QRCode.toBuffer(item.uri, {
        width: 240,
        margin: 2,
        errorCorrectionLevel: "M",
      }).catch(() => null);
      if (qr) {
        const side = Math.min(96, width);
        doc.image(qr, (pageWidth - side) / 2, y + 2, {
          width: side,
          height: side,
        });
        drawText(
          doc,
          "Scan to pay outstanding balance",
          margin,
          y + side + 5,
          width,
          6.5,
          false,
          "center",
        );
      }
      y += item.height;
      remaining -= item.height;
    } else if (item.kind === "pair") {
      ensure(item.height);
      if (item.total) {
        rule(doc, margin, y, width, true);
        y += 6;
      }
      drawText(
        doc,
        item.label,
        margin,
        y,
        item.labelWidth,
        item.size,
        item.bold,
        "left",
        item.leading,
      );
      drawText(
        doc,
        item.value,
        margin + width - item.rightWidth,
        y,
        item.rightWidth,
        item.size,
        item.bold,
        "right",
        item.leading,
      );
      y += item.height - (item.total ? 6 : 0);
      if (item.total) rule(doc, margin, y - 2, width, true);
      remaining -= item.height;
    } else {
      for (const line of item.lines) {
        ensure(item.leading);
        drawLine(
          doc,
          line,
          margin,
          y,
          width,
          item.size,
          item.bold,
          item.center ? "center" : "left",
        );
        y += item.leading;
        remaining -= item.leading;
      }
      y += 4;
      remaining -= 4;
    }
  }
  const pages = doc.bufferedPageRange();
  if (pages.count > 1) {
    for (let index = pages.start; index < pages.start + pages.count; index++) {
      doc.switchToPage(index);
      drawLine(
        doc,
        `Page ${index + 1} / ${pages.count}`,
        margin,
        doc.page.height - 18,
        width,
        6,
        false,
        "center",
      );
    }
  }
  doc.end();
}

// A customer-return document is deliberately separate from the invoice and the
// credit note. It records what physically came back and whether it re-entered
// stock; any money refunded is recorded separately in the payments ledger.
export async function returnPDF(res, ret, inv, options = {}) {
  const c = inv.clinic || {};
  const margin = 36;
  const doc = new PDFDocument({
    size: "A4",
    margins: { top: margin, left: margin, right: margin, bottom: 18 },
    bufferPages: true,
    info: {
      Title: `RETURN NOTE ${ret.number}`,
      Author: c.name || "shop desk",
      Creator: "shop desk",
      Subject: `Customer return against ${inv.number}`,
    },
  });
  registerFonts(doc);
  doc.pipe(res);
  const left = margin,
    width = doc.page.width - 2 * margin,
    bottom = doc.page.height - 57;
  const normal = 8.6,
    small = 7.4;
  let y = margin;
  function newPage() {
    doc.addPage();
    const a = drawText(doc, c.name, left, 24, width * 0.6, 9, true);
    const b = drawText(
      doc,
      `${ret.number} · continued`,
      left + width * 0.6,
      24,
      width * 0.4,
      7.5,
      false,
      "right",
    );
    y = Math.max(46, a + 8, b + 8);
    rule(doc, left, y, width);
    y += 14;
  }
  const ensure = (height) => {
    if (y + height > bottom) {
      newPage();
      return true;
    }
    return false;
  };
  const conditionLabel = (line) => {
    if (line.type === "service")
      return "Service · no physical stock";
    if (line.condition === "resellable")
      return `Resellable · back to stock`;
    if (line.condition === "damaged")
      return "Damaged · not restocked";
    if (line.condition === "expired")
      return "Expired · not restocked";
    return RETURN_CONDITION_LABELS[line.condition] || line.condition;
  };

  const seller = [
    c.address,
    `${c.city || ""}, ${stateName(c.state)}`.replace(/^, /, ""),
    [c.phone, c.email].filter(Boolean).join(" · "),
    c.gst_registered ? `GSTIN: ${c.gstin}` : "",
    [
      c.registration_no ? `Vet registration: ${c.registration_no}` : "",
      c.drug_license ? `Drug licence: ${c.drug_license}` : "",
    ]
      .filter(Boolean)
      .join(" · "),
  ]
    .filter(Boolean)
    .join("\n");
  const sellerBottom =
    drawText(doc, c.name, left, y, width - 210, 19, true) + 6;
  let a = drawText(doc, seller, left, sellerBottom, width - 210, normal) + 10;
  const right = left + width - 190,
    rw = 190;
  let b = drawText(doc, "RETURN NOTE", right, y, rw, 10.5, true, "right") + 9;
  b = drawText(doc, ret.number, right, b, rw, 11, true, "right") + 8;
  b =
    drawText(
      doc,
      `Date: ${printDate(ret.date)}`,
      right,
      b,
      rw,
      normal,
      false,
      "right",
    ) + 4;
  b = drawText(
    doc,
    `Against invoice: ${inv.number}`,
    right,
    b,
    rw,
    normal,
    false,
    "right",
  );
  y = Math.max(a, b) + 3;
  rule(doc, left, y, width, true);
  y += 13;

  const half = (width - 28) / 2;
  drawLine(doc, "RETURNED BY", left, y, half, 7.5, true);
  drawLine(doc, "RETURN DETAILS", left + half + 28, y, half, 7.5, true);
  y += 15;
  const customerBottom =
    drawText(
      doc,
      inv.customer.name || "Walk-in client",
      left,
      y,
      half,
      10,
      true,
    ) + 4;
  const ca = drawText(
    doc,
    [
      inv.customer.address,
      inv.customer.state ? stateName(inv.customer.state) : "",
      inv.customer.phone,
      inv.customer.gstin ? `GSTIN: ${inv.customer.gstin}` : "",
    ]
      .filter(Boolean)
      .join("\n"),
    left,
    customerBottom,
    half,
    normal,
  );
  const cb = drawText(
    doc,
    [
      `Original invoice: ${inv.number}`,
      `Invoice date: ${printDate(inv.date)}`,
      inv.pet.name ? `Patient: ${inv.pet.name} · ${inv.pet.species}` : "",
      `Reason: ${ret.reason}`,
      `Original invoice total: ${money(inv.total)}`,
    ]
      .filter(Boolean)
      .join("\n"),
    left + half + 28,
    y,
    half,
    normal,
  );
  y = Math.max(ca, cb) + 16;

  const columns = [
    { title: "#", width: 22 },
    { title: "ITEM · HSN · CONDITION", width: width - 326 },
    { title: "QTY", width: 46, align: "right" },
    { title: "RATE", width: 66, align: "right" },
    { title: "TAXABLE", width: 70, align: "right" },
    { title: "GST", width: 60, align: "right" },
    { title: "TOTAL", width: 62, align: "right" },
  ];
  const pad = 5;
  function header() {
    doc.rect(left, y, width, 21).fill("#f2f2f2");
    rule(doc, left, y, width, true);
    rule(doc, left, y + 21, width, true);
    let x = left;
    for (const col of columns) {
      drawText(doc, col.title, x + pad, y + 7, col.width - pad * 2, 7, true, col.align || "left", 8);
      x += col.width;
    }
    y += 21;
  }
  ensure(21 + 40);
  header();
  ret.lines.forEach((line, index) => {
    const cells = [
      [{ text: String(index + 1) }],
      [
        { text: line.name, bold: true },
        { text: `${line.hsn} · ${conditionLabel(line)}`, size: small },
      ],
      [{ text: `${line.qty} ${line.unit}` }],
      [{ text: money(line.rate) }],
      [{ text: money(line.taxable) }],
      [{ text: money(line.tax) }],
      [{ text: money(line.total), bold: true }],
    ];
    const wrapped = cells.map((segments, columnIndex) =>
      segments.flatMap((segment) => {
        const size = segment.size || normal,
          leading = size * 1.35;
        return wrap(
          doc,
          segment.text,
          columns[columnIndex].width - pad * 2,
          size,
          !!segment.bold,
        ).map((text) => ({
          text,
          size,
          bold: !!segment.bold,
          leading,
        }));
      }),
    );
    const height =
      Math.max(
        ...wrapped.map((lines) =>
          lines.reduce((n, line) => n + line.leading, 0),
        ),
      ) +
      pad * 2;
    if (ensure(height + 2)) header();
    let x = left;
    wrapped.forEach((lines, columnIndex) => {
      let cy = y + pad;
      for (const line of lines) {
        drawLine(
          doc,
          line.text,
          x + pad,
          cy,
          columns[columnIndex].width - pad * 2,
          line.size,
          line.bold,
          columns[columnIndex].align || "left",
        );
        cy += line.leading;
      }
      x += columns[columnIndex].width;
    });
    y += height;
    rule(doc, left, y, width);
  });
  y += 14;
  ensure(220);

  const restocked = ret.lines
    .filter((line) => line.type !== "service" && line.condition === "resellable")
    .reduce((n, line) => n + line.qty, 0);
  const withheld = ret.lines
    .filter((line) => line.type !== "service" && line.condition !== "resellable")
    .reduce((n, line) => n + line.qty, 0);
  const totalUnits = ret.lines.reduce((n, line) => n + line.qty, 0);
  const stockNote = [
    `${totalUnits} ${totalUnits === 1 ? "unit" : "units"} recorded on this return.`,
    restocked
      ? `${restocked} ${restocked === 1 ? "unit was" : "units were"} returned to the original batch and can be sold again.`
      : "",
    withheld
      ? `${withheld} ${withheld === 1 ? "unit was" : "units were"} damaged or expired and deliberately not restocked.`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
  const noteWidth = width - 250;
  let ny = drawText(doc, "GOODS RECEIVED", left, y, noteWidth, 7.5, true) + 8;
  ny = drawText(doc, stockNote, left, ny, noteWidth, small) + 8;
  ny =
    drawText(
      doc,
      `Refund due against the invoice as at this return: ${money(ret.refund_due)}. Any refund is recorded separately after the money is actually paid.`,
      left,
      ny,
      noteWidth,
      small,
    ) + 8;
  if (ret.notes)
    ny = drawText(doc, `Notes: ${ret.notes}`, left, ny, noteWidth, small) + 8;

  const totalsWidth = 220,
    tx = left + width - totalsWidth;
  let ty = y;
  const totalRows = [["Supply value", ret.taxable]];
  if (ret.discount) totalRows.push(["Discount (included)", -ret.discount]);
  if (ret.cgst || ret.sgst)
    totalRows.push(["CGST", ret.cgst], ["SGST / UTGST", ret.sgst]);
  if (ret.igst) totalRows.push(["IGST", ret.igst]);
  if (ret.rounding) totalRows.push(["Round off", ret.rounding]);
  for (const [label, value] of totalRows) {
    drawLine(doc, label, tx, ty, 120, small);
    drawLine(doc, money(value), tx + 120, ty, 100, small, false, "right");
    ty += 14;
  }
  rule(doc, tx, ty + 2, totalsWidth);
  ty += 9;
  drawLine(doc, "Total returned", tx, ty, 120, 9, true);
  drawLine(
    doc,
    money(ret.total),
    tx + 120,
    ty,
    100,
    9,
    true,
    "right",
  );
  ty += 18;
  y = Math.max(ny, ty) + 10;

  ensure(70);
  y += 18;
  drawLine(
    doc,
    "Goods received by (clinic)",
    left,
    y,
    half,
    8,
  );
  drawLine(
    doc,
    "Customer / representative",
    left + half + 28,
    y,
    half,
    8,
  );
  y += 28;
  rule(doc, left, y, half - 20);
  rule(doc, left + half + 28, y, half - 20);
  y += 6;
  drawLine(doc, "Name, signature and date", left, y, half, small);
  drawLine(
    doc,
    "Name, signature and date",
    left + half + 28,
    y,
    half,
    small,
  );

  const pages = doc.bufferedPageRange();
  for (let index = pages.start; index < pages.start + pages.count; index++) {
    doc.switchToPage(index);
    const footerY = doc.page.height - 42;
    rule(doc, left, footerY, width);
    drawLine(
      doc,
      `Record of goods returned against ${inv.number} · Not a tax invoice · Refunds are recorded separately`,
      left,
      footerY + 8,
      width - 70,
      6.5,
    );
    drawLine(
      doc,
      `${index + 1} / ${pages.count}`,
      left + width - 65,
      footerY + 8,
      65,
      6.5,
      false,
      "right",
    );
  }
  doc.end();
}
