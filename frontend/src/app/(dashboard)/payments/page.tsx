"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { paymentsApi, tenantsApi, type PaymentOut, type PaymentNoteOut, type LeaseOut } from "@/lib/api";
import { MOCK_MODE } from "@/lib/useApiData";
import { useAuth } from "@/context/AuthContext";

// ─── Types ────────────────────────────────────────────────────────────────────

interface PaymentRow {
  id: string;
  leaseId: string;
  tenantName: string;
  tenantAvatar: string;
  tenantAvatarUrl: string | null;
  tenantEmail: string | null;
  tenantPhone: string | null;
  unitNumber: string | null;
  propertyName: string | null;
  unitProperty: string;
  type: string;
  amount: number;
  dueDate: string;
  paidDate: string | null;
  status: string;
  description: string | null;
  notes: PaymentNoteOut[];
  statusUpdatedByName: string | null;
  statusUpdatedAt: string | null;
}

// ─── Mock data ────────────────────────────────────────────────────────────────

const MOCK_PAYMENTS: PaymentRow[] = [
  { id: "p1", leaseId: "l1", tenantName: "Emma Jones", tenantAvatar: "EJ", tenantAvatarUrl: null, tenantEmail: "emma@example.com", tenantPhone: "+15550000001", unitNumber: "101", propertyName: "Sunset Towers", unitProperty: "101 · Sunset Towers", type: "RENT", amount: 2400, dueDate: "2026-06-01", paidDate: "2026-06-01", status: "PAID", description: "Rent — June 2026", notes: [], statusUpdatedByName: "Alex Owner", statusUpdatedAt: "2026-06-01T14:32:00Z" },
  { id: "p2", leaseId: "l2", tenantName: "Marcus Lee", tenantAvatar: "ML", tenantAvatarUrl: null, tenantEmail: "marcus@example.com", tenantPhone: "+15550000002", unitNumber: "103", propertyName: "Sunset Towers", unitProperty: "103 · Sunset Towers", type: "RENT", amount: 2750, dueDate: "2026-06-01", paidDate: null, status: "OVERDUE", description: "Rent — June 2026", notes: [], statusUpdatedByName: null, statusUpdatedAt: null },
  { id: "p3", leaseId: "l3", tenantName: "Sarah Kim", tenantAvatar: "SK", tenantAvatarUrl: null, tenantEmail: "sarah@example.com", tenantPhone: null, unitNumber: "A1", propertyName: "Cedar Row", unitProperty: "A1 · Cedar Row", type: "RENT", amount: 3100, dueDate: "2026-07-01", paidDate: null, status: "PENDING", description: "Rent — July 2026", notes: [], statusUpdatedByName: null, statusUpdatedAt: null },
  { id: "p4", leaseId: "l1", tenantName: "Emma Jones", tenantAvatar: "EJ", tenantAvatarUrl: null, tenantEmail: "emma@example.com", tenantPhone: "+15550000001", unitNumber: "101", propertyName: "Sunset Towers", unitProperty: "101 · Sunset Towers", type: "LATE_FEE", amount: 120, dueDate: "2026-05-06", paidDate: null, status: "OVERDUE", description: "Late fee — May 2026", notes: [], statusUpdatedByName: null, statusUpdatedAt: null },
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
    tenantEmail: p.tenant_email ?? null,
    tenantPhone: p.tenant_phone ?? null,
    unitNumber: p.unit_number ?? null,
    propertyName: p.property_name ?? null,
    unitProperty: [p.unit_number, p.property_name].filter(Boolean).join(" · "),
    type: p.payment_type,
    amount: p.amount,
    dueDate: String(p.due_date),
    paidDate: p.paid_date ? String(p.paid_date) : null,
    status: p.status,
    description: p.description,
    notes: p.notes ?? [],
    statusUpdatedByName: p.status_updated_by_name ?? null,
    statusUpdatedAt: p.status_updated_at ?? null,
  };
}

function formatStatusUpdated(name: string | null, at: string | null): string | null {
  if (!name || !at) return null;
  const d = new Date(at);
  const dateStr = d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  const timeStr = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return `${name} · ${dateStr} ${timeStr}`;
}

function fmtNoteDt(s: string | null) {
  if (!s) return "—";
  return new Date(s).toLocaleString("en-CA", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
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
  due_date: string; paid_date: string; description: string;
}

const BLANK_ADD: AddForm = {
  lease_id: "", payment_type: "RENT", amount: "",
  due_date: "", paid_date: "", description: "",
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
  paid_date: string; status: string; description: string;
}

function EditPaymentModal({ payment, onClose, onSaved, onNotesChanged }: {
  payment: PaymentRow; onClose: () => void; onSaved: (p: PaymentRow) => void;
  onNotesChanged?: (paymentId: string, notes: PaymentNoteOut[]) => void;
}) {
  const { user } = useAuth();
  const [form, setForm] = useState<EditForm>({
    payment_type: payment.type,
    amount: String(payment.amount),
    due_date: payment.dueDate,
    paid_date: payment.paidDate ?? "",
    status: payment.status,
    description: payment.description ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notes, setNotes] = useState<PaymentNoteOut[]>(payment.notes);
  const [newNote, setNewNote] = useState("");
  const [addingNote, setAddingNote] = useState(false);
  const [showNotice, setShowNotice] = useState(false);
  const [noticeInstructions, setNoticeInstructions] = useState("");
  const [noticeSubject, setNoticeSubject] = useState("");
  const [noticeMessage, setNoticeMessage] = useState("");
  const [noticeChannels, setNoticeChannels] = useState({ email: !!payment.tenantEmail, sms: !!payment.tenantPhone });
  const [generatingNotice, setGeneratingNotice] = useState(false);
  const [sendingNotice, setSendingNotice] = useState(false);
  const [noticeError, setNoticeError] = useState("");
  const [noticeResult, setNoticeResult] = useState<string | null>(null);
  const [showNoticePreview, setShowNoticePreview] = useState(false);
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
      });
      onSaved(fromApi(saved));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally { setSaving(false); }
  }

  async function addNote() {
    const text = newNote.trim();
    if (!text) return;
    setAddingNote(true); setError("");
    try {
      const saved = await paymentsApi.addNote(payment.id, text);
      setNotes(saved.notes);
      onNotesChanged?.(payment.id, saved.notes);
      setNewNote("");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not add note");
    } finally { setAddingNote(false); }
  }

  async function deleteNote(noteId: string) {
    await paymentsApi.removeNote(payment.id, noteId);
    setNotes(prev => {
      const next = prev.filter(n => n.id !== noteId);
      onNotesChanged?.(payment.id, next);
      return next;
    });
  }

  async function handleGenerateNotice() {
    setGeneratingNotice(true); setNoticeError(""); setNoticeResult(null);
    try {
      const out = await paymentsApi.aiGenerateNotice(payment.id, noticeInstructions || undefined);
      setNoticeSubject(out.subject);
      setNoticeMessage(out.message);
    } catch (e: unknown) {
      setNoticeError(e instanceof Error ? e.message : "Failed to generate");
    } finally { setGeneratingNotice(false); }
  }

  async function handleSendNotice() {
    const channels = [
      ...(noticeChannels.email ? ["email"] : []),
      ...(noticeChannels.sms ? ["sms"] : []),
    ];
    if (channels.length === 0 || !noticeMessage.trim()) return;
    setSendingNotice(true); setNoticeError(""); setNoticeResult(null);
    try {
      const out = await paymentsApi.sendNotice(payment.id, {
        subject: noticeSubject || "Overdue rent payment",
        message: noticeMessage,
        channels,
      });
      setNotes(out.payment.notes);
      onNotesChanged?.(payment.id, out.payment.notes);
      const sentVia = [out.email_sent && "email", out.sms_sent && "SMS"].filter(Boolean).join(" and ");
      let msg = sentVia ? `Sent via ${sentVia}.` : "Nothing was sent.";
      if (out.skipped_channels.length) msg += ` Skipped: ${out.skipped_channels.join(", ")}.`;
      setNoticeResult(msg);
    } catch (e: unknown) {
      setNoticeError(e instanceof Error ? e.message : "Could not send notice");
    } finally { setSendingNotice(false); }
  }

  function handlePrintNotice() {
    setNoticeError("");
    const win = window.open("", "_blank", "width=650,height=800");
    if (!win) {
      setNoticeError("Could not open the print window — check your browser's popup blocker and try again.");
      return;
    }
    const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    win.document.write(`<!DOCTYPE html>
<html>
<head>
<title>${esc(noticeSubject || "Overdue rent notice")}</title>
<style>
  body { font-family: Arial, Helvetica, sans-serif; padding: 48px; color: #111; max-width: 650px; margin: 0 auto; }
  .meta { color: #555; font-size: 13px; margin-bottom: 24px; line-height: 1.7; border-bottom: 1px solid #ddd; padding-bottom: 16px; }
  .meta strong { color: #111; }
  .subject { font-size: 20px; font-weight: 700; margin: 20px 0; }
  .message { white-space: pre-wrap; line-height: 1.7; font-size: 14px; }
</style>
</head>
<body>
  <div class="meta">
    <div><strong>To:</strong> ${esc(payment.tenantName)}${payment.tenantEmail ? ` &lt;${esc(payment.tenantEmail)}&gt;` : ""}</div>
    <div><strong>Unit:</strong> ${esc(payment.unitProperty)}</div>
    <div><strong>Date:</strong> ${esc(new Date().toLocaleDateString())}</div>
  </div>
  <div class="subject">${esc(noticeSubject || "Overdue rent notice")}</div>
  <div class="message">${esc(noticeMessage)}</div>
</body>
</html>`);
    win.document.close();
    win.focus();
    win.print();
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
          <div className="flex items-center gap-3 bg-slate-50 rounded-lg px-3 py-2.5">
            <Avatar ini={payment.tenantAvatar} url={payment.tenantAvatarUrl} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-slate-900 truncate">{payment.tenantName}</p>
              <p className="text-xs text-slate-500 truncate">{payment.unitProperty}</p>
            </div>
            <div className="text-right shrink-0">
              <p className={`text-xs ${payment.tenantEmail ? "text-slate-600" : "text-slate-300"}`}>{payment.tenantEmail ?? "No email"}</p>
              <p className={`text-xs ${payment.tenantPhone ? "text-slate-600" : "text-slate-300"}`}>{payment.tenantPhone ?? "No phone"}</p>
            </div>
          </div>
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
          {payment.status === "OVERDUE" && (
            <div className="border-t border-slate-100 pt-3">
              <button
                type="button"
                onClick={() => setShowNotice(v => !v)}
                className="text-xs font-semibold text-violet-600 hover:text-violet-700"
              >
                {showNotice ? "− Hide overdue notice" : "✨ Send overdue notice"}
              </button>
              {showNotice && (
                <div className="mt-2 bg-violet-50 border border-violet-100 rounded-lg p-3 space-y-2">
                  {noticeError && <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{noticeError}</p>}
                  {noticeResult && <p className="text-xs text-emerald-700 bg-emerald-50 rounded-lg px-3 py-2">{noticeResult}</p>}
                  <div>
                    <label className="block text-[13px] font-medium text-slate-600 mb-1">Extra instructions (optional)</label>
                    <input
                      value={noticeInstructions}
                      onChange={e => setNoticeInstructions(e.target.value)}
                      placeholder="e.g. mention a 5% late fee applies after day 5"
                      className="w-full text-sm border border-violet-200 rounded-lg px-3 py-2 outline-none focus:border-violet-500 bg-white"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleGenerateNotice}
                    disabled={generatingNotice}
                    className="px-3 py-1.5 text-xs font-medium bg-violet-600 text-white rounded-lg hover:bg-violet-700 disabled:opacity-50"
                  >
                    {generatingNotice ? "Generating…" : "✨ Generate with AI"}
                  </button>
                  <div>
                    <label className="block text-[13px] font-medium text-slate-600 mb-1">Subject</label>
                    <input
                      value={noticeSubject}
                      onChange={e => setNoticeSubject(e.target.value)}
                      placeholder="Overdue rent payment"
                      className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-black bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[13px] font-medium text-slate-600 mb-1">Message</label>
                    <textarea
                      value={noticeMessage}
                      onChange={e => setNoticeMessage(e.target.value)}
                      rows={4}
                      placeholder="Write or generate the notice message…"
                      className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-black bg-white resize-y"
                    />
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setShowNoticePreview(v => !v)}
                      disabled={!noticeMessage.trim()}
                      className="text-xs font-medium text-slate-600 hover:text-slate-900 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {showNoticePreview ? "Hide preview" : "👁 Preview"}
                    </button>
                    <button
                      type="button"
                      onClick={handlePrintNotice}
                      disabled={!noticeMessage.trim()}
                      className="text-xs font-medium text-slate-600 hover:text-slate-900 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      🖨 Print
                    </button>
                  </div>
                  {showNoticePreview && noticeMessage.trim() && (
                    <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
                      <div className="px-4 py-2.5 border-b border-slate-100 bg-slate-50 space-y-0.5">
                        <p className="text-xs text-slate-500">
                          <span className="font-medium text-slate-700">To:</span> {payment.tenantName}
                          {payment.tenantEmail && ` <${payment.tenantEmail}>`}
                        </p>
                        <p className="text-sm font-semibold text-slate-900">{noticeSubject || "Overdue rent notice"}</p>
                      </div>
                      <div className="px-4 py-3 text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">
                        {noticeMessage}
                      </div>
                    </div>
                  )}
                  <div className="flex items-center gap-4">
                    <label className={`flex items-center gap-1.5 text-xs ${payment.tenantEmail ? "text-slate-700" : "text-slate-300"}`}>
                      <input
                        type="checkbox"
                        checked={noticeChannels.email}
                        disabled={!payment.tenantEmail}
                        onChange={e => setNoticeChannels(c => ({ ...c, email: e.target.checked }))}
                      />
                      Email{!payment.tenantEmail && " (no email on file)"}
                    </label>
                    <label className={`flex items-center gap-1.5 text-xs ${payment.tenantPhone ? "text-slate-700" : "text-slate-300"}`}>
                      <input
                        type="checkbox"
                        checked={noticeChannels.sms}
                        disabled={!payment.tenantPhone}
                        onChange={e => setNoticeChannels(c => ({ ...c, sms: e.target.checked }))}
                      />
                      SMS{!payment.tenantPhone && " (no phone on file)"}
                    </label>
                  </div>
                  <button
                    type="button"
                    onClick={handleSendNotice}
                    disabled={sendingNotice || !noticeMessage.trim() || (!noticeChannels.email && !noticeChannels.sms)}
                    className="w-full px-4 py-2 text-sm font-medium bg-black text-white rounded-lg hover:bg-slate-800 disabled:opacity-50"
                  >
                    {sendingNotice ? "Sending…" : "Send notice"}
                  </button>
                </div>
              )}
            </div>
          )}
          <div className="border-t border-slate-100 pt-3">
            <p className="text-[13px] uppercase tracking-wider font-medium text-slate-400 mb-2">Notes ({notes.length})</p>
            {notes.length > 0 && (
              <div className="space-y-2 mb-2 max-h-44 overflow-y-auto pr-1">
                {notes.map(n => (
                  <div key={n.id} className="bg-slate-50 rounded-lg px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-medium text-slate-700">{n.author_name}</p>
                      <div className="flex items-center gap-2 shrink-0">
                        <p className="text-[13px] text-slate-400">{fmtNoteDt(n.created_at)}</p>
                        {n.author_user_id === user?.id && (
                          <button type="button" onClick={() => deleteNote(n.id)} className="text-[13px] text-slate-400 hover:text-red-500">Delete</button>
                        )}
                      </div>
                    </div>
                    <p className="text-sm text-slate-700 whitespace-pre-wrap mt-0.5">{n.note}</p>
                  </div>
                ))}
              </div>
            )}
            <textarea value={newNote} onChange={e => setNewNote(e.target.value)} rows={2} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-black resize-none" placeholder="Add a note…" />
            <button type="button" onClick={addNote} disabled={addingNote || !newNote.trim()}
              className="mt-1.5 w-full px-4 py-2 border border-slate-200 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">
              {addingNote ? "Adding…" : "Add note"}
            </button>
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

// ─── Batch overdue notice modal ────────────────────────────────────────────────

interface BatchRow {
  paymentId: string;
  tenantName: string;
  tenantAvatar: string;
  tenantAvatarUrl: string | null;
  tenantEmail: string | null;
  tenantPhone: string | null;
  unitProperty: string;
  amount: number;
  dueDate: string;
  selected: boolean;
  subject: string;
  message: string;
  channels: { email: boolean; sms: boolean };
  generating: boolean;
  genError: string | null;
  sendStatus: "idle" | "sending" | "sent" | "error";
  sendMessage: string | null;
  lastNoticeSentAt: string | null;
}

function lastNoticeSentAt(notes: PaymentNoteOut[]): string | null {
  const sent = notes.filter(n => n.note.startsWith("Overdue notice sent") && n.created_at);
  if (sent.length === 0) return null;
  return sent.reduce((latest, n) => (n.created_at! > latest ? n.created_at! : latest), sent[0].created_at!);
}

function BatchNoticeModal({ payments, onClose, onDone }: {
  payments: PaymentRow[]; onClose: () => void; onDone: () => void;
}) {
  const overdue = useMemo(() => payments.filter(p => p.status === "OVERDUE"), [payments]);
  const [rows, setRows] = useState<BatchRow[]>(() => overdue.map(p => ({
    paymentId: p.id,
    tenantName: p.tenantName,
    tenantAvatar: p.tenantAvatar,
    tenantAvatarUrl: p.tenantAvatarUrl,
    tenantEmail: p.tenantEmail,
    tenantPhone: p.tenantPhone,
    unitProperty: p.unitProperty,
    amount: p.amount,
    dueDate: p.dueDate,
    selected: true,
    subject: "",
    message: "",
    channels: { email: !!p.tenantEmail, sms: !!p.tenantPhone },
    generating: false,
    genError: null,
    sendStatus: "idle",
    sendMessage: null,
    lastNoticeSentAt: lastNoticeSentAt(p.notes),
  })));
  const [generatingAll, setGeneratingAll] = useState(false);
  const [sendingAll, setSendingAll] = useState(false);
  const [done, setDone] = useState(false);

  const selectedCount = rows.filter(r => r.selected).length;
  const allSelected = rows.length > 0 && selectedCount === rows.length;

  function updateRow(paymentId: string, patch: Partial<BatchRow>) {
    setRows(prev => prev.map(r => r.paymentId === paymentId ? { ...r, ...patch } : r));
  }

  async function generateOne(paymentId: string) {
    updateRow(paymentId, { generating: true, genError: null });
    try {
      const out = await paymentsApi.aiGenerateNotice(paymentId);
      updateRow(paymentId, { subject: out.subject, message: out.message, generating: false });
    } catch (e: unknown) {
      updateRow(paymentId, { generating: false, genError: e instanceof Error ? e.message : "Failed to generate" });
    }
  }

  async function handleGenerateAll() {
    setGeneratingAll(true);
    await Promise.all(rows.filter(r => r.selected).map(r => generateOne(r.paymentId)));
    setGeneratingAll(false);
  }

  async function handleSendAll() {
    setSendingAll(true);
    const targets = rows.filter(r => r.selected && r.message.trim() && (r.channels.email || r.channels.sms));
    setRows(prev => prev.map(r => targets.some(t => t.paymentId === r.paymentId) ? { ...r, sendStatus: "sending" } : r));
    await Promise.all(targets.map(async r => {
      const channels = [...(r.channels.email ? ["email"] : []), ...(r.channels.sms ? ["sms"] : [])];
      try {
        const out = await paymentsApi.sendNotice(r.paymentId, {
          subject: r.subject || "Overdue rent payment",
          message: r.message,
          channels,
        });
        const sentVia = [out.email_sent && "email", out.sms_sent && "SMS"].filter(Boolean).join(" and ");
        updateRow(r.paymentId, {
          sendStatus: "sent",
          sendMessage: sentVia ? `Sent via ${sentVia}` : "Nothing was sent",
        });
      } catch (e: unknown) {
        updateRow(r.paymentId, { sendStatus: "error", sendMessage: e instanceof Error ? e.message : "Failed to send" });
      }
    }));
    setSendingAll(false);
    setDone(true);
    onDone();
  }

  const sentCount = rows.filter(r => r.sendStatus === "sent").length;
  const errorCount = rows.filter(r => r.sendStatus === "error").length;

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 sticky top-0 bg-white z-10">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Send overdue notices</h2>
            <p className="text-xs text-slate-400 mt-0.5">{rows.length} overdue payment{rows.length === 1 ? "" : "s"}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-lg leading-none">✕</button>
        </div>

        <div className="px-6 py-4 border-b border-slate-100 flex flex-wrap items-center gap-3 sticky top-[57px] bg-white z-10">
          <label className="flex items-center gap-1.5 text-xs text-slate-600">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={e => setRows(prev => prev.map(r => ({ ...r, selected: e.target.checked })))}
            />
            Select all
          </label>
          <span className="text-xs text-slate-400">{selectedCount} selected</span>
          <div className="flex-1" />
          <button
            type="button"
            onClick={handleGenerateAll}
            disabled={generatingAll || selectedCount === 0}
            className="px-3 py-1.5 text-xs font-medium bg-violet-600 text-white rounded-lg hover:bg-violet-700 disabled:opacity-50"
          >
            {generatingAll ? "Generating…" : "✨ Generate all with AI"}
          </button>
          <button
            type="button"
            onClick={handleSendAll}
            disabled={sendingAll || selectedCount === 0 || rows.filter(r => r.selected).every(r => !r.message.trim())}
            className="px-3 py-1.5 text-xs font-medium bg-black text-white rounded-lg hover:bg-slate-800 disabled:opacity-50"
          >
            {sendingAll ? "Sending…" : `Send to ${selectedCount}`}
          </button>
        </div>

        {done && (
          <div className="mx-6 mt-4 px-3 py-2 rounded-lg bg-emerald-50 text-emerald-700 text-xs">
            Sent {sentCount} of {targetCountLabel(rows)}.{errorCount > 0 ? ` ${errorCount} failed — see details below.` : ""}
          </div>
        )}

        <div className="px-6 py-4 space-y-3">
          {rows.length === 0 && <p className="text-xs text-slate-400 text-center py-6">No overdue payments.</p>}
          {rows.map(r => (
            <div key={r.paymentId} className={`border rounded-lg p-3 ${r.sendStatus === "sent" ? "border-emerald-200 bg-emerald-50/40" : r.sendStatus === "error" ? "border-red-200 bg-red-50/40" : "border-slate-200"}`}>
              <div className="flex items-center gap-2.5 mb-2">
                <input
                  type="checkbox"
                  checked={r.selected}
                  onChange={e => updateRow(r.paymentId, { selected: e.target.checked })}
                />
                <Avatar ini={r.tenantAvatar} url={r.tenantAvatarUrl} />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-slate-900 truncate">{r.tenantName}</p>
                  <p className="text-[13px] text-slate-400 truncate">{r.unitProperty} · ${r.amount.toLocaleString()} due {r.dueDate}</p>
                  <p className="text-[13px] text-slate-400 truncate">
                    <span className={r.tenantEmail ? "" : "text-slate-300"}>{r.tenantEmail ?? "No email"}</span>
                    {" · "}
                    <span className={r.tenantPhone ? "" : "text-slate-300"}>{r.tenantPhone ?? "No phone"}</span>
                  </p>
                  {r.lastNoticeSentAt && (
                    <p className="text-[13px] text-amber-600 truncate">Last notice sent: {fmtNoteDt(r.lastNoticeSentAt)}</p>
                  )}
                </div>
                {r.sendStatus === "sent" && <span className="text-[13px] font-medium text-emerald-600 shrink-0">✓ {r.sendMessage}</span>}
                {r.sendStatus === "error" && <span className="text-[13px] font-medium text-red-600 shrink-0">✗ {r.sendMessage}</span>}
                {r.sendStatus === "sending" && <span className="text-[13px] text-slate-400 shrink-0">Sending…</span>}
                {r.sendStatus === "idle" && (
                  <button
                    type="button"
                    onClick={() => generateOne(r.paymentId)}
                    disabled={r.generating}
                    className="text-[13px] font-medium text-violet-600 hover:text-violet-700 shrink-0 disabled:opacity-50"
                  >
                    {r.generating ? "Generating…" : "✨ Generate"}
                  </button>
                )}
              </div>
              {r.genError && <p className="text-[13px] text-red-600 mb-2">{r.genError}</p>}
              {r.sendStatus !== "sent" && (
                <div className="space-y-1.5">
                  <input
                    value={r.subject}
                    onChange={e => updateRow(r.paymentId, { subject: e.target.value })}
                    placeholder="Subject"
                    className="w-full text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 outline-none focus:border-black"
                  />
                  <textarea
                    value={r.message}
                    onChange={e => updateRow(r.paymentId, { message: e.target.value })}
                    placeholder="Write or generate the notice message…"
                    rows={2}
                    className="w-full text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 outline-none focus:border-black resize-y"
                  />
                  <div className="flex items-center gap-3">
                    <label className={`flex items-center gap-1 text-[13px] ${r.tenantEmail ? "text-slate-600" : "text-slate-300"}`}>
                      <input
                        type="checkbox"
                        checked={r.channels.email}
                        disabled={!r.tenantEmail}
                        onChange={e => updateRow(r.paymentId, { channels: { ...r.channels, email: e.target.checked } })}
                      />
                      Email{!r.tenantEmail && " (none)"}
                    </label>
                    <label className={`flex items-center gap-1 text-[13px] ${r.tenantPhone ? "text-slate-600" : "text-slate-300"}`}>
                      <input
                        type="checkbox"
                        checked={r.channels.sms}
                        disabled={!r.tenantPhone}
                        onChange={e => updateRow(r.paymentId, { channels: { ...r.channels, sms: e.target.checked } })}
                      />
                      SMS{!r.tenantPhone && " (none)"}
                    </label>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="flex gap-3 px-6 py-4 border-t border-slate-100 sticky bottom-0 bg-white">
          <button onClick={onClose} className="flex-1 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">
            {done ? "Close" : "Cancel"}
          </button>
        </div>
      </div>
    </div>
  );
}

function targetCountLabel(rows: BatchRow[]): number {
  return rows.filter(r => r.sendStatus === "sent" || r.sendStatus === "error").length;
}

// ─── Batch mark paid modal ──────────────────────────────────────────────────────

interface MarkPaidRow {
  paymentId: string;
  tenantName: string;
  tenantAvatar: string;
  tenantAvatarUrl: string | null;
  unitProperty: string;
  amount: number;
  dueDate: string;
  selected: boolean;
  paidDate: string;
  status: "idle" | "marking" | "done" | "error";
  errorMessage: string | null;
}

function BatchMarkPaidModal({ payments, onClose, onDone }: {
  payments: PaymentRow[]; onClose: () => void; onDone: () => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const overdue = useMemo(() => payments.filter(p => p.status === "OVERDUE"), [payments]);
  const [rows, setRows] = useState<MarkPaidRow[]>(() => overdue.map(p => ({
    paymentId: p.id,
    tenantName: p.tenantName,
    tenantAvatar: p.tenantAvatar,
    tenantAvatarUrl: p.tenantAvatarUrl,
    unitProperty: p.unitProperty,
    amount: p.amount,
    dueDate: p.dueDate,
    selected: true,
    paidDate: today,
    status: "idle",
    errorMessage: null,
  })));
  const [marking, setMarking] = useState(false);
  const [done, setDone] = useState(false);

  const selectedCount = rows.filter(r => r.selected).length;
  const allSelected = rows.length > 0 && selectedCount === rows.length;
  const totalSelected = rows.filter(r => r.selected).reduce((s, r) => s + r.amount, 0);

  function updateRow(paymentId: string, patch: Partial<MarkPaidRow>) {
    setRows(prev => prev.map(r => r.paymentId === paymentId ? { ...r, ...patch } : r));
  }

  async function handleMarkSelected() {
    setMarking(true);
    const targets = rows.filter(r => r.selected);
    setRows(prev => prev.map(r => targets.some(t => t.paymentId === r.paymentId) ? { ...r, status: "marking" } : r));
    await Promise.all(targets.map(async r => {
      try {
        await paymentsApi.update(r.paymentId, { paid_date: r.paidDate, status: "PAID" });
        updateRow(r.paymentId, { status: "done" });
      } catch (e: unknown) {
        updateRow(r.paymentId, { status: "error", errorMessage: e instanceof Error ? e.message : "Failed to mark paid" });
      }
    }));
    setMarking(false);
    setDone(true);
    onDone();
  }

  const doneCount = rows.filter(r => r.status === "done").length;
  const errorCount = rows.filter(r => r.status === "error").length;

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 sticky top-0 bg-white z-10">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Mark overdue as paid</h2>
            <p className="text-xs text-slate-400 mt-0.5">{rows.length} overdue payment{rows.length === 1 ? "" : "s"}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-lg leading-none">✕</button>
        </div>

        <div className="px-6 py-4 border-b border-slate-100 flex flex-wrap items-center gap-3 sticky top-[57px] bg-white z-10">
          <label className="flex items-center gap-1.5 text-xs text-slate-600">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={e => setRows(prev => prev.map(r => ({ ...r, selected: e.target.checked })))}
            />
            Select all
          </label>
          <span className="text-xs text-slate-400">{selectedCount} selected · ${totalSelected.toLocaleString()}</span>
          <div className="flex-1" />
          <button
            type="button"
            onClick={handleMarkSelected}
            disabled={marking || selectedCount === 0}
            className="px-3 py-1.5 text-xs font-medium bg-black text-white rounded-lg hover:bg-slate-800 disabled:opacity-50"
          >
            {marking ? "Marking…" : `Mark ${selectedCount} as paid`}
          </button>
        </div>

        {done && (
          <div className="mx-6 mt-4 px-3 py-2 rounded-lg bg-emerald-50 text-emerald-700 text-xs">
            Marked {doneCount} of {doneCount + errorCount} as paid.{errorCount > 0 ? ` ${errorCount} failed — see details below.` : ""}
          </div>
        )}

        <div className="px-6 py-4 space-y-2">
          {rows.length === 0 && <p className="text-xs text-slate-400 text-center py-6">No overdue payments.</p>}
          {rows.map(r => (
            <div key={r.paymentId} className={`flex items-center gap-2.5 border rounded-lg p-3 ${r.status === "done" ? "border-emerald-200 bg-emerald-50/40" : r.status === "error" ? "border-red-200 bg-red-50/40" : "border-slate-200"}`}>
              <input
                type="checkbox"
                checked={r.selected}
                disabled={r.status === "done"}
                onChange={e => updateRow(r.paymentId, { selected: e.target.checked })}
              />
              <Avatar ini={r.tenantAvatar} url={r.tenantAvatarUrl} />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-slate-900 truncate">{r.tenantName}</p>
                <p className="text-[13px] text-slate-400 truncate">{r.unitProperty} · ${r.amount.toLocaleString()} due {r.dueDate}</p>
                {r.status === "error" && <p className="text-[13px] text-red-600 mt-0.5">{r.errorMessage}</p>}
              </div>
              {r.status === "idle" && (
                <input
                  type="date"
                  value={r.paidDate}
                  onChange={e => updateRow(r.paymentId, { paidDate: e.target.value })}
                  className="text-xs border border-slate-200 rounded-lg px-2 py-1 outline-none focus:border-black"
                />
              )}
              {r.status === "marking" && <span className="text-[13px] text-slate-400 shrink-0">Marking…</span>}
              {r.status === "done" && <span className="text-[13px] font-medium text-emerald-600 shrink-0">✓ Paid {r.paidDate}</span>}
              {r.status === "error" && <span className="text-[13px] font-medium text-red-600 shrink-0">✗ Failed</span>}
            </div>
          ))}
        </div>

        <div className="flex gap-3 px-6 py-4 border-t border-slate-100 sticky bottom-0 bg-white">
          <button onClick={onClose} className="flex-1 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">
            {done ? "Close" : "Cancel"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Notice history modal ──────────────────────────────────────────────────────

interface NoticeHistoryEntry {
  noteId: string;
  createdAt: string | null;
  authorName: string;
  noteText: string;
  paymentId: string;
  tenantName: string;
  tenantAvatar: string;
  tenantAvatarUrl: string | null;
  unitProperty: string;
  amount: number;
}

const NOTICE_HISTORY_PAGE_SIZE = 6;

function NoticeHistoryModal({ payments, onClose }: { payments: PaymentRow[]; onClose: () => void }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const toggle = (id: string) => setExpanded(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const entries = useMemo<NoticeHistoryEntry[]>(() => {
    const list: NoticeHistoryEntry[] = [];
    for (const p of payments) {
      for (const n of p.notes) {
        if (n.note.startsWith("Overdue notice sent")) {
          list.push({
            noteId: n.id,
            createdAt: n.created_at,
            authorName: n.author_name,
            noteText: n.note,
            paymentId: p.id,
            tenantName: p.tenantName,
            tenantAvatar: p.tenantAvatar,
            tenantAvatarUrl: p.tenantAvatarUrl,
            unitProperty: p.unitProperty,
            amount: p.amount,
          });
        }
      }
    }
    return list.sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
  }, [payments]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter(e =>
      e.tenantName.toLowerCase().includes(q) ||
      e.unitProperty.toLowerCase().includes(q) ||
      e.noteText.toLowerCase().includes(q) ||
      e.authorName.toLowerCase().includes(q)
    );
  }, [entries, search]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / NOTICE_HISTORY_PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const pageEntries = filtered.slice(currentPage * NOTICE_HISTORY_PAGE_SIZE, currentPage * NOTICE_HISTORY_PAGE_SIZE + NOTICE_HISTORY_PAGE_SIZE);

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 sticky top-0 bg-white">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Overdue notice history</h2>
            <p className="text-xs text-slate-400 mt-0.5">{entries.length} notice{entries.length === 1 ? "" : "s"} sent</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-lg leading-none">✕</button>
        </div>
        <div className="px-6 py-3 border-b border-slate-100 sticky top-[57px] bg-white">
          <input
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(0); }}
            placeholder="Search tenant, unit, message…"
            className="w-full text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 outline-none focus:border-black"
          />
        </div>
        <div className="px-6 py-4 space-y-2">
          {filtered.length === 0 && (
            <p className="text-xs text-slate-400 text-center py-6">
              {entries.length === 0 ? "No overdue notices have been sent yet." : "No notices match your search."}
            </p>
          )}
          {pageEntries.map(e => {
            const lines = e.noteText.split("\n");
            const summary = lines[0];
            const detail = lines.slice(1).join("\n");
            const isExpanded = expanded.has(e.noteId);
            return (
              <div
                key={e.noteId}
                onClick={detail ? () => toggle(e.noteId) : undefined}
                role={detail ? "button" : undefined}
                tabIndex={detail ? 0 : undefined}
                onKeyDown={detail ? (ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); toggle(e.noteId); } } : undefined}
                className={`border border-slate-200 rounded-lg p-3 ${detail ? "cursor-pointer hover:bg-slate-50" : ""}`}
              >
                <div className="flex items-center gap-2.5 mb-1.5">
                  <Avatar ini={e.tenantAvatar} url={e.tenantAvatarUrl} />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-slate-900 truncate">{e.tenantName}</p>
                    <p className="text-[13px] text-slate-400 truncate">{e.unitProperty} · ${e.amount.toLocaleString()}</p>
                  </div>
                  <p className="text-[13px] text-slate-400 shrink-0">{fmtNoteDt(e.createdAt)}</p>
                </div>
                <p className="text-xs text-slate-700">{summary}</p>
                {isExpanded && detail && (
                  <p className="text-xs text-slate-600 whitespace-pre-wrap bg-slate-50 rounded-lg p-2 mt-1.5">{detail}</p>
                )}
                <p className="text-[13px] text-slate-400 mt-0.5">by {e.authorName}</p>
              </div>
            );
          })}
        </div>
        {filtered.length > 0 && (
          <div className="flex items-center justify-between px-6 pb-4 text-xs text-slate-500">
            <span>Page {currentPage + 1} of {pageCount}</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={currentPage === 0}
                className="px-2.5 py-1 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40"
              >
                ← Prev
              </button>
              <button
                type="button"
                onClick={() => setPage(p => Math.min(pageCount - 1, p + 1))}
                disabled={currentPage >= pageCount - 1}
                className="px-2.5 py-1 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40"
              >
                Next →
              </button>
            </div>
          </div>
        )}
        <div className="flex gap-3 px-6 py-4 border-t border-slate-100 sticky bottom-0 bg-white">
          <button onClick={onClose} className="flex-1 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">
            Close
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
    <div className="w-7 h-7 rounded-full bg-black text-white text-[12px] font-bold flex items-center justify-center shrink-0">{ini}</div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type ModalState = { type: "none" } | { type: "add" } | { type: "edit"; payment: PaymentRow } | { type: "void"; payment: PaymentRow } | { type: "batchNotice" } | { type: "noticeHistory" } | { type: "batchMarkPaid" };

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
  const [periodFilter, setPeriodFilter] = useState<"this_month" | "last_month" | "all">("this_month");
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

  const handleNotesChanged = useCallback((paymentId: string, notes: PaymentNoteOut[]) => {
    setPayments(prev => prev.map(x => x.id === paymentId ? { ...x, notes } : x));
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
      const data = await paymentsApi.list();
      setPayments(data.map(fromApi));
    } catch { /* silent */ } finally {
      setModal({ type: "none" });
    }
  }, []);

  const refreshPayments = useCallback(async () => {
    if (MOCK_MODE) return;
    try {
      const data = await paymentsApi.list();
      setPayments(data.map(fromApi));
    } catch { /* silent */ }
  }, []);

  const today = new Date().toISOString().slice(0, 10);
  const thisMonth = today.slice(0, 7);
  const lastMonthDate = new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1);
  const lastMonth = `${lastMonthDate.getFullYear()}-${String(lastMonthDate.getMonth() + 1).padStart(2, "0")}`;

  const unitOptions = useMemo(
    () => Array.from(new Set(payments.map(p => p.unitProperty).filter(Boolean))).sort(),
    [payments]
  );

  const filtered = payments.filter(p => {
    const matchStatus = statusFilter === "all" || p.status === statusFilter;
    const matchSearch = !search ||
      p.tenantName.toLowerCase().includes(search.toLowerCase()) ||
      p.unitProperty.toLowerCase().includes(search.toLowerCase());
    const matchPeriod = periodFilter === "all"
      || (periodFilter === "this_month" && p.dueDate.startsWith(thisMonth))
      || (periodFilter === "last_month" && p.dueDate.startsWith(lastMonth));
    return matchStatus && matchSearch && matchPeriod;
  });

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
        <EditPaymentModal payment={modal.payment} onClose={() => setModal({ type: "none" })} onSaved={handleSaved} onNotesChanged={handleNotesChanged} />
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
      {modal.type === "batchNotice" && (
        <BatchNoticeModal
          payments={payments}
          onClose={() => setModal({ type: "none" })}
          onDone={refreshPayments}
        />
      )}
      {modal.type === "noticeHistory" && (
        <NoticeHistoryModal payments={payments} onClose={() => setModal({ type: "none" })} />
      )}
      {modal.type === "batchMarkPaid" && (
        <BatchMarkPaidModal
          payments={payments}
          onClose={() => setModal({ type: "none" })}
          onDone={refreshPayments}
        />
      )}

      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <p className="text-[13px] uppercase tracking-widest text-slate-400 font-medium">Receivables</p>
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
            <p className="text-[13px] uppercase tracking-wider text-slate-400 font-medium">{k.label}</p>
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
                list="payment-unit-options"
                className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 outline-none focus:border-black w-44"
              />
              <datalist id="payment-unit-options">
                {unitOptions.map(u => <option key={u} value={u} />)}
              </datalist>
              <select value={periodFilter} onChange={e => setPeriodFilter(e.target.value as "this_month" | "last_month" | "all")} className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white outline-none focus:border-black">
                <option value="this_month">This month</option>
                <option value="last_month">Last month</option>
                <option value="all">All time</option>
              </select>
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
                  {["Tenant", "Unit", "Type", "Due", "Amount", "Paid on", "Status", ""].map(h => (
                    <th key={h} className="text-left text-[13px] font-medium text-slate-400 uppercase tracking-wider px-4 py-3 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filtered.length === 0 && (
                  <tr><td colSpan={8} className="px-4 py-8 text-center text-xs text-slate-400">No payments found.</td></tr>
                )}
                {filtered.map(p => (
                  <tr key={p.id} className={`hover:bg-slate-50 transition-colors group ${p.status === "VOIDED" ? "opacity-50" : ""}`}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <Avatar ini={p.tenantAvatar} url={p.tenantAvatarUrl} />
                        <p className="text-xs font-medium text-slate-900">{p.tenantName}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-xs text-slate-700">{p.unitNumber ?? "—"}</p>
                      <p className="text-[13px] text-slate-400 truncate max-w-[120px]">{p.propertyName ?? ""}</p>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600">{TYPE_LABELS[p.type] ?? p.type}</td>
                    <td className="px-4 py-3 text-xs text-slate-500">{p.dueDate}</td>
                    <td className="px-4 py-3 text-xs font-semibold text-slate-900">
                      <span className={p.status === "VOIDED" ? "line-through text-slate-400" : ""}>${p.amount.toLocaleString()}</span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">{p.paidDate ?? <span className="text-slate-300">—</span>}</td>
                    <td className="px-4 py-3">
                      <span
                        title={formatStatusUpdated(p.statusUpdatedByName, p.statusUpdatedAt) ?? undefined}
                        className={`inline-flex px-2 py-0.5 rounded-full text-[13px] font-medium ${STATUS_STYLES[p.status] ?? "bg-slate-100 text-slate-500"}`}
                      >
                        {STATUS_LABELS[p.status] ?? p.status}
                      </span>
                      {p.statusUpdatedByName && (
                        <p className="text-[12px] text-slate-400 mt-0.5 truncate max-w-[140px]">
                          by {p.statusUpdatedByName}
                        </p>
                      )}
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
            <div className="px-4 pt-3 space-y-2">
              {overdueCount > 0 && (
                <button
                  onClick={() => setModal({ type: "batchNotice" })}
                  className="w-full px-3 py-2 text-xs font-medium bg-violet-600 text-white rounded-lg hover:bg-violet-700"
                >
                  ✨ Send overdue notices ({overdueCount})
                </button>
              )}
              {overdueCount > 0 && (
                <button
                  onClick={() => setModal({ type: "batchMarkPaid" })}
                  className="w-full px-3 py-2 text-xs font-medium bg-emerald-600 text-white rounded-lg hover:bg-emerald-700"
                >
                  ✓ Mark overdue as paid ({overdueCount})
                </button>
              )}
              <button
                onClick={() => setModal({ type: "noticeHistory" })}
                className="w-full px-3 py-1.5 text-xs font-medium text-slate-500 border border-slate-200 rounded-lg hover:bg-slate-50 hover:text-slate-700"
              >
                📜 Notice history
              </button>
            </div>
            <div className="p-4 space-y-3">
              {payments.filter(p => p.status === "OVERDUE").slice(0, 6).map(p => (
                <div key={p.id} className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <Avatar ini={p.tenantAvatar} url={p.tenantAvatarUrl} />
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-slate-900 truncate">{p.tenantName}</p>
                      <p className="text-[13px] text-slate-400 truncate">{p.unitProperty}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs font-semibold text-red-600">${p.amount.toLocaleString()}</span>
                    <button onClick={() => handleMarkPaid(p)} className="text-[13px] text-emerald-600 hover:underline font-medium">Mark paid</button>
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
                    <p className="text-[13px] text-slate-500 leading-relaxed">{r.description}</p>
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
