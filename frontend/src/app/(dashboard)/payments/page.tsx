"use client";

import React, { useState, useEffect, useCallback } from "react";
import { paymentsApi, tenantsApi, type PaymentOut, type LeaseOut } from "@/lib/api";
import { MOCK_MODE } from "@/lib/useApiData";

// ─── Types ────────────────────────────────────────────────────────────────────

interface PaymentRow {
  id: string;
  leaseId: string;
  tenantName: string;
  tenantAvatar: string;
  tenantAvatarUrl: string | null;
  unitProperty: string;
  type: string;
  amount: number;
  dueDate: string;
  paidDate: string | null;
  status: string;
  description: string | null;
  notes: string | null;
}

// ─── Mock data ────────────────────────────────────────────────────────────────

const MOCK_PAYMENTS: PaymentRow[] = [
  { id: "p1", leaseId: "l1", tenantName: "Emma Jones", tenantAvatar: "EJ", tenantAvatarUrl: null, unitProperty: "101 · Sunset Towers", type: "RENT", amount: 2400, dueDate: "2026-06-01", paidDate: "2026-06-01", status: "PAID", description: "Rent — June 2026", notes: null },
  { id: "p2", leaseId: "l2", tenantName: "Marcus Lee", tenantAvatar: "ML", tenantAvatarUrl: null, unitProperty: "103 · Sunset Towers", type: "RENT", amount: 2750, dueDate: "2026-06-01", paidDate: null, status: "OVERDUE", description: "Rent — June 2026", notes: null },
  { id: "p3", leaseId: "l3", tenantName: "Sarah Kim", tenantAvatar: "SK", tenantAvatarUrl: null, unitProperty: "A1 · Cedar Row", type: "RENT", amount: 3100, dueDate: "2026-07-01", paidDate: null, status: "PENDING", description: "Rent — July 2026", notes: null },
  { id: "p4", leaseId: "l1", tenantName: "Emma Jones", tenantAvatar: "EJ", tenantAvatarUrl: null, unitProperty: "101 · Sunset Towers", type: "LATE_FEE", amount: 120, dueDate: "2026-05-06", paidDate: null, status: "OVERDUE", description: "Late fee — May 2026", notes: null },
];

const MOCK_LEASES: LeaseOut[] = [];

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<string, string> = {
  PAID: "bg-emerald-100 text-emerald-700",
  PENDING: "bg-slate-100 text-slate-600",
  OVERDUE: "bg-red-100 text-red-700",
  VOIDED: "bg-slate-100 text-slate-400",
};

const STATUS_LABELS: Record<string, string> = {
  PAID: "Paid", PENDING: "Pending", OVERDUE: "Overdue", VOIDED: "Voided",
};

const TYPE_LABELS: Record<string, string> = {
  RENT: "Rent", SECURITY_DEPOSIT: "Security deposit",
  LATE_FEE: "Late fee", MAINTENANCE_CHARGE: "Maintenance", OTHER: "Other",
};

function initials(name: string) {
  return name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
}

function fromApi(p: PaymentOut): PaymentRow {
  return {
    id: p.id, leaseId: p.lease_id,
    tenantName: p.tenant_name ?? "Unknown",
    tenantAvatar: initials(p.tenant_name ?? "??"),
    tenantAvatarUrl: p.tenant_avatar_url ?? null,
    unitProperty: [p.unit_number, p.property_name].filter(Boolean).join(" · "),
    type: p.payment_type,
    amount: p.amount,
    dueDate: String(p.due_date),
    paidDate: p.paid_date ? String(p.paid_date) : null,
    status: p.status,
    description: p.description,
    notes: p.notes ?? null,
  };
}

// ─── Confirm dialog ───────────────────────────────────────────────────────────

function ConfirmDialog({ message, confirmLabel = "Confirm", danger = false, onConfirm, onCancel }: {
  message: string; confirmLabel?: string; danger?: boolean;
  onConfirm: () => void; onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/40 z-[60] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
        <p className="text-sm text-slate-700 mb-6">{message}</p>
        <div className="flex gap-3">
          <button onClick={onCancel} className="flex-1 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">Cancel</button>
          <button onClick={onConfirm} className={`flex-1 py-2 text-sm rounded-lg font-medium text-white ${danger ? "bg-red-600 hover:bg-red-700" : "bg-black hover:bg-slate-800"}`}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

// ─── Add Payment modal ────────────────────────────────────────────────────────

interface AddForm {
  lease_id: string; payment_type: string; amount: string;
  due_date: string; paid_date: string; description: string; notes: string;
}

const BLANK_ADD: AddForm = {
  lease_id: "", payment_type: "RENT", amount: "",
  due_date: "", paid_date: "", description: "", notes: "",
};

function AddPaymentModal({ leases, onClose, onSaved }: {
  leases: LeaseOut[]; onClose: () => void; onSaved: (p: PaymentRow) => void;
}) {
  const [form, setForm] = useState<AddForm>(BLANK_ADD);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const set = (f: keyof AddForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(v => ({ ...v, [f]: e.target.value }));

  function handleLeaseChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const lease = leases.find(l => l.id === e.target.value);
    setForm(v => ({
      ...v,
      lease_id: e.target.value,
      amount: lease ? String(lease.monthly_rent) : v.amount,
    }));
  }

  async function handleSubmit() {
    if (!form.lease_id || !form.amount || !form.due_date) {
      setError("Lease, amount and due date are required."); return;
    }
    setSaving(true); setError("");
    try {
      const saved = await paymentsApi.create({
        lease_id: form.lease_id,
        payment_type: form.payment_type,
        amount: parseFloat(form.amount),
        due_date: form.due_date,
        paid_date: form.paid_date || null,
        description: form.description || null,
        notes: form.notes || null,
      });
      onSaved(fromApi(saved));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 sticky top-0 bg-white">
          <h2 className="text-sm font-semibold text-slate-900">Add payment</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-lg leading-none">✕</button>
        </div>
        <div className="px-6 py-5 space-y-4">
          {error && <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Tenant / Lease *</label>
            <select value={form.lease_id} onChange={handleLeaseChange} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-black bg-white">
              <option value="">Select lease…</option>
              {leases.map(l => (
                <option key={l.id} value={l.id}>
                  {l.tenant?.full_name ?? "Unknown"} — {l.unit_number ?? ""} · {l.property_name ?? ""}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Payment type *</label>
              <select value={form.payment_type} onChange={set("payment_type")} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-black bg-white">
                <option value="RENT">Rent</option>
                <option value="SECURITY_DEPOSIT">Security deposit</option>
                <option value="LATE_FEE">Late fee</option>
                <option value="MAINTENANCE_CHARGE">Maintenance charge</option>
                <option value="OTHER">Other</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Amount ($) *</label>
              <input type="number" min="0" value={form.amount} onChange={set("amount")} placeholder="e.g. 1500" className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-black" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Due date *</label>
              <input type="date" value={form.due_date} onChange={set("due_date")} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-black" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Paid date</label>
              <input type="date" value={form.paid_date} onChange={set("paid_date")} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-black" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Description</label>
            <input value={form.description} onChange={set("description")} placeholder="e.g. Late fee for May 2026" className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-black" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Notes</label>
            <textarea value={form.notes} onChange={set("notes")} rows={2} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-black resize-none" />
          </div>
        </div>
        <div className="flex gap-3 px-6 py-4 border-t border-slate-100 sticky bottom-0 bg-white">
          <button onClick={onClose} className="flex-1 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">Cancel</button>
          <button onClick={handleSubmit} disabled={saving} className="flex-1 py-2 text-sm bg-black text-white rounded-lg hover:bg-slate-800 font-medium disabled:opacity-50">
            {saving ? "Saving…" : "Add payment"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Edit Payment modal ───────────────────────────────────────────────────────

interface EditForm {
  payment_type: string; amount: string; due_date: string;
  paid_date: string; status: string; description: string; notes: string;
}

function EditPaymentModal({ payment, onClose, onSaved }: {
  payment: PaymentRow; onClose: () => void; onSaved: (p: PaymentRow) => void;
}) {
  const [form, setForm] = useState<EditForm>({
    payment_type: payment.type,
    amount: String(payment.amount),
    due_date: payment.dueDate,
    paid_date: payment.paidDate ?? "",
    status: payment.status,
    description: payment.description ?? "",
    notes: payment.notes ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const set = (f: keyof EditForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(v => ({ ...v, [f]: e.target.value }));

  async function handleSubmit() {
    setSaving(true); setError("");
    try {
      const saved = await paymentsApi.update(payment.id, {
        payment_type: form.payment_type,
        amount: parseFloat(form.amount),
        due_date: form.due_date,
        paid_date: form.paid_date || null,
        status: form.status,
        description: form.description || null,
        notes: form.notes || null,
      });
      onSaved(fromApi(saved));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 sticky top-0 bg-white">
          <h2 className="text-sm font-semibold text-slate-900">Edit payment</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-lg leading-none">✕</button>
        </div>
        <div className="px-6 py-5 space-y-4">
          {error && <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Payment type</label>
              <select value={form.payment_type} onChange={set("payment_type")} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-black bg-white">
                <option value="RENT">Rent</option>
                <option value="SECURITY_DEPOSIT">Security deposit</option>
                <option value="LATE_FEE">Late fee</option>
                <option value="MAINTENANCE_CHARGE">Maintenance charge</option>
                <option value="OTHER">Other</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Status</label>
              <select value={form.status} onChange={set("status")} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-black bg-white">
                <option value="PENDING">Pending</option>
                <option value="PAID">Paid</option>
                <option value="OVERDUE">Overdue</option>
                <option value="VOIDED">Voided</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Amount ($)</label>
              <input type="number" min="0" value={form.amount} onChange={set("amount")} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-black" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Due date</label>
              <input type="date" value={form.due_date} onChange={set("due_date")} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-black" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Paid date</label>
            <input type="date" value={form.paid_date} onChange={set("paid_date")} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-black" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Description</label>
            <input value={form.description} onChange={set("description")} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-black" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Notes</label>
            <textarea value={form.notes} onChange={set("notes")} rows={2} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-black resize-none" />
          </div>
        </div>
        <div className="flex gap-3 px-6 py-4 border-t border-slate-100 sticky bottom-0 bg-white">
          <button onClick={onClose} className="flex-1 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">Cancel</button>
          <button onClick={handleSubmit} disabled={saving} className="flex-1 py-2 text-sm bg-black text-white rounded-lg hover:bg-slate-800 font-medium disabled:opacity-50">
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Tenant avatar ────────────────────────────────────────────────────────────

function Avatar({ ini, url }: { ini: string; url: string | null }) {
  if (url) return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt={ini} className="w-7 h-7 rounded-full object-cover border border-slate-200 shrink-0" />
  );
  return (
    <div className="w-7 h-7 rounded-full bg-black text-white text-[10px] font-bold flex items-center justify-center shrink-0">{ini}</div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type ModalState = { type: "none" } | { type: "add" } | { type: "edit"; payment: PaymentRow } | { type: "void"; payment: PaymentRow };

const AUTOMATION_RULES = [
  { id: "r1", name: "Late fee — Day 5", description: "Charge 5% late fee if rent not received by the 5th of the month.", active: true },
  { id: "r2", name: "Auto reminder — Day 3", description: "Send SMS + email reminder 3 days after due date.", active: true },
  { id: "r3", name: "Escalation — Day 10", description: "Notify property manager and log notice to pay or quit.", active: false },
  { id: "r4", name: "Receipt on payment", description: "Auto-send payment receipt PDF when payment is recorded.", active: true },
];

export default function PaymentsPage() {
  const [payments, setPayments] = useState<PaymentRow[]>(MOCK_PAYMENTS);
  const [leases, setLeases] = useState<LeaseOut[]>(MOCK_LEASES);
  const [modal, setModal] = useState<ModalState>({ type: "none" });
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [rules, setRules] = useState(AUTOMATION_RULES);

  useEffect(() => {
    if (MOCK_MODE) return;
    paymentsApi.list().then(data => setPayments(data.map(fromApi))).catch(() => {});
    tenantsApi.list().then(setLeases).catch(() => {});
  }, []);

  const handleSaved = useCallback((p: PaymentRow) => {
    setPayments(prev => {
      const idx = prev.findIndex(x => x.id === p.id);
      return idx >= 0 ? prev.map(x => x.id === p.id ? p : x) : [p, ...prev];
    });
    setModal({ type: "none" });
  }, []);

  const handleMarkPaid = useCallback(async (p: PaymentRow) => {
    if (MOCK_MODE) {
      setPayments(prev => prev.map(x => x.id === p.id ? { ...x, status: "PAID", paidDate: new Date().toISOString().slice(0, 10) } : x));
      return;
    }
    try {
      const today = new Date().toISOString().slice(0, 10);
      const saved = await paymentsApi.update(p.id, { paid_date: today, status: "PAID" });
      setPayments(prev => prev.map(x => x.id === p.id ? fromApi(saved) : x));
    } catch { /* silent */ }
  }, []);

  const handleVoid = useCallback(async (p: PaymentRow) => {
    if (MOCK_MODE) {
      setPayments(prev => prev.map(x => x.id === p.id ? { ...x, status: "VOIDED" } : x));
      setModal({ type: "none" });
      return;
    }
    try {
      await paymentsApi.void(p.id);
      setPayments(prev => prev.map(x => x.id === p.id ? { ...x, status: "VOIDED" } : x));
    } catch { /* silent */ } finally {
      setModal({ type: "none" });
    }
  }, []);

  const filtered = payments.filter(p => {
    const matchStatus = statusFilter === "all" || p.status === statusFilter;
    const matchSearch = !search ||
      p.tenantName.toLowerCase().includes(search.toLowerCase()) ||
      p.unitProperty.toLowerCase().includes(search.toLowerCase());
    return matchStatus && matchSearch;
  });

  const today = new Date().toISOString().slice(0, 10);
  const thisMonth = today.slice(0, 7);

  const collectedThisMonth = payments.filter(p => p.status === "PAID" && p.paidDate?.startsWith(thisMonth)).reduce((s, p) => s + p.amount, 0);
  const outstanding = payments.filter(p => ["PENDING", "OVERDUE"].includes(p.status)).reduce((s, p) => s + p.amount, 0);
  const overdueCount = payments.filter(p => p.status === "OVERDUE").length;
  const dueSoon = payments.filter(p => p.status === "PENDING" && p.dueDate >= today && p.dueDate <= new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10)).length;

  return (
    <div className="max-w-[1280px] mx-auto px-6 py-6 space-y-6">
      {/* Modals */}
      {modal.type === "add" && (
        <AddPaymentModal leases={leases} onClose={() => setModal({ type: "none" })} onSaved={handleSaved} />
      )}
      {modal.type === "edit" && (
        <EditPaymentModal payment={modal.payment} onClose={() => setModal({ type: "none" })} onSaved={handleSaved} />
      )}
      {modal.type === "void" && (
        <ConfirmDialog
          message={`Void this payment of $${modal.payment.amount.toLocaleString()} for ${modal.payment.tenantName}? This cannot be undone.`}
          confirmLabel="Void payment"
          danger
          onConfirm={() => handleVoid(modal.payment)}
          onCancel={() => setModal({ type: "none" })}
        />
      )}

      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <p className="text-[11px] uppercase tracking-widest text-slate-400 font-medium">Receivables</p>
          <h1 className="text-xl font-bold text-slate-900 mt-0.5">Payments and collections</h1>
        </div>
        <button
          onClick={() => setModal({ type: "add" })}
          className="px-3 py-1.5 bg-black text-white text-xs font-medium rounded-lg hover:bg-slate-800 transition-colors"
        >
          + Add payment
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Collected this month", value: `$${collectedThisMonth.toLocaleString()}`, sub: `${payments.filter(p => p.status === "PAID" && p.paidDate?.startsWith(thisMonth)).length} payments received` },
          { label: "Outstanding", value: `$${outstanding.toLocaleString()}`, sub: `${payments.filter(p => ["PENDING","OVERDUE"].includes(p.status)).length} unpaid` },
          { label: "Overdue", value: overdueCount, sub: "Past due date" },
          { label: "Due in 30 days", value: dueSoon, sub: "Upcoming payments" },
        ].map(k => (
          <div key={k.label} className="bg-white rounded-xl border border-slate-200 px-5 py-4">
            <p className="text-[11px] uppercase tracking-wider text-slate-400 font-medium">{k.label}</p>
            <p className="text-2xl font-bold text-slate-900 mt-1">{k.value}</p>
            <p className="text-xs text-slate-500 mt-0.5">{k.sub}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Payment ledger */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
            <h3 className="text-sm font-semibold text-slate-900">Payment ledger</h3>
            <div className="flex items-center gap-2">
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search tenant or unit…"
                className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 outline-none focus:border-black w-44"
              />
              <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white outline-none focus:border-black">
                <option value="all">All status</option>
                <option value="PENDING">Pending</option>
                <option value="OVERDUE">Overdue</option>
                <option value="PAID">Paid</option>
                <option value="VOIDED">Voided</option>
              </select>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100">
                  {["Tenant", "Type", "Due", "Amount", "Paid on", "Status", ""].map(h => (
                    <th key={h} className="text-left text-[11px] font-medium text-slate-400 uppercase tracking-wider px-4 py-3 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filtered.length === 0 && (
                  <tr><td colSpan={7} className="px-4 py-8 text-center text-xs text-slate-400">No payments found.</td></tr>
                )}
                {filtered.map(p => (
                  <tr key={p.id} className={`hover:bg-slate-50 transition-colors group ${p.status === "VOIDED" ? "opacity-50" : ""}`}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <Avatar ini={p.tenantAvatar} url={p.tenantAvatarUrl} />
                        <div>
                          <p className="text-xs font-medium text-slate-900">{p.tenantName}</p>
                          <p className="text-[11px] text-slate-400">{p.unitProperty}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600">{TYPE_LABELS[p.type] ?? p.type}</td>
                    <td className="px-4 py-3 text-xs text-slate-500">{p.dueDate}</td>
                    <td className="px-4 py-3 text-xs font-semibold text-slate-900">
                      <span className={p.status === "VOIDED" ? "line-through text-slate-400" : ""}>${p.amount.toLocaleString()}</span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">{p.paidDate ?? <span className="text-slate-300">—</span>}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium ${STATUS_STYLES[p.status] ?? "bg-slate-100 text-slate-500"}`}>
                        {STATUS_LABELS[p.status] ?? p.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        {p.status !== "PAID" && p.status !== "VOIDED" && (
                          <button
                            onClick={() => handleMarkPaid(p)}
                            title="Mark paid"
                            className="p-1 text-emerald-500 hover:text-emerald-700 rounded"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                            </svg>
                          </button>
                        )}
                        <button
                          onClick={() => setModal({ type: "edit", payment: p })}
                          title="Edit"
                          className="p-1 text-slate-400 hover:text-slate-700 rounded"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                        {p.status !== "VOIDED" && (
                          <button
                            onClick={() => setModal({ type: "void", payment: p })}
                            title="Void"
                            className="p-1 text-red-400 hover:text-red-600 rounded"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="px-5 py-3 border-t border-slate-100 flex items-center justify-between">
            <p className="text-xs text-slate-400">{filtered.length} records</p>
            <div className="flex gap-4 text-xs text-slate-500">
              <span><span className="font-semibold text-emerald-600">${filtered.filter(p => p.status === "PAID").reduce((s,p) => s+p.amount, 0).toLocaleString()}</span> collected</span>
              <span><span className="font-semibold text-red-500">${filtered.filter(p => ["PENDING","OVERDUE"].includes(p.status)).reduce((s,p) => s+p.amount, 0).toLocaleString()}</span> outstanding</span>
            </div>
          </div>
        </div>

        {/* Right panel */}
        <div className="space-y-4">
          {/* Needs action */}
          <div className="bg-white rounded-xl border border-slate-200">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <h3 className="text-sm font-semibold text-slate-900">Needs action</h3>
              <span className="text-xs text-red-500 font-medium">{overdueCount} overdue</span>
            </div>
            <div className="p-4 space-y-3">
              {payments.filter(p => p.status === "OVERDUE").slice(0, 6).map(p => (
                <div key={p.id} className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <Avatar ini={p.tenantAvatar} url={p.tenantAvatarUrl} />
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-slate-900 truncate">{p.tenantName}</p>
                      <p className="text-[11px] text-slate-400 truncate">{p.unitProperty}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs font-semibold text-red-600">${p.amount.toLocaleString()}</span>
                    <button onClick={() => handleMarkPaid(p)} className="text-[11px] text-emerald-600 hover:underline font-medium">Mark paid</button>
                  </div>
                </div>
              ))}
              {overdueCount === 0 && <p className="text-xs text-slate-400 text-center py-2">No overdue payments.</p>}
            </div>
          </div>

          {/* Automation rules */}
          <div className="bg-white rounded-xl border border-slate-200">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <h3 className="text-sm font-semibold text-slate-900">Collection automation</h3>
              <span className="text-xs text-slate-400">Rules</span>
            </div>
            <div className="p-4 space-y-3">
              {rules.map(r => (
                <div key={r.id} className="flex gap-3 p-3 rounded-lg border border-slate-100 hover:border-slate-200 transition-colors">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-slate-900 mb-0.5">{r.name}</p>
                    <p className="text-[11px] text-slate-500 leading-relaxed">{r.description}</p>
                  </div>
                  <button
                    onClick={() => setRules(prev => prev.map(x => x.id === r.id ? { ...x, active: !x.active } : x))}
                    className={`w-9 h-5 rounded-full shrink-0 mt-0.5 transition-colors relative ${r.active ? "bg-black" : "bg-slate-200"}`}
                  >
                    <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${r.active ? "left-4" : "left-0.5"}`} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
