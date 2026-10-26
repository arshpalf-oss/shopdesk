import React, { useState, useRef } from "react";
import {
  Plus,
  Settings2,
  Building2,
  ReceiptText,
  Wallet,
  DatabaseBackup,
  ShieldCheck,
  Download,
  Upload,
  ArrowRight,
  Check,
  CheckCircle2,
  Eye,
  EyeOff,
  LockKeyhole,
  AlertTriangle,
  PawPrint,
  Save,
  BookOpen,
  FolderCheck,
  HardDrive,
  Printer,
} from "lucide-react";
import {
  useDesk,
  api,
  Button,
  IconButton,
  PageHeader,
  Panel,
  EmptyState,
  Field,
  StateSelect,
  Dialog,
  ErrorBox,
  Notice,
  SectionTitle,
  Toggle,
  Badge,
  useForm,
  useTask,
  fmtDate,
} from "./ui.jsx";
import { PrintPreferences } from "./Documents.jsx";
import { PRINT_DEFAULTS } from "../printing.js";
const defaultSettings = {
  ...PRINT_DEFAULTS,
  name: "",
  owner_name: "",
  address: "",
  city: "",
  state: "",
  phone: "",
  email: "",
  gst_registered: false,
  gstin: "",
  registration_no: "",
  drug_license: "",
  invoice_prefix: "SD",
  round_off: false,
  terms: "",
  upi_id: "",
  bank_name: "",
  account_name: "",
  account_number: "",
  ifsc: "",
};
export function SetupForm({ next }) {
  const { refresh, close, toast, setStack } = useDesk(),
    [form, setForm, field] = useForm(defaultSettings),
    [password, setPassword] = useState(""),
    [confirm, setConfirm] = useState(""),
    [show, setShow] = useState(false),
    task = useTask();
  return (
    <Dialog
      title="Let’s make it your clinic."
      subtitle="A few essentials, then your workspace is ready to use."
      wide
      busy={task.busy}
      className="setup-dialog"
      footer={
        <>
          <span className="footer-hint">
            No sample records. Just your clinic.
          </span>
          <Button variant="secondary" onClick={close}>
            Not now
          </Button>
          <Button
            icon={ArrowRight}
            type="submit"
            form="setup-form"
            loading={task.busy}
          >
            Create workspace
          </Button>
        </>
      }
    >
      <div className="setup-welcome">
        <span className="soft-icon">
          <StethoscopeIcon />
        </span>
        <div>
          <strong>A clean slate for better care.</strong>
          <p>
            These details appear on your invoices. You can change them in
            Settings.
          </p>
        </div>
      </div>
      <form
        id="setup-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (password !== confirm) {
            task.setError("The passwords do not match.");
            return;
          }
          task.run(async () => {
            const r = await api("/setup", {
              method: "POST",
              body: { settings: form, password },
            });
            sessionStorage.setItem("shopdesk_token", r.token);
            await refresh();
            if (next)
              setStack((s) => [
                ...s.slice(0, -1),
                { ...next, key: crypto.randomUUID() },
              ]);
            else close();
            toast("Your clinic workspace is ready. Welcome to shop desk.");
          });
        }}
      >
        <SectionTitle>Clinic essentials</SectionTitle>
        <div className="form-grid">
          <Field
            label="Clinic / legal business name"
            required
            className="span-2"
          >
            <input
              {...field("name")}
              placeholder="Your clinic’s name"
              required
              maxLength={150}
            />
          </Field>
          <Field label="Owner / administrator name" required>
            <input
              {...field("owner_name")}
              placeholder="Your full name"
              required
              maxLength={100}
            />
          </Field>
          <Field label="Phone number">
            <input
              {...field("phone")}
              type="tel"
              placeholder="Clinic contact number"
              maxLength={30}
            />
          </Field>
          <Field label="Clinic address" required className="span-2">
            <textarea
              {...field("address")}
              placeholder="Street, area, and PIN code"
              rows={2}
              required
              maxLength={500}
            />
          </Field>
          <Field label="City" required>
            <input
              {...field("city")}
              placeholder="City"
              required
              maxLength={100}
            />
          </Field>
          <Field label="State / UT" required>
            <StateSelect {...field("state")} required />
          </Field>
          <Field label="Clinic email" className="span-2">
            <input
              type="email"
              {...field("email")}
              placeholder="Optional contact email"
              maxLength={200}
            />
          </Field>
        </div>
        <Toggle
          checked={form.gst_registered}
          onChange={(gst_registered) =>
            setForm((f) => ({
              ...f,
              gst_registered,
              gstin: gst_registered ? f.gstin : "",
            }))
          }
          label="My clinic is GST-registered"
          description="Enable only if you have an active GST registration. Unregistered clinics cannot collect GST."
        />
        {form.gst_registered && (
          <Field
            label="Clinic GSTIN"
            required
            hint="The first two digits must match the clinic’s state."
          >
            <input
              {...field("gstin")}
              onChange={(e) =>
                setForm((f) => ({ ...f, gstin: e.target.value.toUpperCase() }))
              }
              placeholder="15-character GSTIN"
              minLength={15}
              maxLength={15}
              required
            />
          </Field>
        )}
        <SectionTitle note="Keep this safe. It protects your clinic’s workspace. There is no email password-reset service.">
          Owner access
        </SectionTitle>
        <div className="form-grid">
          <Field
            label="Create owner password"
            required
            hint="At least 8 characters."
          >
            <div className="password-input">
              <input
                type={show ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                maxLength={128}
                autoComplete="new-password"
                placeholder="Choose a secure password"
              />
              <IconButton
                icon={show ? EyeOff : Eye}
                label={show ? "Hide password" : "Show password"}
                type="button"
                onClick={() => setShow(!show)}
              />
            </div>
          </Field>
          <Field label="Confirm password" required>
            <input
              type={show ? "text" : "password"}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
              placeholder="Enter it again"
            />
          </Field>
        </div>
        <ErrorBox>{task.error}</ErrorBox>
      </form>
    </Dialog>
  );
}
function StethoscopeIcon() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    >
      <path d="M6 3v1H4v5a5 5 0 0 0 10 0V4h-2V3M9 14v3a4 4 0 0 0 8 0v-3" />
      <circle cx="18" cy="11" r="3" />
    </svg>
  );
}
export function Settings() {
  const { state, open } = useDesk();
  return state.settings ? (
    <SettingsContent />
  ) : (
    <>
      <PageHeader
        title="Settings"
        description="Make shop desk feel right at home in your clinic."
      />
      <Panel>
        <EmptyState
          icon={Settings2}
          title="Your clinic, your way."
          description="Add your legal clinic details, billing preferences, and owner password. Your workspace will stay empty until you add your own records."
          action={
            <Button icon={ArrowRight} onClick={() => open("setup")}>
              Set up your clinic
            </Button>
          }
        />
      </Panel>
    </>
  );
}
function SettingsContent() {
  const { state, refresh, toast } = useDesk(),
    [tab, setTab] = useState("profile"),
    [form, setForm, field] = useForm(state.settings),
    task = useTask();
  const changed = JSON.stringify(form) !== JSON.stringify(state.settings);
  const tabs = [
    ["profile", "Clinic profile", Building2],
    ["billing", "Billing & taxes", ReceiptText],
    ["payments", "Payment details", Wallet],
    ["printing", "Templates & printing", Printer],
    ["security", "Data & security", DatabaseBackup],
  ];
  return (
    <>
      <PageHeader
        title="Settings"
        description="A workspace that works the way your clinic does."
        actions={
          tab !== "security" && (
            <>
              <span className={"save-status " + (changed ? "unsaved" : "")}>
                {changed ? (
                  "Unsaved changes"
                ) : (
                  <>
                    <CheckCircle2 size={14} />
                    All changes saved
                  </>
                )}
              </span>
              <Button
                icon={Save}
                loading={task.busy}
                type="submit"
                form="settings-form"
              >
                Save changes
              </Button>
            </>
          )
        }
      />
      <div className="settings-layout">
        <aside className="settings-nav">
          {tabs.map(([key, title, I]) => (
            <button
              key={key}
              className={key === tab ? "active" : ""}
              onClick={() => setTab(key)}
            >
              <I size={17} />
              {title}
              {key === tab && <ArrowRight size={14} />}
            </button>
          ))}
          <div className="settings-nav-note">
            <ShieldCheck size={22} strokeWidth={1.4} />
            <strong>Your clinic. Your records.</strong>
            <p>
              Clinic changes apply to new documents. Issued invoices keep their
              original details; print layouts can be changed for reprints.
            </p>
          </div>
        </aside>
        <div className="settings-content">
          {tab === "security" ? (
            <DataSecurity />
          ) : (
            <form
              id="settings-form"
              onSubmit={(e) => {
                e.preventDefault();
                task.run(async () => {
                  await api("/settings", { method: "PUT", body: form });
                  await refresh();
                  toast("Clinic settings saved.");
                });
              }}
            >
              {tab === "profile" && (
                <>
                  <Panel
                    title="Clinic profile"
                    description="The details your clients will see on their invoices."
                  >
                    <div className="settings-panel-body form-grid">
                      <Field
                        label="Clinic / legal business name"
                        required
                        className="span-2"
                      >
                        <input {...field("name")} maxLength={150} required />
                      </Field>
                      <Field label="Owner / administrator name" required>
                        <input
                          {...field("owner_name")}
                          required
                          maxLength={100}
                        />
                      </Field>
                      <Field label="Clinic phone">
                        <input type="tel" {...field("phone")} maxLength={30} />
                      </Field>
                      <Field label="Clinic email" className="span-2">
                        <input
                          type="email"
                          {...field("email")}
                          maxLength={200}
                        />
                      </Field>
                      <Field label="Clinic address" required className="span-2">
                        <textarea
                          {...field("address")}
                          rows={2}
                          required
                          maxLength={500}
                        />
                      </Field>
                      <Field label="City" required>
                        <input {...field("city")} required maxLength={100} />
                      </Field>
                      <Field label="State / UT" required>
                        <StateSelect {...field("state")} required />
                      </Field>
                    </div>
                  </Panel>
                  <Panel
                    title="Professional details"
                    description="Optional registration and licence references for your invoices."
                  >
                    <div className="settings-panel-body form-grid">
                      <Field label="Veterinary registration number">
                        <input
                          {...field("registration_no")}
                          maxLength={100}
                          placeholder="Registration / council reference"
                        />
                      </Field>
                      <Field label="Drug licence number">
                        <input
                          {...field("drug_license")}
                          maxLength={100}
                          placeholder="If applicable"
                        />
                      </Field>
                    </div>
                  </Panel>
                </>
              )}
              {tab === "billing" && (
                <>
                  <Panel
                    title="GST & tax settings"
                    description="Confirm these details with your accountant before issuing tax invoices."
                  >
                    <div className="settings-panel-body">
                      <Toggle
                        checked={form.gst_registered}
                        onChange={(gst_registered) =>
                          setForm((f) => ({
                            ...f,
                            gst_registered,
                            gstin: gst_registered ? f.gstin : "",
                          }))
                        }
                        label="GST-registered clinic"
                        description="Collect GST only when you hold an active GST registration."
                      />
                      {form.gst_registered ? (
                        <div className="form-grid mt-20">
                          <Field label="GSTIN" required>
                            <input
                              {...field("gstin")}
                              onChange={(e) =>
                                setForm((f) => ({
                                  ...f,
                                  gstin: e.target.value.toUpperCase(),
                                }))
                              }
                              maxLength={15}
                              minLength={15}
                              required
                            />
                          </Field>
                          <Field label="Registration state" required>
                            <StateSelect {...field("state")} required />
                          </Field>
                        </div>
                      ) : (
                        <Notice tone="neutral">
                          Invoices from your clinic will not charge GST.
                          Catalogue tax settings are retained in case you
                          register later.
                        </Notice>
                      )}
                      <Notice>
                        Animal/bird healthcare by a veterinary clinic may be
                        exempt under Entry 46, Notification 12/2017-CT(R).
                        Separately sold medicines, pet food, and non-healthcare
                        services need their own classification. Set tax
                        treatment and confirmed rates per item.
                      </Notice>
                    </div>
                  </Panel>
                  <Panel
                    title="Invoice preferences"
                    description="Simple, consecutive numbering for every financial year."
                  >
                    <div className="settings-panel-body">
                      <div className="form-grid">
                        <Field
                          label="Invoice prefix"
                          required
                          hint="1–4 uppercase letters or digits. Format: PREFIX/YY-YY/00001."
                        >
                          <input
                            {...field("invoice_prefix")}
                            onChange={(e) =>
                              setForm((f) => ({
                                ...f,
                                invoice_prefix: e.target.value.toUpperCase(),
                              }))
                            }
                            maxLength={4}
                            pattern="[A-Z0-9]{1,4}"
                            required
                          />
                        </Field>
                        <div className="invoice-number-preview">
                          <span>Example format only</span>
                          <strong>
                            {form.invoice_prefix || "SD"}/YY-YY/00001
                          </strong>
                          <small>Never added as a real invoice.</small>
                        </div>
                      </div>
                      <Toggle
                        checked={form.round_off}
                        onChange={(round_off) =>
                          setForm((f) => ({ ...f, round_off }))
                        }
                        label="Round invoices to the nearest rupee"
                        description="You can change this for each invoice. Round-off is shown separately."
                      />
                      <Notice tone="neutral">
                        New intrastate bills use equal, separately rounded CGST
                        and SGST components. Inclusive prices keep the entered
                        total. Already-issued invoices retain their saved
                        figures.
                      </Notice>
                      <Field
                        label="Default terms & conditions"
                        hint="Printed on new invoices. Leave empty if you do not need terms."
                      >
                        <textarea
                          {...field("terms")}
                          rows={4}
                          maxLength={1200}
                          placeholder="Enter your clinic’s own invoice terms"
                        />
                      </Field>
                    </div>
                  </Panel>
                </>
              )}
              {tab === "printing" && (
                <PrintPreferences
                  form={form}
                  setForm={setForm}
                  field={field}
                  state={state}
                />
              )}
              {tab === "payments" && (
                <Panel
                  title="Payment details"
                  description="Optional. Shown on invoices to help your clients pay you."
                >
                  <div className="settings-panel-body">
                    <div className="form-grid">
                      <Field
                        label="UPI ID"
                        className="span-2"
                        hint="A payment QR appears in the PDF for an issued invoice with an outstanding balance."
                      >
                        <input
                          {...field("upi_id")}
                          placeholder="Your clinic’s UPI address"
                          maxLength={150}
                        />
                      </Field>
                      <Field label="Bank name">
                        <input
                          {...field("bank_name")}
                          placeholder="Bank name"
                          maxLength={150}
                        />
                      </Field>
                      <Field label="Account holder name">
                        <input
                          {...field("account_name")}
                          placeholder="Name on the account"
                          maxLength={150}
                        />
                      </Field>
                      <Field label="Account number">
                        <input
                          {...field("account_number")}
                          placeholder="Bank account number"
                          maxLength={40}
                        />
                      </Field>
                      <Field label="IFSC">
                        <input
                          {...field("ifsc")}
                          onChange={(e) =>
                            setForm((f) => ({
                              ...f,
                              ifsc: e.target.value.toUpperCase(),
                            }))
                          }
                          placeholder="IFSC code"
                          maxLength={20}
                        />
                      </Field>
                    </div>
                    <Notice>
                      These are payment instructions, not a payment gateway.
                      Confirm receipt manually before recording a payment in
                      shop desk.
                    </Notice>
                  </div>
                </Panel>
              )}
              <ErrorBox>{task.error}</ErrorBox>
            </form>
          )}
        </div>
      </div>
    </>
  );
}
function DataSecurity() {
  const { state, open, toast, exportBackup } = useDesk(),
    [form, setForm, field] = useForm({
      current_password: "",
      password: "",
      confirm: "",
    }),
    task = useTask();
  return (
    <>
      <Panel
        title="Backups & portability"
        description="Take a copy. Keep it safe. Your clinic’s data belongs to you."
      >
        <div className="settings-panel-body">
          <div className="backup-status">
            <span className="soft-icon blue">
              <HardDrive size={23} />
            </span>
            <div>
              <strong>Server-side SQLite storage</strong>
              <p>Records persist on this server, across browser sessions.</p>
              <small>
                {state.backup_at
                  ? "Last backup requested: " +
                    new Date(state.backup_at).toLocaleString("en-IN", {
                      timeZone: "Asia/Kolkata",
                    }) +
                    " IST"
                  : "No workspace backup downloaded yet."}
              </small>
            </div>
            <Badge tone="green">Connected</Badge>
          </div>
          <div className="backup-actions">
            <div>
              <div>
                <Download size={20} />
                <h3>Download a backup</h3>
              </div>
              <p>
                All clinic settings, clients, patients, stock batches, invoices,
                purchases, payments, and history in one JSON file. Passwords and
                sessions are excluded.
              </p>
              <Button
                icon={Download}
                variant="secondary"
                onClick={exportBackup}
              >
                Download full backup
              </Button>
            </div>
            <div>
              <div>
                <Upload size={20} />
                <h3>Restore a backup</h3>
              </div>
              <p>
                Replace the current workspace with an existing shop desk backup.
                Your current owner password is kept. Download a fresh backup
                first.
              </p>
              <Button
                icon={Upload}
                variant="secondary"
                onClick={() => open("restore")}
              >
                Restore from file
              </Button>
            </div>
          </div>
          <Notice tone="warning">
            A backup contains client contact details and financial records.
            Store it securely. Backups are manual—there is no automatic cloud
            backup or sync.
          </Notice>
        </div>
      </Panel>
      <Panel
        title="Owner password"
        description="Update your password. Other active sessions will be signed out."
      >
        <form
          className="settings-panel-body"
          onSubmit={(e) => {
            e.preventDefault();
            if (form.password !== form.confirm) {
              task.setError("The new passwords do not match.");
              return;
            }
            task.run(async () => {
              const r = await api("/password", { method: "PUT", body: form });
              sessionStorage.setItem("shopdesk_token", r.token);
              setForm({ current_password: "", password: "", confirm: "" });
              toast(
                "Owner password updated. Other sessions have been signed out.",
              );
            });
          }}
        >
          <div className="form-grid">
            <Field label="Current password" required className="span-2">
              <input
                type="password"
                {...field("current_password")}
                autoComplete="current-password"
                required
                maxLength={128}
              />
            </Field>
            <Field label="New password" required>
              <input
                type="password"
                {...field("password")}
                minLength={8}
                maxLength={128}
                autoComplete="new-password"
                required
              />
            </Field>
            <Field label="Confirm new password" required>
              <input
                type="password"
                {...field("confirm")}
                minLength={8}
                maxLength={128}
                autoComplete="new-password"
                required
              />
            </Field>
          </div>
          <ErrorBox>{task.error}</ErrorBox>
          <Button
            variant="secondary"
            icon={LockKeyhole}
            loading={task.busy}
            type="submit"
          >
            Update password
          </Button>
        </form>
      </Panel>
      <Panel title="About this workspace">
        <div className="settings-panel-body">
          <div className="about-grid">
            <div>
              <span>Software</span>
              <strong>shop desk · v1.0</strong>
            </div>
            <div>
              <span>Currency & time zone</span>
              <strong>INR · Asia/Kolkata</strong>
            </div>
            <div>
              <span>Access model</span>
              <strong>Single-clinic owner workspace</strong>
            </div>
            <div>
              <span>Online integrations</span>
              <strong>Not connected</strong>
            </div>
          </div>
          <p className="field-hint mt-20">
            This application handles domestic, regular-taxpayer billing and
            inventory. It does not submit GST returns, generate IRNs, issue
            e-way bills, process payments, or assess eligibility for tax
            exemptions/ITC. Full credit-note reversals are supported; partial
            credit notes, composition-scheme billing, and
            multi-branch/multi-user roles are not included.
          </p>
        </div>
      </Panel>
    </>
  );
}
export function RestoreForm() {
  const { close, refresh, toast } = useDesk(),
    [file, setFile] = useState(null),
    [password, setPassword] = useState(""),
    [confirm, setConfirm] = useState(false),
    task = useTask();
  return (
    <Dialog
      title="Restore a workspace backup"
      subtitle="Replace the current clinic’s records with a saved backup."
      busy={task.busy}
      footer={
        <>
          <Button variant="secondary" onClick={close}>
            Cancel
          </Button>
          <Button
            variant="danger"
            loading={task.busy}
            disabled={!file || !confirm}
            form="restore-form"
            type="submit"
          >
            Replace & restore
          </Button>
        </>
      }
    >
      <Notice tone="warning">
        This replaces current inventory, invoices, clients, and payment records.
        It cannot be undone without another backup. Download your current backup
        before continuing.
      </Notice>
      <form
        id="restore-form"
        onSubmit={(e) => {
          e.preventDefault();
          task.run(async () => {
            if (file.size > 20 * 1024 * 1024)
              throw new Error("Use a backup smaller than 20 MB");
            let backup;
            try {
              backup = JSON.parse(await file.text());
            } catch {
              throw new Error("This file is not valid JSON");
            }
            await api("/restore", {
              method: "POST",
              body: { backup, password },
            });
            await refresh();
            close();
            toast("Workspace restored. Your owner password is unchanged.");
          });
        }}
      >
        <Field label="shop desk backup file" required>
          <input
            type="file"
            accept=".json,application/json"
            onChange={(e) => setFile(e.target.files[0])}
            required
          />
        </Field>
        <Field label="Current owner password" required className="mt-20">
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </Field>
        <label className="check-label mt-20">
          <input
            type="checkbox"
            checked={confirm}
            onChange={(e) => setConfirm(e.target.checked)}
            required
          />
          <span>
            I have a backup of the current workspace and understand its records
            will be replaced.
          </span>
        </label>
        <ErrorBox>{task.error}</ErrorBox>
      </form>
    </Dialog>
  );
}
