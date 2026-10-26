import React, { useEffect, useMemo, useState } from "react";
import {
  Plus,
  Undo2,
  ArrowUpRight,
  Printer,
  Download,
  Package,
  PackageX,
  ReceiptText,
  Wallet,
  ShieldCheck,
  ArrowRight,
  Info,
} from "lucide-react";
import {
  useDesk,
  api,
  download,
  Button,
  IconButton,
  PageHeader,
  Panel,
  EmptyState,
  Table,
  Money,
  Badge,
  SearchBox,
  SearchSelect,
  Segments,
  Field,
  Dialog,
  ErrorBox,
  Notice,
  StatCard,
  ExportButton,
  useForm,
  fmtDate,
  matches,
} from "./ui.jsx";
import {
  money,
  quantity,
  today,
  returnLineAmounts,
  RETURN_CONDITIONS,
  RETURN_CONDITION_LABELS,
} from "../shared.js";
import { renderReturnHTML } from "../printing.js";

const returnable = (invoice) =>
  invoice.status === "issued" && !invoice.fully_returned;

export function Returns() {
  const { state, open } = useDesk(),
    [q, setQ] = useState(""),
    [tab, setTab] = useState("all");
  const month = today().slice(0, 7);
  const rows = state.returns.filter((ret) => {
    const invoice = state.invoices.find((i) => i.id === ret.invoice_id);
    const text = matches(
      q,
      ret.number,
      ret.invoice_number,
      ret.client_name,
      ret.reason,
      ...(ret.lines || []).map((line) => line.name),
    );
    const matchesTab =
      tab === "all" ||
      (tab === "refund" && (invoice?.refund_due || 0) > 0) ||
      (tab === "restocked" && ret.restocked_qty > 0) ||
      (tab === "month" && ret.date.slice(0, 7) === month);
    return text && matchesTab;
  });
  const refundDue = state.invoices
    .filter((i) => i.returned_count > 0)
    .reduce((n, i) => n + i.refund_due, 0);
  const returnedValue = state.returns.reduce((n, ret) => n + ret.total, 0);
  const restocked = state.returns.reduce((n, ret) => n + ret.restocked_qty, 0);
  return (
    <>
      <PageHeader
        title="Customer returns"
        description="Take items back without losing the paper trail. Stock and refunds stay separate and clear."
        actions={
          <>
            <ExportButton type="returns" />
            <Button
              icon={Plus}
              onClick={() => open("return")}
              disabled={!state.invoices.some(returnable)}
            >
              Record a return
            </Button>
          </>
        }
      />
      <div className="stats-grid return-stats">
        <StatCard
          title="Returned value"
          value={money(returnedValue)}
          note={`${state.returns.length} ${state.returns.length === 1 ? "return note" : "return notes"} · all time`}
          icon={Undo2}
          tone="purple"
        />
        <StatCard
          title="Refund due"
          value={money(refundDue)}
          note="Paid by the customer, but no longer owed for goods kept"
          icon={Wallet}
          tone="amber"
        />
        <StatCard
          title="Returned to stock"
          value={String(restocked)}
          note="Units put back into their original batches"
          icon={Package}
          tone="blue"
        />
        <StatCard
          title="Not restocked"
          value={String(
            quantity(
              state.returns.reduce(
                (n, ret) =>
                  n +
                  ret.lines
                    .filter(
                      (line) =>
                        line.type !== "service" &&
                        line.condition !== "resellable",
                    )
                    .reduce((sum, line) => sum + line.qty, 0),
                0,
              ),
            ),
          )}
          note="Damaged and expired units kept out of stock"
          icon={PackageX}
          tone="amber"
        />
      </div>
      <Panel>
        <div className="list-toolbar">
          <Segments
            options={[
              { value: "all", label: "All returns", count: state.returns.length },
              { value: "refund", label: "Refund due" },
              { value: "restocked", label: "Restocked" },
              { value: "month", label: "This month" },
            ]}
            value={tab}
            onChange={setTab}
          />
        </div>
        <div className="filter-toolbar">
          <SearchBox
            value={q}
            onChange={setQ}
            placeholder="Search return number, invoice, client, item, or reason…"
          />
          <span className="tiny muted">
            {rows.length} {rows.length === 1 ? "return" : "returns"}
          </span>
        </div>
        <Table
          head={[
            "RETURN",
            "INVOICE / CLIENT",
            "DATE",
            "ITEMS",
            "RETURN VALUE",
            "STOCK",
            "REFUND",
            "",
          ]}
          empty={
            !rows.length && (
              <EmptyState
                icon={Undo2}
                title={
                  q || tab !== "all"
                    ? "No returns to show here"
                    : "Nothing came back yet."
                }
                description={
                  q || tab !== "all"
                    ? "Try another search or switch to All returns."
                    : "When a customer returns medicine, food, or an accessory, record it here. You choose whether resellable stock goes back to its original batch."
                }
                action={
                  !q &&
                  tab === "all" &&
                  state.invoices.some(returnable) && (
                    <Button icon={Plus} onClick={() => open("return")}>
                      Record your first return
                    </Button>
                  )
                }
              />
            )
          }
        >
          {rows.map((ret) => {
            const invoice = state.invoices.find(
              (i) => i.id === ret.invoice_id,
            );
            const units = ret.lines.reduce((n, line) => n + line.qty, 0);
            const refund = invoice?.refund_due || 0;
            return (
              <tr
                key={ret.id}
                className="clickable"
                onClick={() => open("returnView", { id: ret.id })}
              >
                <td>
                  <strong className="table-primary invoice-number">
                    {ret.number}
                  </strong>
                  <span className="table-secondary">{ret.reason}</span>
                </td>
                <td>
                  <strong className="table-primary">
                    {ret.invoice_number || "Invoice"}
                  </strong>
                  <span className="table-secondary">
                    {ret.client_name || "Walk-in client"}
                  </span>
                </td>
                <td>{fmtDate(ret.date)}</td>
                <td>
                  {units} {units === 1 ? "unit" : "units"}
                  <span className="table-secondary">{ret.lines.length} lines</span>
                </td>
                <td>
                  <Money value={ret.total} />
                </td>
                <td>
                  {ret.restocked_qty > 0 ? (
                    <>
                      <span className="text-green">
                        {ret.restocked_qty} restocked
                      </span>
                      <span className="table-secondary">Original batch</span>
                    </>
                  ) : (
                    <span className="muted">Not restocked</span>
                  )}
                </td>
                <td>
                  {refund > 0 ? (
                    <>
                      <Money className="text-amber" value={refund} />
                      <span className="table-secondary">Refund due</span>
                    </>
                  ) : (
                    <span className="muted">—</span>
                  )}
                </td>
                <td>
                  <IconButton
                    icon={ArrowUpRight}
                    label={"View " + ret.number}
                    onClick={(event) => {
                      event.stopPropagation();
                      open("returnView", { id: ret.id });
                    }}
                  />
                </td>
              </tr>
            );
          })}
        </Table>
        <div className="table-footer">
          <span>
            Returns only record goods received. Money is refunded separately
            after it is actually paid.
          </span>
          <span>
            <ShieldCheck size={13} /> Issued invoices keep their original figures
          </span>
        </div>
      </Panel>
      <div className="inline-tip">
        <Info size={16} />
        <span>
          A return is not a credit note. Partial returns reduce what the customer
          owes; any excess already paid becomes a refund due on the invoice.
        </span>
      </div>
    </>
  );
}

export function ReturnForm({ invoiceId }) {
  const { state, close, refresh, toast } = useDesk(),
    [selectedId, setSelectedId] = useState(invoiceId || ""),
    [form, setForm, field] = useForm({ date: today(), reason: "", notes: "" }),
    [qtys, setQtys] = useState({}),
    [conditions, setConditions] = useState({}),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const invoice = state.invoices.find((i) => i.id === selectedId);
  useEffect(() => {
    setQtys({});
    setConditions({});
    setError("");
    if (invoice && form.date < invoice.date) setForm((f) => ({ ...f, date: invoice.date }));
  }, [selectedId]);
  const options = state.invoices
    .filter(returnable)
    .map((i) => ({
      ...i,
      name: `${i.number} · ${i.customer.name || "Walk-in client"}`,
      sku: i.customer.name || "",
      barcode: i.pet.name || "",
    }));
  const lines = invoice
    ? invoice.lines.map((line, index) => {
        const already = quantity(invoice.returned_by_line?.[index] || 0);
        const remaining = quantity(line.qty - already);
        const typed = Math.min(
          Math.max(0, Number(qtys[index] || 0)),
          Math.max(0, remaining),
        );
        const condition =
          line.type === "service" ? "service" : conditions[index] || "resellable";
        return {
          ...line,
          index,
          sold: quantity(line.qty),
          already,
          remaining,
          entered: qtys[index] ?? "",
          qty: typed,
          condition,
          amounts: returnLineAmounts(line, already, typed),
          expiredBatch: (line.batches || []).some(
            (batch) => batch.expiry && batch.expiry < today(),
          ),
        };
      })
    : [];
  const chosen = lines.filter((line) => line.qty > 0);
  const value = chosen.reduce((n, line) => n + line.amounts.total, 0);
  const tax = chosen.reduce((n, line) => n + line.amounts.tax, 0);
  const restockUnits = chosen
    .filter((line) => line.type !== "service" && line.condition === "resellable")
    .reduce((n, line) => n + line.qty, 0);
  const withheldUnits = chosen
    .filter((line) => line.type !== "service" && line.condition !== "resellable")
    .reduce((n, line) => n + line.qty, 0);
  const refundAfter = invoice
    ? Math.max(
        0,
        invoice.paid - (invoice.total - invoice.returned_total - value),
      )
    : 0;
  const submit = async (event) => {
    event.preventDefault();
    if (!invoice || !chosen.length) {
      setError("Choose at least one item and a quantity to return.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await api("/returns", {
        method: "POST",
        body: {
          invoice_id: invoice.id,
          date: form.date,
          reason: form.reason,
          notes: form.notes,
          lines: chosen.map((line) => ({
            line_index: line.index,
            qty: line.qty,
            condition: line.type === "service" ? "service" : line.condition,
          })),
        },
      });
      await refresh();
      close();
      toast(
        `Return recorded.${restockUnits ? ` ${restockUnits} unit(s) returned to stock.` : ""}`,
      );
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      title="Record a customer return"
      subtitle="Take back part or all of an issued invoice. Nothing is refunded until you record it."
      wide
      busy={busy}
      footer={
        <>
          <Button variant="secondary" onClick={close}>
            Cancel
          </Button>
          <Button
            loading={busy}
            type="submit"
            form="return-form"
            icon={Undo2}
            disabled={!invoice || !chosen.length}
          >
            Record return
          </Button>
        </>
      }
    >
      <form id="return-form" onSubmit={submit}>
        {!selectedId || !invoice ? (
          <Field
            label="Original invoice"
            required
            hint="Only issued invoices with items still returnable are listed."
          >
            <SearchSelect
              items={options}
              placeholder="Search invoice number, client, or patient…"
              renderItem={(item) => (
                <span className="return-invoice-option">
                  <span>
                    <strong>{item.number}</strong>
                    <small>
                      {item.customer.name || "Walk-in client"}
                      {item.pet.name ? ` · ${item.pet.name}` : ""}
                    </small>
                  </span>
                  <span>
                    {fmtDate(item.date)}
                    <small>{money(item.total)}</small>
                  </span>
                </span>
              )}
              onPick={(item) => setSelectedId(item.id)}
            />
          </Field>
        ) : (
          <div className="return-invoice-summary">
            <div>
              <span className="eyebrow">ORIGINAL INVOICE</span>
              <strong>{invoice.number}</strong>
              <span>
                {invoice.customer.name || "Walk-in client"}
                {invoice.pet.name ? ` · ${invoice.pet.name}` : ""} ·{" "}
                {fmtDate(invoice.date)}
              </span>
            </div>
            <div>
              <span>Invoice total</span>
              <strong>{money(invoice.total)}</strong>
              <span>
                {invoice.returned_total > 0
                  ? `${money(invoice.returned_total)} already returned`
                  : "No returns recorded"}
              </span>
            </div>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setSelectedId("")}
            >
              Change invoice
            </Button>
          </div>
        )}
        {invoice && (
          <>
            <div className="form-grid return-form-head">
              <Field label="Return date" required>
                <input
                  type="date"
                  {...field("date")}
                  min={invoice.date}
                  max={today()}
                  required
                />
              </Field>
              <Field
                label="Reason"
                required
                hint="Saved on the return note and in stock history."
              >
                <input
                  {...field("reason")}
                  required
                  maxLength={1000}
                  placeholder="Why are these items coming back?"
                />
              </Field>
              <Field label="Internal notes" className="span-2">
                <textarea
                  {...field("notes")}
                  rows={2}
                  maxLength={1000}
                  placeholder="Optional"
                />
              </Field>
            </div>
            <div className="return-lines-heading">
              <h3>Choose items and condition</h3>
              <span>
                {invoice.returned_qty > 0
                  ? `${invoice.returned_qty} unit(s) already returned`
                  : "Nothing returned yet"}
              </span>
            </div>
            <div className="table-scroll return-lines">
              <table className="return-lines-table">
                <thead>
                  <tr>
                    <th>ITEM</th>
                    <th>SOLD</th>
                    <th>ALREADY RETURNED</th>
                    <th>RETURN QTY</th>
                    <th>CONDITION</th>
                    <th className="num">VALUE</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line) => (
                    <tr
                      key={line.index}
                      className={
                        line.remaining <= 0
                          ? "return-line-complete"
                          : line.qty > 0
                            ? "return-line-active"
                            : ""
                      }
                    >
                      <td>
                        <strong>{line.name}</strong>
                        <span className="table-secondary">
                          {line.hsn} · {line.unit} · {money(line.rate)} rate
                        </span>
                        {line.expiredBatch &&
                          line.condition === "resellable" &&
                          line.type !== "service" && (
                            <span className="table-secondary text-amber">
                              Original batch has expired. Restocked units will
                              show as expired stock.
                            </span>
                          )}
                      </td>
                      <td>{line.sold}</td>
                      <td>{line.already}</td>
                      <td>
                        {line.remaining > 0 ? (
                          <input
                            type="number"
                            aria-label={`Return quantity for ${line.name}`}
                            min="0"
                            max={line.remaining}
                            step="0.001"
                            value={line.entered}
                            placeholder={`0 / ${line.remaining}`}
                            onChange={(event) =>
                              setQtys((current) => ({
                                ...current,
                                [line.index]: event.target.value,
                              }))
                            }
                          />
                        ) : (
                          <Badge tone="purple">Returned</Badge>
                        )}
                      </td>
                      <td>
                        {line.type === "service" ? (
                          <span className="muted tiny">
                            Service · no stock
                          </span>
                        ) : line.remaining > 0 ? (
                          <select
                            aria-label={`Condition for ${line.name}`}
                            value={line.condition}
                            onChange={(event) =>
                              setConditions((current) => ({
                                ...current,
                                [line.index]: event.target.value,
                              }))
                            }
                          >
                            {RETURN_CONDITIONS.map((choice) => (
                              <option
                                key={choice.value}
                                value={choice.value}
                              >
                                {choice.label}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="muted tiny">—</span>
                        )}
                      </td>
                      <td className="num">
                        <Money value={line.amounts.total} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {chosen.length > 0 && (
              <div className="return-preview">
                <div>
                  <span>Return value</span>
                  <strong>{money(value)}</strong>
                  <small>GST included: {money(tax)}</small>
                </div>
                <div>
                  <span>Back to stock</span>
                  <strong>{restockUnits}</strong>
                  <small>
                    {withheldUnits
                      ? `${withheldUnits} unit(s) not restocked`
                      : "All selected units resellable"}
                  </small>
                </div>
                <div>
                  <span>Refund due after this return</span>
                  <strong>{money(refundAfter)}</strong>
                  <small>
                    {refundAfter > 0
                      ? "Record the refund separately once paid"
                      : "No excess payment on this invoice"}
                  </small>
                </div>
              </div>
            )}
            <Notice>
              Resellable items go back to the exact batches they were sold from.
              Damaged or expired items are recorded but never go back into
              stock. A return changes the invoice balance, not the money in your
              till.
            </Notice>
          </>
        )}
        <ErrorBox>{error}</ErrorBox>
      </form>
    </Dialog>
  );
}

function ReturnPreview({ ret, invoice }) {
  const [height, setHeight] = useState(500);
  const html = useMemo(
    () => renderReturnHTML(ret, invoice),
    [ret, invoice],
  );
  return (
    <div className="invoice-paper document-preview a4-preview">
      <iframe
        title="Return note preview"
        className="document-preview-frame"
        sandbox="allow-same-origin"
        srcDoc={html}
        style={{ height }}
        onLoad={(event) => {
          const document = event.currentTarget.contentDocument;
          if (document)
            setHeight(
              Math.max(
                260,
                (document.querySelector("article")?.getBoundingClientRect()
                  .height || 260) + 32,
              ),
            );
        }}
      />
    </div>
  );
}

export function ReturnView({ id }) {
  const { state, open, close, toast } = useDesk(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const ret = state.returns.find((entry) => entry.id === id);
  const invoice = ret
    ? state.invoices.find((entry) => entry.id === ret.invoice_id)
    : null;
  if (!ret || !invoice) return null;
  const units = ret.lines.reduce((n, line) => n + line.qty, 0);
  const print = () => {
    const popup = window.open("", "_blank");
    if (!popup) {
      toast("Allow pop-ups to open the print view, or download the PDF.", "error");
      return;
    }
    popup.opener = null;
    popup.document.open();
    popup.document.write(renderReturnHTML(ret, invoice, { controls: true }));
    popup.document.close();
    const go = () => {
      popup.focus();
      popup.print();
    };
    popup.document
      .getElementById("print-document")
      ?.addEventListener("click", go);
    window.setTimeout(go, 250);
  };
  const downloadPDF = async () => {
    setBusy(true);
    setError("");
    try {
      await download("/returns/" + ret.id + "/pdf");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      title={ret.number}
      subtitle={`Return note · ${fmtDate(ret.date)} · against ${invoice.number}`}
      xwide
      className="invoice-view-dialog"
      footer={
        <>
          <div className="invoice-footer-status">
            <Badge tone="purple">Return note</Badge>
            <span>
              Returned value <Money value={ret.total} />
            </span>
            {invoice.refund_due > 0 && (
              <span>
                Refund due <Money value={invoice.refund_due} />
              </span>
            )}
          </div>
          <Button variant="secondary" onClick={close}>
            Close
          </Button>
          <Button variant="secondary" icon={Printer} onClick={print}>
            Print
          </Button>
          <Button
            variant="secondary"
            icon={Download}
            loading={busy}
            onClick={downloadPDF}
          >
            Download PDF
          </Button>
          {invoice.refund_due > 0 && (
            <Button
              icon={Wallet}
              onClick={() => open("payment", { id: invoice.id, refund: true })}
            >
              Record refund
            </Button>
          )}
        </>
      }
    >
      <div className="document-actions">
        <div>
          <Badge tone="purple">
            {invoice.fully_returned ? "Invoice fully returned" : "Part returned"}
          </Badge>
          <button
            className="text-button muted"
            onClick={() => open("invoiceView", { id: invoice.id })}
          >
            <ReceiptText size={14} />
            Open original invoice
          </button>
        </div>
        <div>
          <span className="tiny muted">
            {units} unit(s) · {ret.restocked_qty} restocked
          </span>
        </div>
      </div>
      <div className="return-facts">
        <div>
          <span>Reason</span>
          <strong>{ret.reason}</strong>
        </div>
        <div>
          <span>Client</span>
          <strong>{invoice.customer.name || "Walk-in client"}</strong>
          {invoice.pet.name && <small>{invoice.pet.name}</small>}
        </div>
        <div>
          <span>Refund due on invoice</span>
          <strong>{money(invoice.refund_due)}</strong>
          <small>
            {invoice.refund_due > 0
              ? "Record the refund after paying it"
              : "Nothing refundable right now"}
          </small>
        </div>
        <div>
          <span>Invoice balance</span>
          <strong>{money(invoice.balance)}</strong>
          <small>
            Net of {money(invoice.returned_total)} returned so far
          </small>
        </div>
      </div>
      <div className="payment-history-heading">
        <h3>Returned items</h3>
        <span>{ret.lines.length} lines</span>
      </div>
      <Table
        head={["ITEM", "CONDITION", "QTY", "TAXABLE", "GST", "RETURN VALUE"]}
      >
        {ret.lines.map((line) => (
          <tr key={line.id}>
            <td>
              <strong className="table-primary">{line.name}</strong>
              <span className="table-secondary">
                {line.hsn} · {line.unit}
              </span>
            </td>
            <td>
              <Badge
                tone={
                  line.condition === "resellable"
                    ? "green"
                    : line.condition === "service"
                      ? "neutral"
                      : "amber"
                }
              >
                {RETURN_CONDITION_LABELS[line.condition] || line.condition}
              </Badge>
            </td>
            <td>
              {line.qty} {line.unit}
            </td>
            <td>
              <Money value={line.taxable} />
            </td>
            <td>
              <Money value={line.tax} />
            </td>
            <td>
              <Money value={line.total} />
            </td>
          </tr>
        ))}
      </Table>
      <div className="return-stock-note">
        <Package size={17} />
        <span>
          {ret.restocked_qty > 0
            ? `${ret.restocked_qty} unit(s) went back to their original batches.`
            : "No units were put back into stock."}{" "}
          {ret.notes ? `Notes: ${ret.notes}` : ""}
        </span>
      </div>
      <Notice tone="warning">
        This return note records goods received. It is not a tax invoice or a
        credit note. Any money refunded is recorded separately in the invoice
        payment history.
      </Notice>
      <ErrorBox>{error}</ErrorBox>
      <ReturnPreview ret={ret} invoice={invoice} />
      <div className="return-invoice-link">
        <Button
          variant="secondary"
          size="sm"
          icon={ArrowRight}
          onClick={() => open("invoiceView", { id: invoice.id })}
        >
          View invoice and payment history
        </Button>
      </div>
    </Dialog>
  );
}
