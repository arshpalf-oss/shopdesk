import React, { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import { Check, Printer, FileText } from "lucide-react";
import { Field, Panel, Toggle, Notice, Button } from "./ui.jsx";
import {
  renderDocumentHTML,
  printPreferences,
  paymentURI,
  INVOICE_TEMPLATES,
} from "../printing.js";

async function qrFor(invoice, options) {
  const uri = paymentURI(invoice, options);
  return uri
    ? QRCode.toDataURL(uri, {
        width: 240,
        margin: 2,
        errorCorrectionLevel: "M",
      }).catch(() => "")
    : "";
}

export function DocumentPreview({
  invoice,
  options = {},
  title = "Document preview",
}) {
  const [qrCode, setQRCode] = useState({ uri: "", data: "" });
  const [height, setHeight] = useState(450);
  const uri = paymentURI(invoice, options);
  const qrData = qrCode.uri === uri ? qrCode.data : "";
  useEffect(() => {
    let cancelled = false;
    qrFor(invoice, options).then((data) => {
      if (!cancelled) setQRCode({ uri, data });
    });
    return () => {
      cancelled = true;
    };
  }, [uri]);
  const html = useMemo(
    () => renderDocumentHTML(invoice, { ...options, qrData }),
    [
      invoice,
      options.format,
      options.width,
      options.template,
      options.settings,
      options.credit,
      options.payments,
      qrData,
    ],
  );
  return (
    <div
      className={
        "invoice-paper document-preview " +
        (options.format === "thermal" ? "thermal-preview" : "a4-preview")
      }
      data-template={
        options.template || printPreferences(options.settings).invoice_template
      }
    >
      <iframe
        title={title}
        className="document-preview-frame"
        sandbox="allow-same-origin"
        srcDoc={html}
        style={{
          height,
          width:
            options.format === "thermal"
              ? `${(Number(options.width || 80) * 96) / 25.4 + 4}px`
              : undefined,
        }}
        onLoad={(event) => {
          const document = event.currentTarget.contentDocument;
          if (document)
            setHeight(
              Math.max(
                180,
                (document.querySelector("article")?.getBoundingClientRect()
                  .height || 180) + 32,
              ),
            );
        }}
      />
    </div>
  );
}

export async function printDocument(invoice, options, toast) {
  // Open synchronously from the click, before QR generation, to avoid popup blocking.
  const popup = window.open("", "_blank");
  if (!popup) {
    toast(
      "Allow pop-ups to open the print view, or download the PDF.",
      "error",
    );
    return;
  }
  popup.opener = null;
  popup.document.write(
    '<!doctype html><html><head><title>Preparing document</title></head><body style="font:14px Arial;padding:24px">Preparing print view…</body></html>',
  );
  popup.document.close();
  try {
    const qrData = await qrFor(invoice, options);
    if (popup.closed) return;
    popup.document.open();
    popup.document.write(
      renderDocumentHTML(invoice, { ...options, qrData, controls: true }),
    );
    popup.document.close();
    const print = () => {
      if (options.format === "thermal") {
        const receipt = popup.document.querySelector(".receipt");
        const width = options.width === "58" ? "58" : "80";
        const height = Math.max(
          50,
          Math.min(
            1000,
            Math.ceil((receipt.getBoundingClientRect().height * 25.4) / 96) + 8,
          ),
        );
        let pageStyle = popup.document.getElementById("thermal-page-size");
        if (!pageStyle) {
          pageStyle = popup.document.createElement("style");
          pageStyle.id = "thermal-page-size";
          popup.document.head.append(pageStyle);
        }
        pageStyle.textContent = `@page{size:${width}mm ${height}mm;margin:3mm}`;
      }
      popup.focus();
      popup.print();
    };
    popup.document
      .getElementById("print-document")
      .addEventListener("click", print);
    await Promise.all(
      [...popup.document.images].map((image) =>
        image.decode?.().catch(() => {}),
      ),
    );
    if (!popup.closed) window.setTimeout(print, 180);
  } catch {
    toast(
      "Could not prepare the print view. Please download the PDF instead.",
      "error",
    );
    popup.close();
  }
}

export function PrintPreferences({ form, setForm, field, state }) {
  const p = printPreferences(form);
  const [previewId, setPreviewId] = useState(state.invoices[0]?.id || "");
  const [showPreview, setShowPreview] = useState(false);
  const preview =
    state.invoices.find((invoice) => invoice.id === previewId) ||
    state.invoices[0];
  const options = {
    settings: p,
    template: p.invoice_template,
    format: p.default_print_format,
    width: p.thermal_width,
    payments: state.payments,
  };
  return (
    <>
      <Panel
        title="Invoice templates"
        description="Professional, monochrome documents. No decorative graphics or app branding."
      >
        <div className="settings-panel-body">
          <fieldset className="template-fieldset">
            <legend>A4 invoice template</legend>
            <div className="template-options">
              {INVOICE_TEMPLATES.map((template) => (
                <label
                  key={template.id}
                  className={
                    "template-option " +
                    (p.invoice_template === template.id ? "selected" : "")
                  }
                >
                  <input
                    type="radio"
                    aria-label={template.name}
                    name="invoice_template"
                    value={template.id}
                    checked={p.invoice_template === template.id}
                    onChange={() =>
                      setForm((current) => ({
                        ...current,
                        invoice_template: template.id,
                      }))
                    }
                  />
                  <span
                    className={"template-thumbnail thumb-" + template.id}
                    aria-hidden="true"
                  >
                    <span className="thumb-heading">
                      <b>INVOICE</b>
                      <i />
                    </span>
                    <span className="thumb-parties">
                      <i />
                      <i />
                    </span>
                    <span className="thumb-table">
                      <i />
                      <i />
                      <i />
                      <i />
                    </span>
                    <span className="thumb-total">
                      <i />
                      <i />
                    </span>
                  </span>
                  <strong>
                    {template.name}
                    {p.invoice_template === template.id && <Check size={14} />}
                  </strong>
                  <span>{template.description}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <Notice>
            Changing a layout can reformat an existing document, but never
            changes its saved clinic details, items, invoice number, tax,
            payments or stock.
          </Notice>
        </div>
      </Panel>
      <Panel
        title="POS & thermal printing"
        description="Compact counter bills using the same invoice and payment records."
      >
        <div className="settings-panel-body">
          <div className="form-grid">
            <Field label="Default print format">
              <select
                aria-label="Default print format"
                {...field("default_print_format")}
              >
                <option value="a4">A4 invoice</option>
                <option value="thermal">Thermal / POS bill</option>
              </select>
            </Field>
            <Field label="Thermal paper width">
              <select
                aria-label="Thermal paper width"
                {...field("thermal_width")}
              >
                <option value="80">80 mm roll</option>
                <option value="58">58 mm roll</option>
              </select>
            </Field>
            <Field
              label="Receipt footer"
              className="span-2"
              hint="Optional. Printed only on thermal bills; no sample text is inserted."
            >
              <textarea
                aria-label="Receipt footer"
                {...field("receipt_footer")}
                rows={2}
                maxLength={300}
                placeholder="Your own short footer or return-policy message"
              />
            </Field>
          </div>
          <Toggle
            checked={p.receipt_show_terms}
            onChange={(receipt_show_terms) =>
              setForm((current) => ({ ...current, receipt_show_terms }))
            }
            label="Include invoice terms on thermal bills"
            description="A4 invoices always include the saved terms. Turn this on to include them on the roll receipt too."
          />
          <Toggle
            checked={p.print_show_qr}
            onChange={(print_show_qr) =>
              setForm((current) => ({ ...current, print_show_qr }))
            }
            label="Show UPI payment QR when money is due"
            description="Uses the UPI details saved on the invoice. Appears only on an issued, unpaid or part-paid bill; it does not verify or collect payment."
          />
          <Notice icon={Printer}>
            Install the printer's normal operating-system driver. Select the
            matching 58/80 mm roll, 100% scale and turn browser headers/footers
            off. Printing uses the browser dialog or a correctly sized PDF—not a
            direct ESC/POS connection or automatic cash-drawer trigger.
          </Notice>
        </div>
      </Panel>
      <Panel
        title="Preview your document"
        description="Uses a real saved document. No sample invoices or transactions are created."
      >
        <div className="settings-panel-body">
          {preview ? (
            <>
              <Field label="Preview document">
                <select
                  aria-label="Preview document"
                  value={preview.id}
                  onChange={(event) => setPreviewId(event.target.value)}
                >
                  {state.invoices.map((invoice) => (
                    <option key={invoice.id} value={invoice.id}>
                      {invoice.number || "Draft"} ·{" "}
                      {invoice.customer.name || "Walk-in client"}
                    </option>
                  ))}
                </select>
              </Field>
              <Button
                type="button"
                variant="secondary"
                icon={FileText}
                onClick={() => setShowPreview(!showPreview)}
              >
                {showPreview ? "Hide print preview" : "Show print preview"}
              </Button>
              {showPreview && (
                <div className="settings-print-preview">
                  <DocumentPreview
                    invoice={preview}
                    options={options}
                    title="Settings document preview"
                  />
                </div>
              )}
            </>
          ) : (
            <p className="field-hint">
              No saved invoices yet. The first bill you create will use these
              preferences. The cards above show the layout structure without
              adding any business data.
            </p>
          )}
        </div>
      </Panel>
    </>
  );
}
