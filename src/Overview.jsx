import React, { useState, useEffect, useRef } from "react";
import {
  Plus,
  ArrowUpRight,
  ArrowRight,
  IndianRupee,
  Wallet,
  Boxes,
  UsersRound,
  ReceiptText,
  PackagePlus,
  UserRoundPlus,
  ChevronDown,
  CalendarDays,
  ChartNoAxesCombined,
  ShieldCheck,
  Check,
  CheckCircle2,
  Clock3,
  PackageCheck,
  Package,
  Stethoscope,
} from "lucide-react";
import {
  useDesk,
  Button,
  IconButton,
  PageHeader,
  Panel,
  EmptyState,
  Table,
  InvoiceBadge,
  Badge,
  Money,
  StatCard,
  Segments,
  Avatar,
  fmtDate,
} from "./ui.jsx";
import { money, today } from "../shared.js";
export function CareIllustration() {
  return (
    <svg
      className="care-illustration"
      viewBox="0 0 300 160"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="186" cy="81" r="72" fill="#e3ecde" />
      <circle cx="242" cy="30" r="4" fill="#a2b991" />
      <path
        d="M58 134h207"
        stroke="#b6cbb1"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <g transform="rotate(8 160 70)">
        <rect
          x="117"
          y="19"
          width="79"
          height="108"
          rx="9"
          fill="#fbfcf8"
          stroke="#9eb59b"
          strokeWidth="1.5"
        />
        <path
          d="M139 46h34M132 67h48M132 80h32M132 93h44"
          stroke="#bfd0b5"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <circle cx="171" cy="108" r="9" fill="#d7e6cc" />
        <path
          d="m167 108 3 3 5-6"
          stroke="#617e59"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </g>
      <rect
        x="78"
        y="78"
        width="38"
        height="55"
        rx="8"
        fill="#edf3e7"
        stroke="#9eb59b"
        strokeWidth="1.5"
      />
      <rect x="85" y="67" width="24" height="15" rx="4" fill="#a6bf99" />
      <path
        d="M93 99h8m-4-4v8"
        stroke="#78956d"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M211 112c-5-8-5-19-2-24l-1-19 14 8c5-1 8-1 13 1l14-8-1 21c6 11 7 29 1 42h-41c-6-6-10-13-12-20-3-9-14-7-11 2 2 7 8 11 14 12"
        fill="#d0dfc7"
        stroke="#78956d"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M218 94v1m18-1v1m-11 5 3 2 3-2m-3 2v4"
        stroke="#64805d"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      <path
        d="M57 62c18 5 27-4 27-19-15 0-26 7-27 19Zm0 0-8 12"
        stroke="#9ab38d"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        d="M259 101v13m-6-6h12"
        stroke="#91ad84"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <circle cx="106" cy="32" r="3" fill="#bccfaf" />
    </svg>
  );
}
function RevenueChart({ invoices, start, end }) {
  const chartRef = useRef(null);
  const [size, setSize] = useState({ width: 680, height: 186 });
  useEffect(() => {
    // Use the rendered canvas size so axis text stays 12px, including on phones.
    const observer = new ResizeObserver(([entry]) => {
      setSize({
        width: Math.max(240, Math.round(entry.contentRect.width)),
        height: Math.max(130, Math.round(entry.contentRect.height)),
      });
    });
    observer.observe(chartRef.current);
    return () => observer.disconnect();
  }, []);
  const days = [];
  const d = new Date(start + "T12:00:00Z"),
    last = new Date(end + "T12:00:00Z");
  for (let n = 0; d <= last && n < 366; n++, d.setUTCDate(d.getUTCDate() + 1))
    days.push(d.toISOString().slice(0, 10));
  const values = days.map((day) =>
    invoices
      .filter((i) => i.date === day && i.status !== "draft")
      .reduce((n, i) => n + i.total, 0),
  );
  const max = Math.max(...values, 0),
    height = size.height - 32,
    width = size.width;
  const left = Math.max(
    48,
    Math.min(110, money(max).replace(".00", "").length * 7 + 10),
  );
  const usable = width - left - 7;
  const baseline = height - 10;
  const plotHeight = baseline - 16;
  const points = values
    .map(
      (v, i) =>
        `${left + (i * usable) / Math.max(1, values.length - 1)},${baseline - (max ? (v / max) * plotHeight : 0)}`,
    )
    .join(" ");
  const labelIndices = [
    0,
    Math.floor((days.length - 1) / 3),
    Math.floor(((days.length - 1) * 2) / 3),
    days.length - 1,
  ].filter((v, i, a) => a.indexOf(v) === i);
  return (
    <div className="revenue-chart">
      <svg
        ref={chartRef}
        viewBox={`0 0 ${width} ${height + 32}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={max ? "Sales by day" : "No sales recorded for this period"}
      >
        {[0, 1, 2, 3].map((i) => (
          <g key={i}>
            <line
              x1={left}
              x2={width}
              y1={16 + (i * plotHeight) / 3}
              y2={16 + (i * plotHeight) / 3}
              stroke="#e9eeea"
              strokeDasharray="3 4"
            />
            <text
              x="0"
              y={20 + (i * plotHeight) / 3}
              fill="#475569"
              fontSize="12"
              fontFamily="Arial"
            >
              {max
                ? money(Math.round((max * (3 - i)) / 3)).replace(".00", "")
                : i === 3
                  ? "₹0"
                  : "—"}
            </text>
          </g>
        ))}
        {max > 0 && (
          <>
            <polygon
              points={`${left},${baseline} ${points} ${width - 7},${baseline}`}
              fill="#e8f1eb"
            />
            <polyline
              points={points}
              fill="none"
              stroke="#307255"
              strokeWidth="2.2"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          </>
        )}
        {labelIndices.map((i) => (
          <text
            key={i}
            x={left + (i * usable) / Math.max(1, days.length - 1)}
            y={height + 22}
            textAnchor={
              i === 0 ? "start" : i === days.length - 1 ? "end" : "middle"
            }
            fill="#475569"
            fontSize="12"
            fontFamily="Arial"
          >
            {days[i] ? fmtDate(days[i], { year: undefined }) : ""}
          </text>
        ))}
      </svg>
      {!max && (
        <div className="chart-empty">
          <span className="chart-empty-icon">
            <ChartNoAxesCombined size={21} strokeWidth={1.3} />
          </span>
          <strong>A clearer picture, with every invoice.</strong>
          <span>Your sales will appear here as you start billing.</span>
        </div>
      )}
    </div>
  );
}
export default function Overview() {
  const { state, open, navigate, lowStock, expiring, exportBackup } = useDesk(),
    [range, setRange] = useState("month"),
    [watch, setWatch] = useState("low");
  const end = today();
  const start =
    range === "today"
      ? end
      : range === "week"
        ? (() => {
            const d = new Date(end + "T12:00:00Z");
            d.setUTCDate(d.getUTCDate() - 6);
            return d.toISOString().slice(0, 10);
          })()
        : end.slice(0, 7) + "-01";
  const invoices = state.invoices.filter(
      (i) => i.date >= start && i.date <= end,
    ),
    issued = invoices.filter((i) => i.status !== "draft");
  const credits = state.credits.filter((c) => c.date >= start && c.date <= end);
  const sales =
      issued.reduce((n, i) => n + i.total, 0) -
      credits.reduce((n, c) => n + c.total, 0),
    due = state.invoices.reduce((n, i) => n + i.balance, 0),
    inventoryValue = state.products.reduce((n, p) => n + p.stock_value, 0);
  const totalProducts = state.products.filter(
    (p) => p.active && p.type === "product",
  ).length;
  const recent = state.invoices.slice(0, 4),
    watchItems = watch === "low" ? lowStock : expiring;
  return (
    <>
      <PageHeader
        title="Overview"
        description="A little less admin. A little more care."
        actions={
          <>
            <div className="date-pill">
              <CalendarDays size={15} />
              <span>{fmtDate(end)}</span>
            </div>
            <Button icon={Plus} onClick={() => open("invoice")}>
              New invoice
            </Button>
          </>
        }
      />
      <section className="welcome-banner">
        <div className="welcome-content">
          <div className="welcome-kicker">
            <span />
            {state.settings ? "YOUR CLINIC, SIMPLIFIED" : "LET’S MAKE IT YOURS"}
          </div>
          <h2>
            {state.settings
              ? "Everything in its right place."
              : "A fresh start for your clinic."}
          </h2>
          <p>
            {state.settings
              ? "Healthy shelves. Happier billing. More time for the patients who matter."
              : "Your workspace is ready. Add your clinic details and start with a clean slate."}
          </p>
          <Button
            variant="white"
            size="sm"
            onClick={() => (state.settings ? open("invoice") : open("setup"))}
          >
            {state.settings ? "Create an invoice" : "Set up your clinic"}
            <ArrowRight size={14} />
          </Button>
        </div>
        <CareIllustration />
        <span className="banner-corner">
          A little more organised. A lot more calm.
        </span>
      </section>
      <div className="section-toolbar">
        <h2>
          Your clinic at a glance <span>Live overview</span>
        </h2>
        <div className="small-select">
          <select
            aria-label="Overview period"
            value={range}
            onChange={(e) => setRange(e.target.value)}
          >
            <option value="month">This month</option>
            <option value="week">Last 7 days</option>
            <option value="today">Today</option>
          </select>
        </div>
      </div>
      <div className="stats-grid">
        <StatCard
          title="Total sales"
          value={money(sales)}
          note={`${issued.length} ${issued.length === 1 ? "invoice" : "invoices"} ${range === "month" ? "this month" : range === "week" ? "in the last 7 days" : "today"}`}
          icon={IndianRupee}
        />
        <StatCard
          title="Outstanding"
          value={money(due)}
          note={`${state.invoices.filter((i) => i.balance > 0).length} unpaid ${state.invoices.filter((i) => i.balance > 0).length === 1 ? "invoice" : "invoices"} · all time`}
          icon={Wallet}
          tone="amber"
        />
        <StatCard
          title="Inventory value"
          value={money(inventoryValue)}
          note={`${totalProducts} ${totalProducts === 1 ? "product" : "products"} in your inventory`}
          icon={Boxes}
          tone="blue"
        />
        <StatCard
          title="Total clients"
          value={String(state.clients.length)}
          note={`${state.pets.length} ${state.pets.length === 1 ? "patient" : "patients"} in your care`}
          icon={UsersRound}
          tone="purple"
        />
      </div>
      <div className="overview-middle">
        <Panel
          title="Revenue overview"
          description="Your sales, clearly in view."
          action={
            <span className="chart-legend">
              <i />
              Gross sales
            </span>
          }
          className="revenue-panel"
        >
          <div className="chart-total">
            <Money value={issued.reduce((n, i) => n + i.total, 0)} />
            <span>
              {range === "month"
                ? "Month to date"
                : range === "today"
                  ? "Today"
                  : "Last 7 days"}{" "}
              · before credit notes
            </span>
          </div>
          <RevenueChart invoices={invoices} start={start} end={end} />
        </Panel>
        <Panel
          title="A quicker way to…"
          description="The everyday, made easy."
          className="quick-actions-panel"
        >
          <div className="quick-actions">
            {[
              {
                icon: ReceiptText,
                title: "Create an invoice",
                text: "Bill for care, products, or both",
                type: "invoice",
                tone: "green",
              },
              {
                icon: PackagePlus,
                title: "Add an inventory item",
                text: "Keep your shelves in check",
                type: "product",
                tone: "blue",
              },
              {
                icon: UserRoundPlus,
                title: "Add a new client",
                text: "A place for every pet parent",
                type: "client",
                tone: "purple",
              },
            ].map((a) => (
              <button key={a.type} onClick={() => open(a.type)}>
                <span className={"quick-icon " + a.tone}>
                  <a.icon size={19} strokeWidth={1.65} />
                </span>
                <span>
                  <strong>{a.title}</strong>
                  <small>{a.text}</small>
                </span>
                <ArrowUpRight size={16} />
              </button>
            ))}
          </div>
          <button className="backup-nudge" onClick={exportBackup}>
            <ShieldCheck size={17} strokeWidth={1.5} />
            <span>
              Your data, always yours.
              <strong>Download a backup anytime.</strong>
            </span>
            <ArrowUpRight size={14} />
          </button>
        </Panel>
      </div>
      <div className="overview-bottom">
        <Panel
          title="Recent invoices"
          action={
            <button className="text-button" onClick={() => navigate("billing")}>
              View all <ArrowRight size={14} />
            </button>
          }
        >
          <Table
            head={["INVOICE", "CLIENT", "AMOUNT", "STATUS"]}
            empty={
              !recent.length && (
                <EmptyState
                  icon={ReceiptText}
                  title="Your first invoice starts here"
                  description="For a consultation, a prescription, or a little of both."
                  compact
                  action={
                    <Button
                      variant="secondary"
                      size="sm"
                      icon={Plus}
                      onClick={() => open("invoice")}
                    >
                      Create invoice
                    </Button>
                  }
                />
              )
            }
          >
            {recent.map((i) => (
              <tr
                className="clickable"
                key={i.id}
                onClick={() => open("invoiceView", { id: i.id })}
              >
                <td>
                  <strong className="table-primary">
                    {i.number || "Draft invoice"}
                  </strong>
                  <span className="table-secondary">{fmtDate(i.date)}</span>
                </td>
                <td>
                  {i.customer.name || "Walk-in client"}
                  {i.pet.name && (
                    <span className="table-secondary">{i.pet.name}</span>
                  )}
                </td>
                <td>
                  <Money value={i.total} />
                </td>
                <td>
                  <InvoiceBadge invoice={i} />
                </td>
              </tr>
            ))}
          </Table>
        </Panel>
        <Panel
          title="Stock watch"
          action={
            <button
              className="text-button"
              onClick={() => navigate("inventory")}
            >
              Inventory <ArrowUpRight size={14} />
            </button>
          }
          className="stock-watch"
        >
          <div className="stock-tabs">
            <button
              className={watch === "low" ? "active" : ""}
              onClick={() => setWatch("low")}
            >
              Low stock <span>{lowStock.length}</span>
            </button>
            <button
              className={watch === "expiry" ? "active" : ""}
              onClick={() => setWatch("expiry")}
            >
              Expiring soon <span>{expiring.length}</span>
            </button>
          </div>
          {!watchItems.length ? (
            <EmptyState
              icon={PackageCheck}
              title={
                state.products.length
                  ? "Nothing to flag. All good."
                  : "Nothing to flag yet"
              }
              description={
                state.products.length
                  ? "Your stock alerts will appear here when they need your attention."
                  : "Add your inventory to stay ahead of low stock and expiry dates."
              }
              compact
            />
          ) : (
            <div className="stock-watch-list">
              {watchItems.slice(0, 3).map((item) => {
                const p =
                  watch === "low"
                    ? item
                    : state.products.find((p) => p.id === item.product_id);
                return (
                  <button
                    key={item.id}
                    onClick={() =>
                      open("adjust", {
                        id: p.id,
                        batchId: watch === "expiry" ? item.id : undefined,
                      })
                    }
                  >
                    <span className="stock-product-icon">
                      <Package size={17} />
                    </span>
                    <div>
                      <strong>{p.name}</strong>
                      <small>
                        {watch === "low"
                          ? `${p.available} ${p.unit} available`
                          : fmtDate(item.expiry)}
                      </small>
                    </div>
                    <Badge
                      tone={
                        (watch === "low" && p.available === 0) ||
                        item.expiry < today()
                          ? "red"
                          : "amber"
                      }
                    >
                      {watch === "low"
                        ? "Low stock"
                        : item.expiry < today()
                          ? "Expired"
                          : "Expiring"}
                    </Badge>
                  </button>
                );
              })}
            </div>
          )}
        </Panel>
      </div>
      {!state.settings && (
        <div className="getting-started-strip">
          <span className="setup-strip-title">
            A few steps to your first bill
          </span>
          {[
            {
              label: "Set up your clinic",
              done: !!state.settings,
              type: "setup",
            },
            {
              label: "Add your first item",
              done: state.products.length > 0,
              type: "product",
            },
            {
              label: "Create your first invoice",
              done: state.invoices.length > 0,
              type: "invoice",
            },
          ].map((step, i) => (
            <button key={i} onClick={() => open(step.type)}>
              <span className={step.done ? "done" : ""}>
                {step.done ? <Check size={12} /> : i + 1}
              </span>
              {step.label}
              {i < 2 && <ChevronDown className="step-arrow" size={14} />}
            </button>
          ))}
        </div>
      )}
    </>
  );
}
