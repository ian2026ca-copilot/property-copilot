"use client";

import React, { useState, useEffect } from "react";
import { paymentsApi, type PaymentOut, type PaymentNoteOut } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PaymentRow {
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function initials(name: string) {
  return name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
}

export function paymentRowFromApi(p: PaymentOut): PaymentRow {
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

function fmtNoteDt(s: string | null) {
  if (!s) return "—";
  return new Date(s).toLocaleString("en-CA", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function Avatar({ ini, url }: { ini: string; url: string | null }) {
  if (url) return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt={ini} className="w-7 h-7 rounded-full object-cover border border-slate-200 shrink-0" />
  );
  return (
    <div className="w-7 h-7 rounded-full bg-black text-white text-[12px] font-bold flex items-center justify-center shrink-0">{ini}</div>
  );
}

// ─── Edit Payment modal ───────────────────────────────────────────────────────

interface EditForm {
  payment_type: string; amount: string; due_date: string;
  paid_date: string; status: string; description: string;
}

export function EditPaymentModal({ payment, onClose, onSaved, onNotesChanged }: {
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
  const [ownerEmail, setOwnerEmail] = useState("");
  const [ownerPhone, setOwnerPhone] = useState("");
  useEffect(() => {
    if (user) {
      setOwnerEmail(e => e || user.email || "");
      setOwnerPhone(p => p || user.phone || "");
    }
  }, [user]);
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
      onSaved(paymentRowFromApi(saved));
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
        owner_email: ownerEmail.trim() || null,
        owner_phone: ownerPhone.trim() || null,
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
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[13px] font-medium text-slate-600 mb-1">Your email</label>
                      <input
                        value={ownerEmail}
                        onChange={e => setOwnerEmail(e.target.value)}
                        placeholder="owner@example.com"
                        className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-black bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[13px] font-medium text-slate-600 mb-1">Your phone</label>
                      <input
                        value={ownerPhone}
                        onChange={e => setOwnerPhone(e.target.value)}
                        placeholder="+1 (555) 000-0000"
                        className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-black bg-white"
                      />
                    </div>
                  </div>
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
          <div className="border-t border-slate-100 pt-3 space-y-4">
            {(() => {
              const noticeNotes = notes.filter(n => n.note.startsWith("Overdue notice sent"));
              if (noticeNotes.length === 0) return null;
              return (
                <div>
                  <p className="text-[13px] uppercase tracking-wider font-medium text-slate-400 mb-2">Notice history ({noticeNotes.length})</p>
                  <div className="space-y-2 max-h-44 overflow-y-auto pr-1">
                    {noticeNotes.map(n => {
                      const lines = n.note.split("\n");
                      const summary = lines[0];
                      const detail = lines.slice(1).join("\n");
                      return (
                        <div key={n.id} className="bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-xs font-medium text-blue-700">📨 {summary}</p>
                            <p className="text-[13px] text-slate-400 shrink-0">{fmtNoteDt(n.created_at)}</p>
                          </div>
                          {detail && (
                            <p className="text-xs text-slate-600 whitespace-pre-wrap mt-1">{detail}</p>
                          )}
                          <p className="text-[13px] text-slate-400 mt-0.5">by {n.author_name}</p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}
            <div>
              <p className="text-[13px] uppercase tracking-wider font-medium text-slate-400 mb-2">Notes ({notes.filter(n => !n.note.startsWith("Overdue notice sent")).length})</p>
              {notes.filter(n => !n.note.startsWith("Overdue notice sent")).length > 0 && (
                <div className="space-y-2 mb-2 max-h-44 overflow-y-auto pr-1">
                  {notes.filter(n => !n.note.startsWith("Overdue notice sent")).map(n => (
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
