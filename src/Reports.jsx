import React, { useState } from "react";
import {
  ChartNoAxesCombined,
  Download,
  IndianRupee,
  ReceiptText,
  Wallet,
  Truck,
  FileSpreadsheet,
  Package,
  CalendarDays,
  ShieldCheck,
  ArrowUpRight,
} from "lucide-react";
import {
  useDesk,
  Button,
  PageHeader,
  Panel,
  EmptyState,
  Table,
  Money,
  Badge,
  Segments,
  StatCard,
  InvoiceBadge,
  Notice,
  Field,
  localDownload,
  fmtDate,
} from "./ui.jsx";
import { money, today } from "../shared.js";
export default function Reports() {
  const { state, open, toast } = useDesk(),
    [tab, setTab] = useState("sales"),
    [from, setFrom] = useState(today().slice(0, 7) + "-01"),
    [to, setTo] = useState(today()),
    [preset, setPreset] = useState("month");
  const inRange = (date) => date >= from && date <= to;
  const invoices = state.invoices.filter(
    (i) => i.status !== "draft" && inRange(i.date),
  );
  const credits = state.credits
    .filter((c) => inRange(c.date))
    .map((c) => ({
      ...c,
      invoice: state.invoices.find((i) => i.id === c.invoice_id),
    }));
  const payments = state.payments.filter(
    (p) => p.invoice_id && inRange(p.date),
  );
  const purchases = state.purchases.filter((p) => inRange(p.date));
  const netSales =
    invoices.reduce((n, i) => n + i.taxable, 0) -
    credits.reduce((n, c) => n + (c.invoice?.taxable || 0), 0);
  const tax =
    invoices.reduce((n, i) => n + i.tax, 0) -
    credits.reduce((n, c) => n + (c.invoice?.tax || 0), 0);
  const collections = payments.reduce(
    (n, p) => n + (p.direction === "refund" ? -p.amount : p.amount),
    0,
  );
  const allLines = [
    ...invoices.flatMap((i) => i.lines.map((l) => ({ ...l, sign: 1 }))),
    ...credits.flatMap((c) =>
      (c.invoice?.lines || []).map((l) => ({ ...l, sign: -1 })),
    ),
  ];
  const itemMap = {},
    hsnMap = {};
  for (const l of allLines) {
    if (!itemMap[l.product_id])
      itemMap[l.product_id] = {
        name: l.name,
        hsn: l.hsn,
        qty: 0,
        supply: 0,
        tax: 0,
        total: 0,
      };
    const item = itemMap[l.product_id];
    item.qty += l.qty * l.sign;
    item.supply += l.taxable * l.sign;
    item.tax += l.tax * l.sign;
    item.total += l.total * l.sign;
    const key = `${l.hsn}:${l.gst_rate}:${l.tax_treatment}`;
    if (!hsnMap[key])
      hsnMap[key] = {
        hsn: l.hsn,
        rate: l.gst_rate,
        treatment: l.tax_treatment,
        supply: 0,
        cgst: 0,
        sgst: 0,
        igst: 0,
        tax: 0,
      };
    const h = hsnMap[key];
    h.supply += l.taxable * l.sign;
    for (const f of ["cgst", "sgst", "igst", "tax"]) h[f] += l[f] * l.sign;
  }
  const items = Object.values(itemMap).sort((a, b) => b.total - a.total),
    hsns = Object.values(hsnMap).sort((a, b) => a.hsn.localeCompare(b.hsn));
  const register = [
    ...invoices.map((i) => ({
      id: i.id,
      number: i.number,
      date: i.date,
      name: i.customer.name || "Walk-in client",
      type: i.document_type,
      supply: i.taxable,
      tax: i.tax,
      total: i.total,
      credit: false,
    })),
    ...credits.map((c) => ({
      id: c.invoice_id,
      number: c.number,
      date: c.date,
      name: c.invoice?.customer.name || "Walk-in client",
      type: "Credit Note",
      supply: -(c.invoice?.taxable || 0),
      tax: -(c.invoice?.tax || 0),
      total: -c.total,
      credit: true,
    })),
  ].sort((a, b) => b.date.localeCompare(a.date));
  const exportReport = () => {
    if (!state.settings) {
      open("setup");
      return;
    }
    let rows;
    if (tab === "sales")
      rows = [
        ["Date", "Document", "Type", "Client", "Supply value", "GST", "Total"],
        ...register.map((r) => [
          r.date,
          r.number,
          r.type,
          r.name,
          r.supply / 100,
          r.tax / 100,
          r.total / 100,
        ]),
      ];
    if (tab === "items")
      rows = [
        [
          "Item",
          "HSN/SAC",
          "Net qty",
          "Net supply value",
          "Net GST",
          "Net total",
        ],
        ...items.map((i) => [
          i.name,
          i.hsn,
          i.qty,
          i.supply / 100,
          i.tax / 100,
          i.total / 100,
        ]),
      ];
    if (tab === "gst")
      rows = [
        [
          "HSN/SAC",
          "Treatment",
          "GST rate",
          "Supply value",
          "CGST",
          "SGST/UTGST",
          "IGST",
          "Total GST",
        ],
        ...hsns.map((h) => [
          h.hsn,
          h.treatment,
          h.rate,
          h.supply / 100,
          h.cgst / 100,
          h.sgst / 100,
          h.igst / 100,
          h.tax / 100,
        ]),
      ];
    if (tab === "payments")
      rows = [
        ["Date", "Invoice", "Client", "Type", "Method", "Reference", "Amount"],
        ...payments.map((p) => {
          const i = state.invoices.find((i) => i.id === p.invoice_id);
          return [
            p.date,
            i?.number,
            i?.customer.name || "Walk-in",
            p.direction,
            p.method,
            p.reference,
            (p.direction === "refund" ? -p.amount : p.amount) / 100,
          ];
        }),
      ];
    const csv =
      "\uFEFF" +
      rows
        .map((row) =>
          row
            .map(
              (v) =>
                '"' +
                String(
                  typeof v === "string" && /^[=+\-@\t\r]/.test(v)
                    ? "'" + v
                    : (v ?? ""),
                ).replaceAll('"', '""') +
                '"',
            )
            .join(","),
        )
        .join("\r\n");
    localDownload(csv, `shop-desk-${tab}-${from}-to-${to}.csv`);
    toast("Report downloaded.");
  };
  function changePreset(value) {
    setPreset(value);
    setTo(today());
    const d = new Date(today() + "T12:00:00Z");
    if (value === "month") setFrom(today().slice(0, 7) + "-01");
    if (value === "week") {
      d.setUTCDate(d.getUTCDate() - 6);
      setFrom(d.toISOString().slice(0, 10));
    }
    if (value === "year") {
      const y = d.getUTCFullYear() - (d.getUTCMonth() < 3 ? 1 : 0);
      setFrom(y + "-04-01");
    }
    if (value === "all")
      setFrom(
        [
          ...state.invoices.map((i) => i.date),
          ...state.credits.map((c) => c.date),
          ...state.payments.map((p) => p.date),
          ...state.purchases.map((p) => p.date),
          today(),
        ].sort()[0],
      );
  }
  return (
    <>
      <PageHeader
        title="Reports"
        description="A clear picture of your clinic. No spreadsheets to untangle."
        actions={
          <Button variant="secondary" icon={Download} onClick={exportReport}>
            Export report
          </Button>
        }
      />
      <div className="report-date-bar">
        <div>
          <CalendarDays size={18} />
          <strong>Reporting period</strong>
        </div>
        <select
          aria-label="Report period"
          value={preset}
          onChange={(e) => changePreset(e.target.value)}
        >
          <option value="month">This month</option>
          <option value="week">Last 7 days</option>
          <option value="year">This financial year</option>
          <option value="all">All time</option>
          <option value="custom">Custom dates</option>
        </select>
        <label>
          <span>From</span>
          <input
            aria-label="Report start date"
            type="date"
            value={from}
            max={to}
            onChange={(e) => {
              setFrom(e.target.value);
              setPreset("custom");
            }}
          />
        </label>
        <span className="date-range-dash">—</span>
        <label>
          <span>To</span>
          <input
            aria-label="Report end date"
            type="date"
            value={to}
            min={from}
            max={today()}
            onChange={(e) => {
              setTo(e.target.value);
              setPreset("custom");
            }}
          />
        </label>
      </div>
      <div className="stats-grid">
        <StatCard
          title="Net sales"
          value={money(netSales)}
          note="Supply value less credits · excl. GST"
          icon={IndianRupee}
        />
        <StatCard
          title="Output GST"
          value={money(tax)}
          note="Net of credit notes · before input credit"
          icon={ReceiptText}
          tone="blue"
        />
        <StatCard
          title="Net collections"
          value={money(collections)}
          note="Customer receipts less refunds"
          icon={Wallet}
          tone="purple"
        />
        <StatCard
          title="Purchases"
          value={money(purchases.reduce((n, p) => n + p.total, 0))}
          note={`${purchases.length} supplier bills · including GST`}
          icon={Truck}
          tone="amber"
        />
      </div>
      <Panel className="report-panel">
        <div className="list-toolbar">
          <Segments
            value={tab}
            onChange={setTab}
            options={[
              { value: "sales", label: "Sales register" },
              { value: "items", label: "Item performance" },
              { value: "gst", label: "GST summary" },
              { value: "payments", label: "Payments" },
            ]}
          />
          <span className="tiny muted">
            {preset === "all" ? "All time" : fmtDate(from)} – {fmtDate(to)}
          </span>
        </div>
        {tab === "sales" && (
          <Table
            head={[
              "DOCUMENT",
              "DATE",
              "CLIENT",
              "SUPPLY VALUE",
              "GST",
              "TOTAL",
            ]}
            empty={
              !register.length && (
                <ReportEmpty title="Your sales story will take shape here" />
              )
            }
          >
            {register.map((r) => (
              <tr
                key={r.number}
                className="clickable"
                onClick={() => open("invoiceView", { id: r.id })}
              >
                <td>
                  <strong className="table-primary">{r.number}</strong>
                  <span className="table-secondary">{r.type}</span>
                </td>
                <td>{fmtDate(r.date)}</td>
                <td>{r.name}</td>
                <td>
                  <Money value={r.supply} />
                </td>
                <td>
                  <Money value={r.tax} />
                </td>
                <td>
                  <Money
                    value={r.total}
                    className={r.credit ? "text-amber" : ""}
                  />
                </td>
              </tr>
            ))}
          </Table>
        )}
        {tab === "items" && (
          <Table
            head={[
              "ITEM",
              "HSN / SAC",
              "NET QUANTITY",
              "SUPPLY VALUE",
              "GST",
              "TOTAL",
            ]}
            empty={
              !items.length && (
                <ReportEmpty title="Know what keeps your clinic moving" />
              )
            }
          >
            {items.map((i) => (
              <tr key={i.name + i.hsn}>
                <td>
                  <strong className="table-primary">{i.name}</strong>
                </td>
                <td>
                  <code>{i.hsn}</code>
                </td>
                <td>{Math.round(i.qty * 1000) / 1000}</td>
                <td>
                  <Money value={i.supply} />
                </td>
                <td>
                  <Money value={i.tax} />
                </td>
                <td>
                  <Money value={i.total} />
                </td>
              </tr>
            ))}
          </Table>
        )}
        {tab === "gst" && (
          <>
            <div className="report-tax-note">
              Supply-date register with credit notes on their issue dates.
              Exempt, nil-rated and non-GST supplies are shown separately. This
              is not a GST filing or ITC eligibility report.
            </div>
            <Table
              head={[
                "HSN / SAC",
                "TREATMENT",
                "GST RATE",
                "SUPPLY VALUE",
                "CGST",
                "SGST / UTGST",
                "IGST",
              ]}
              empty={
                !hsns.length && (
                  <ReportEmpty title="A little more clarity at tax time" />
                )
              }
            >
              {hsns.map((h, i) => (
                <tr key={i}>
                  <td>
                    <code>{h.hsn}</code>
                  </td>
                  <td>
                    <Badge>
                      {h.treatment === "non_gst" ? "Non-GST" : h.treatment}
                    </Badge>
                  </td>
                  <td>{h.rate}%</td>
                  <td>
                    <Money value={h.supply} />
                  </td>
                  <td>
                    <Money value={h.cgst} />
                  </td>
                  <td>
                    <Money value={h.sgst} />
                  </td>
                  <td>
                    <Money value={h.igst} />
                  </td>
                </tr>
              ))}
            </Table>
          </>
        )}
        {tab === "payments" && (
          <Table
            head={["DATE", "INVOICE", "TYPE", "METHOD", "REFERENCE", "AMOUNT"]}
            empty={
              !payments.length && (
                <ReportEmpty title="Every payment, accounted for" />
              )
            }
          >
            {payments.map((p) => (
              <tr key={p.id}>
                <td>{fmtDate(p.date)}</td>
                <td>
                  {state.invoices.find((i) => i.id === p.invoice_id)?.number}
                </td>
                <td>
                  <Badge tone={p.direction === "refund" ? "amber" : "green"}>
                    {p.direction === "refund" ? "Refund" : "Receipt"}
                  </Badge>
                </td>
                <td>{p.method}</td>
                <td>{p.reference || "—"}</td>
                <td>
                  <Money
                    value={p.direction === "refund" ? -p.amount : p.amount}
                  />
                </td>
              </tr>
            ))}
          </Table>
        )}
        <div className="table-footer">
          <span>All amounts in INR · Drafts are excluded</span>
          <span>
            <ShieldCheck size={13} /> Based only on your saved records
          </span>
        </div>
      </Panel>
      <div className="report-notes">
        <div>
          <FileSpreadsheet size={20} />
          <div>
            <h3>Your numbers, ready to share.</h3>
            <p>
              Export the selected register as CSV for your accountant. Prices
              and taxes are saved as paise for consistent rounding.
            </p>
          </div>
        </div>
        <div>
          <Package size={20} />
          <div>
            <h3>Inventory is a point-in-time value.</h3>
            <p>
              See current stock value on Overview. It uses batch purchase costs
              and includes expired stock until you write it off.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
function ReportEmpty({ title }) {
  return (
    <EmptyState
      icon={ChartNoAxesCombined}
      title={title}
      description="Issue invoices or record payments in this period to see your own figures. There’s no sample data here."
    />
  );
}
