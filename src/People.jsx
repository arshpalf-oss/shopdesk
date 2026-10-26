import React, { useState } from "react";
import {
  Plus,
  UsersRound,
  PawPrint,
  ArrowUpRight,
  ReceiptText,
  Mail,
  Phone,
  MapPin,
  Building2,
  Truck,
  ChevronRight,
  UserRoundPlus,
  PenLine,
  Stethoscope,
  NotebookText,
  Package,
  Download,
} from "lucide-react";
import {
  useDesk,
  api,
  Button,
  IconButton,
  PageHeader,
  Panel,
  EmptyState,
  Table,
  Money,
  Badge,
  SearchBox,
  Field,
  StateSelect,
  Dialog,
  ErrorBox,
  SectionTitle,
  Segments,
  Avatar,
  InvoiceBadge,
  useForm,
  useTask,
  ExportButton,
  fmtDate,
  matches,
} from "./ui.jsx";
import { money, today, stateName } from "../shared.js";
export function Clients() {
  const { state, open } = useDesk(),
    [q, setQ] = useState("");
  const clients = state.clients.filter((c) =>
    matches(
      q,
      c.name,
      c.phone,
      c.email,
      ...state.pets.filter((p) => p.client_id === c.id).map((p) => p.name),
    ),
  );
  return (
    <>
      <PageHeader
        title="Clients & pets"
        description="Because good care starts with knowing who’s in front of you."
        actions={
          <Button icon={UserRoundPlus} onClick={() => open("client")}>
            Add client
          </Button>
        }
      />
      <div className="quiet-stats">
        <span>
          <UsersRound size={17} />
          <strong>{state.clients.length}</strong> clients
        </span>
        <span>
          <PawPrint size={17} />
          <strong>{state.pets.length}</strong> patients
        </span>
        <span>
          <ReceiptText size={17} />
          <strong>
            {state.invoices.filter((i) => i.status === "issued").length}
          </strong>{" "}
          issued invoices
        </span>
      </div>
      <Panel>
        <div className="list-toolbar">
          <SearchBox
            value={q}
            onChange={setQ}
            placeholder="Search client, phone number, or pet name…"
          />
          <ExportButton type="clients" />
        </div>
        <Table
          head={[
            "CLIENT",
            "CONTACT",
            "PETS",
            "TOTAL BILLED",
            "OUTSTANDING",
            "",
          ]}
          empty={
            !clients.length && (
              <EmptyState
                icon={UsersRound}
                title={
                  q
                    ? "No clients found"
                    : "Every pet has a person. Start with theirs."
                }
                description={
                  q
                    ? "Try another name, pet name, or phone number."
                    : "Keep your pet parents, patients, and billing history together. Add only the clients you care for."
                }
                action={
                  !q && (
                    <Button icon={Plus} onClick={() => open("client")}>
                      Add your first client
                    </Button>
                  )
                }
              />
            )
          }
        >
          {clients.map((c) => {
            const pets = state.pets.filter((p) => p.client_id === c.id),
              invoices = state.invoices.filter((i) => i.client_id === c.id),
              billed = invoices
                .filter((i) => i.status === "issued")
                .reduce((n, i) => n + i.total, 0),
              due = invoices.reduce((n, i) => n + i.balance, 0);
            return (
              <tr
                key={c.id}
                className="clickable"
                onClick={() => open("clientView", { id: c.id })}
              >
                <td>
                  <div className="item-cell">
                    <Avatar name={c.name} />
                    <div>
                      <strong className="table-primary">{c.name}</strong>
                      <span className="table-secondary">
                        Added {fmtDate(c.created_at.slice(0, 10))}
                      </span>
                    </div>
                  </div>
                </td>
                <td>
                  {c.phone || "—"}
                  <span className="table-secondary">
                    {c.email || "No email added"}
                  </span>
                </td>
                <td>
                  {pets.length ? (
                    <div className="pet-pills">
                      {pets.slice(0, 2).map((p) => (
                        <Badge key={p.id}>
                          <PawPrint size={11} />
                          {p.name}
                        </Badge>
                      ))}
                      {pets.length > 2 && <Badge>+{pets.length - 2}</Badge>}
                    </div>
                  ) : (
                    <span className="muted">No pets added</span>
                  )}
                </td>
                <td>
                  <Money value={billed} />
                </td>
                <td>
                  <Money className={due ? "text-amber" : ""} value={due} />
                </td>
                <td>
                  <IconButton
                    icon={ReceiptText}
                    label={"Create invoice for " + c.name}
                    onClick={(e) => {
                      e.stopPropagation();
                      open("invoice", { clientId: c.id });
                    }}
                  />
                </td>
              </tr>
            );
          })}
        </Table>
        <div className="table-footer">
          <span>
            {clients.length} {clients.length === 1 ? "client" : "clients"}
          </span>
          <span>Records you add, and nothing else.</span>
        </div>
      </Panel>
    </>
  );
}
export function ClientForm({ id, onSaved }) {
  const { state, refresh, close, toast } = useDesk(),
    c = state.clients.find((c) => c.id === id);
  const [form, setForm, field] = useForm(
      c || {
        name: "",
        phone: "",
        email: "",
        address: "",
        state: state.settings?.state || "",
        gstin: "",
        notes: "",
      },
    ),
    task = useTask();
  const save = (e) => {
    e.preventDefault();
    task.run(async () => {
      const r = await api("/clients" + (id ? "/" + id : ""), {
        method: id ? "PUT" : "POST",
        body: form,
      });
      await refresh();
      close();
      toast(
        id
          ? "Client details updated."
          : "Client added. You can add their pets next.",
      );
      onSaved?.(r.id || id, form);
    });
  };
  return (
    <Dialog
      title={id ? "Edit client" : "Add a client"}
      subtitle="A familiar face, with all the right details."
      wide
      busy={task.busy}
      footer={
        <>
          <Button variant="secondary" onClick={close}>
            Cancel
          </Button>
          <Button loading={task.busy} form="client-form" type="submit">
            {id ? "Save changes" : "Add client"}
          </Button>
        </>
      }
    >
      <form id="client-form" onSubmit={save}>
        <SectionTitle>Contact details</SectionTitle>
        <div className="form-grid">
          <Field label="Client / owner name" required className="span-2">
            <input
              {...field("name")}
              required
              placeholder="Full name"
              maxLength={150}
            />
          </Field>
          <Field label="Phone number">
            <input
              {...field("phone")}
              type="tel"
              placeholder="Contact number"
              maxLength={30}
            />
          </Field>
          <Field label="Email address">
            <input
              {...field("email")}
              type="email"
              placeholder="Email for their records"
              maxLength={200}
            />
          </Field>
        </div>
        <SectionTitle note="Used on invoices. GSTIN is optional for unregistered clients.">
          Billing details
        </SectionTitle>
        <div className="form-grid">
          <Field label="Billing address" className="span-2">
            <textarea
              {...field("address")}
              rows={2}
              placeholder="Street, area, city, and PIN code"
              maxLength={600}
            />
          </Field>
          <Field label="State / UT" required>
            <StateSelect {...field("state")} required />
          </Field>
          <Field label="GSTIN (if registered)">
            <input
              {...field("gstin")}
              onChange={(e) =>
                setForm((f) => ({ ...f, gstin: e.target.value.toUpperCase() }))
              }
              maxLength={15}
              placeholder="15-character GSTIN"
            />
          </Field>
          <Field label="Notes (internal)" className="span-2">
            <textarea
              {...field("notes")}
              rows={2}
              placeholder="Anything you’d like the front desk to remember"
              maxLength={1500}
            />
          </Field>
        </div>
        <ErrorBox>{task.error}</ErrorBox>
      </form>
    </Dialog>
  );
}
export function PetForm({ id, clientId, onSaved }) {
  const { state, refresh, close, toast } = useDesk(),
    p = state.pets.find((p) => p.id === id);
  const [form, setForm, field] = useForm(
      p || {
        client_id: clientId || "",
        name: "",
        species: "",
        breed: "",
        sex: "",
        dob: "",
        notes: "",
      },
    ),
    task = useTask();
  const save = (e) => {
    e.preventDefault();
    task.run(async () => {
      const r = await api("/pets" + (id ? "/" + id : ""), {
        method: id ? "PUT" : "POST",
        body: form,
      });
      await refresh();
      close();
      toast(
        id
          ? "Patient details updated."
          : "Patient added to their client’s record.",
      );
      onSaved?.(r.id || id);
    });
  };
  return (
    <Dialog
      title={id ? "Edit patient" : "Add a pet / patient"}
      subtitle="A little record for someone important."
      wide
      busy={task.busy}
      footer={
        <>
          <Button variant="secondary" onClick={close}>
            Cancel
          </Button>
          <Button type="submit" form="pet-form" loading={task.busy}>
            {id ? "Save changes" : "Add patient"}
          </Button>
        </>
      }
    >
      <form id="pet-form" onSubmit={save}>
        <div className="form-grid">
          <Field label="Client / owner" required className="span-2">
            <select {...field("client_id")} required disabled={!!id}>
              <option value="" disabled>
                Select client
              </option>
              {state.clients.map((c) => (
                <option value={c.id} key={c.id}>
                  {c.name}
                  {c.phone ? " · " + c.phone : ""}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Patient name" required>
            <input
              {...field("name")}
              required
              placeholder="Pet / patient name"
              maxLength={100}
            />
          </Field>
          <Field label="Species" required>
            <select {...field("species")} required>
              <option value="" disabled>
                Select species
              </option>
              {[
                "Dog",
                "Cat",
                "Cattle",
                "Buffalo",
                "Horse",
                "Goat",
                "Sheep",
                "Bird",
                "Rabbit",
                "Other",
              ].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </Field>
          <Field label="Breed">
            <input
              {...field("breed")}
              placeholder="Breed, if known"
              maxLength={100}
            />
          </Field>
          <Field label="Sex">
            <select {...field("sex")}>
              <option value="">Not specified</option>
              <option>Female</option>
              <option>Male</option>
              <option>Unknown</option>
            </select>
          </Field>
          <Field label="Date of birth">
            <input type="date" {...field("dob")} max={today()} />
          </Field>
          <Field label="Notes (internal)" className="span-2">
            <textarea
              {...field("notes")}
              rows={3}
              placeholder="Patient notes for your team"
              maxLength={1200}
            />
          </Field>
        </div>
        <ErrorBox>{task.error}</ErrorBox>
      </form>
    </Dialog>
  );
}
export function ClientView({ id }) {
  const { state, open, close } = useDesk(),
    [tab, setTab] = useState("pets"),
    c = state.clients.find((c) => c.id === id),
    pets = state.pets.filter((p) => p.client_id === id),
    invoices = state.invoices.filter((i) => i.client_id === id);
  if (!c) return null;
  return (
    <Dialog
      title="Client details"
      wide
      footer={
        <>
          <Button
            variant="secondary"
            icon={PenLine}
            onClick={() => open("client", { id })}
          >
            Edit client
          </Button>
          <Button icon={Plus} onClick={() => open("invoice", { clientId: id })}>
            New invoice
          </Button>
        </>
      }
    >
      <div className="client-profile">
        <Avatar name={c.name} />
        <div>
          <h2>{c.name}</h2>
          <div className="client-profile-meta">
            {c.phone && (
              <span>
                <Phone size={13} />
                {c.phone}
              </span>
            )}
            {c.email && (
              <span>
                <Mail size={13} />
                {c.email}
              </span>
            )}
          </div>
          {c.address && (
            <p>
              <MapPin size={13} />
              {c.address} · {stateName(c.state)}
            </p>
          )}
          {c.gstin && <span className="tiny muted">GSTIN {c.gstin}</span>}
        </div>
      </div>
      <div className="client-stat-row">
        <div>
          <span>Total billed</span>
          <strong>
            {money(
              invoices
                .filter((i) => i.status === "issued")
                .reduce((n, i) => n + i.total, 0),
            )}
          </strong>
        </div>
        <div>
          <span>Outstanding</span>
          <strong>{money(invoices.reduce((n, i) => n + i.balance, 0))}</strong>
        </div>
        <div>
          <span>Patients</span>
          <strong>{pets.length}</strong>
        </div>
      </div>
      {c.notes && (
        <div className="internal-notes">
          <NotebookText size={16} />
          <p>{c.notes}</p>
        </div>
      )}
      <div className="client-tabs">
        <Segments
          value={tab}
          onChange={setTab}
          options={[
            { value: "pets", label: "Pets & patients", count: pets.length },
            {
              value: "invoices",
              label: "Invoice history",
              count: invoices.length,
            },
          ]}
        />
        {tab === "pets" && (
          <Button
            variant="secondary"
            size="sm"
            icon={Plus}
            onClick={() => open("pet", { clientId: id })}
          >
            Add patient
          </Button>
        )}
      </div>
      {tab === "pets" ? (
        pets.length ? (
          <div className="pet-cards">
            {pets.map((p) => (
              <button key={p.id} onClick={() => open("pet", { id: p.id })}>
                <span className="pet-avatar">
                  <PawPrint size={24} strokeWidth={1.4} />
                </span>
                <span>
                  <strong>{p.name}</strong>
                  <small>
                    {[p.species, p.breed, p.sex].filter(Boolean).join(" · ")}
                  </small>
                  {p.dob && <small>Born {fmtDate(p.dob)}</small>}
                </span>
                <PenLine size={15} />
              </button>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={PawPrint}
            title="Let’s meet their first patient"
            description="Add a pet to keep their name and details close at hand."
            compact
            action={
              <Button
                variant="secondary"
                icon={Plus}
                onClick={() => open("pet", { clientId: id })}
              >
                Add patient
              </Button>
            }
          />
        )
      ) : (
        <Table
          head={["INVOICE", "DATE", "AMOUNT", "STATUS"]}
          empty={
            !invoices.length && (
              <EmptyState
                icon={ReceiptText}
                title="A clean billing history"
                description="Invoices for this client will appear here."
                compact
              />
            )
          }
        >
          {invoices.map((i) => (
            <tr
              key={i.id}
              className="clickable"
              onClick={() => open("invoiceView", { id: i.id })}
            >
              <td>{i.number || "Draft"}</td>
              <td>{fmtDate(i.date)}</td>
              <td>
                <Money value={i.total} />
              </td>
              <td>
                <InvoiceBadge invoice={i} />
              </td>
            </tr>
          ))}
        </Table>
      )}
    </Dialog>
  );
}
export function Suppliers() {
  const { state, open } = useDesk(),
    [q, setQ] = useState("");
  const suppliers = state.suppliers.filter((s) =>
    matches(q, s.name, s.phone, s.gstin),
  );
  return (
    <>
      <PageHeader
        title="Suppliers"
        description="Good relationships keep your shelves ready for anything."
        actions={
          <Button icon={Plus} onClick={() => open("supplier")}>
            Add supplier
          </Button>
        }
      />
      <div className="quiet-stats">
        <span>
          <Building2 size={17} />
          <strong>{state.suppliers.length}</strong> suppliers
        </span>
        <span>
          <Truck size={17} />
          <strong>{state.purchases.length}</strong> purchases recorded
        </span>
        <span>
          <ReceiptText size={17} />
          Total payable{" "}
          <strong>
            {money(state.purchases.reduce((n, p) => n + p.total - p.paid, 0))}
          </strong>
        </span>
      </div>
      <Panel>
        <div className="list-toolbar">
          <SearchBox
            value={q}
            onChange={setQ}
            placeholder="Search supplier, phone, or GSTIN…"
          />
          <span className="muted tiny">
            Your supply partners, in one place.
          </span>
        </div>
        <Table
          head={["SUPPLIER", "CONTACT", "GSTIN", "PURCHASES", "PAYABLE", ""]}
          empty={
            !suppliers.length && (
              <EmptyState
                icon={Building2}
                title={
                  q ? "No suppliers found" : "Meet the people behind your stock"
                }
                description={
                  q
                    ? "Try another name, phone number, or GSTIN."
                    : "Add your distributors and suppliers, then record purchases to bring stock into your clinic."
                }
                action={
                  !q && (
                    <Button icon={Plus} onClick={() => open("supplier")}>
                      Add your first supplier
                    </Button>
                  )
                }
              />
            )
          }
        >
          {suppliers.map((s) => {
            const purchases = state.purchases.filter(
              (p) => p.supplier_id === s.id,
            );
            return (
              <tr
                key={s.id}
                className="clickable"
                onClick={() => open("supplier", { id: s.id })}
              >
                <td>
                  <div className="item-cell">
                    <span className="item-icon blue">
                      <Building2 size={19} />
                    </span>
                    <div>
                      <strong className="table-primary">{s.name}</strong>
                      <span className="table-secondary">
                        {s.address || "No address added"}
                      </span>
                    </div>
                  </div>
                </td>
                <td>
                  {s.phone || "—"}
                  <span className="table-secondary">
                    {s.email || "No email added"}
                  </span>
                </td>
                <td>
                  <code>{s.gstin || "—"}</code>
                </td>
                <td>{purchases.length}</td>
                <td>
                  <Money
                    value={purchases.reduce((n, p) => n + p.total - p.paid, 0)}
                  />
                </td>
                <td>
                  <IconButton
                    icon={Truck}
                    label={"Record purchase from " + s.name}
                    onClick={(e) => {
                      e.stopPropagation();
                      open("purchase", { supplierId: s.id });
                    }}
                  />
                </td>
              </tr>
            );
          })}
        </Table>
        <div className="table-footer">
          <span>{suppliers.length} suppliers</span>
          <span>Purchase balances update as payments are recorded.</span>
        </div>
      </Panel>
    </>
  );
}
export function SupplierForm({ id, onSaved }) {
  const { state, refresh, close, toast } = useDesk(),
    supplier = state.suppliers.find((s) => s.id === id);
  const [form, setForm, field] = useForm(
      supplier || { name: "", phone: "", email: "", address: "", gstin: "" },
    ),
    task = useTask();
  return (
    <Dialog
      title={id ? "Edit supplier" : "Add a supplier"}
      subtitle="The details that keep your supply chain simple."
      wide
      busy={task.busy}
      footer={
        <>
          <Button variant="secondary" onClick={close}>
            Cancel
          </Button>
          <Button loading={task.busy} form="supplier-form" type="submit">
            {id ? "Save changes" : "Add supplier"}
          </Button>
        </>
      }
    >
      <form
        id="supplier-form"
        onSubmit={(e) => {
          e.preventDefault();
          task.run(async () => {
            const r = await api("/suppliers" + (id ? "/" + id : ""), {
              method: id ? "PUT" : "POST",
              body: form,
            });
            await refresh();
            close();
            toast(id ? "Supplier updated." : "Supplier added.");
            onSaved?.(r.id || id);
          });
        }}
      >
        <div className="form-grid">
          <Field label="Supplier / business name" required className="span-2">
            <input
              {...field("name")}
              placeholder="Registered or trading name"
              required
              maxLength={150}
            />
          </Field>
          <Field label="Phone number">
            <input
              {...field("phone")}
              type="tel"
              placeholder="Contact number"
              maxLength={30}
            />
          </Field>
          <Field label="Email address">
            <input
              {...field("email")}
              type="email"
              placeholder="Supplier email"
              maxLength={200}
            />
          </Field>
          <Field label="GSTIN (if registered)" className="span-2">
            <input
              {...field("gstin")}
              onChange={(e) =>
                setForm((f) => ({ ...f, gstin: e.target.value.toUpperCase() }))
              }
              placeholder="15-character GSTIN"
              maxLength={15}
            />
          </Field>
          <Field label="Address" className="span-2">
            <textarea
              {...field("address")}
              rows={3}
              placeholder="Supplier’s billing address"
              maxLength={600}
            />
          </Field>
        </div>
        <ErrorBox>{task.error}</ErrorBox>
      </form>
    </Dialog>
  );
}
