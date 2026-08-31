"use client";

import { useEffect, useState } from "react";
import { tenantsApi, type TenantApplicationOut, type EmployerReferenceLetterOut } from "@/lib/api";

// ─── Types ────────────────────────────────────────────────────────────────────

type ActionKind = "employer" | "landlord" | "missing_info";

interface ActionItem {
  id: string;             // unique key (employment_id / address_id / "missing")
  kind: ActionKind;
  refLabel: string;       // display name of the recipient
  recipientEmail: string | null;
  recipientPhone: string | null;
  sendEmail: boolean;     // both default true when contact info available
  sendSms: boolean;
  subject: string;
  body: string;
  status: "pending" | "sending" | "sent" | "error" | "skipped";
  error?: string;
}

interface AIReviewPanelProps {
  tenantId: string;
  tenantName: string;
  tenantEmail: string;
  tenantPhone: string;
  docCount: number;
  onClose: () => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function kindLabel(k: ActionKind) {
  if (k === "employer") return "Employer reference check";
  if (k === "landlord") return "Landlord reference check";
  return "Request more info from tenant";
}

function kindColor(k: ActionKind) {
  if (k === "employer") return "bg-blue-100 text-blue-700";
  if (k === "landlord") return "bg-violet-100 text-violet-700";
  return "bg-amber-100 text-amber-700";
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function AIReviewPanel({ tenantId, tenantName, tenantEmail, tenantPhone, docCount, onClose }: AIReviewPanelProps) {
  const [phase, setPhase] = useState<"loading" | "ready" | "done">("loading");
  const [loadError, setLoadError] = useState("");
  const [actions, setActions] = useState<ActionItem[]>([]);

  // Draft all applicable letters on mount
  useEffect(() => {
    let cancelled = false;
    async function draft() {
      setPhase("loading");
      setLoadError("");
      try {
        const app: TenantApplicationOut = await tenantsApi.getApplication(tenantId);

        const employerRefs = (app.employment_history ?? []).filter(
          e => e.employer_reference_name && (e.employer_reference_email || e.employer_reference_phone)
        );
        const landlordRefs = (app.address_history ?? []).filter(
          a => a.landlord_name && (a.landlord_email || a.landlord_phone)
        );

        // Build missing-info list
        const missingItems: string[] = [];
        if ((app.employment_history ?? []).filter(e => e.employer_reference_name).length === 0)
          missingItems.push("employer_reference");
        if ((app.address_history ?? []).filter(a => a.landlord_name).length === 0)
          missingItems.push("landlord_reference");
        if (docCount === 0)
          missingItems.push("id_documents");

        // Draft all letters in parallel
        const draftPromises: Promise<{ id: string; kind: ActionKind; letter: EmployerReferenceLetterOut; refLabel: string; email: string | null; phone: string | null }>[] = [];

        for (const emp of employerRefs) {
          if (!emp.id) continue;
          draftPromises.push(
            tenantsApi.generateReferenceLetter(tenantId, emp.id).then(letter => ({
              id: emp.id as string,
              kind: "employer" as ActionKind,
              letter,
              refLabel: emp.employer_reference_name ?? "Employer",
              email: emp.employer_reference_email ?? null,
              phone: emp.employer_reference_phone ?? null,
            }))
          );
        }

        for (const addr of landlordRefs) {
          if (!addr.id) continue;
          draftPromises.push(
            tenantsApi.generateLandlordReferenceLetter(tenantId, addr.id).then(letter => ({
              id: addr.id as string,
              kind: "landlord" as ActionKind,
              letter,
              refLabel: addr.landlord_name ?? "Landlord",
              email: addr.landlord_email ?? null,
              phone: addr.landlord_phone ?? null,
            }))
          );
        }

        let missingDraft: { letter: EmployerReferenceLetterOut } | null = null;
        if (missingItems.length > 0) {
          missingDraft = { letter: await tenantsApi.generateMissingInfoMessage(tenantId, missingItems) };
        }

        const results = await Promise.allSettled(draftPromises);

        if (cancelled) return;

        const built: ActionItem[] = [];

        for (const result of results) {
          if (result.status === "rejected") continue;
          const { id, kind, letter, refLabel, email, phone } = result.value;
          built.push({
            id,
            kind,
            refLabel,
            recipientEmail: email,
            recipientPhone: phone,
            sendEmail: !!email,
            sendSms: !!phone,
            subject: letter.subject,
            body: letter.body,
            status: "pending",
          });
        }

        if (missingDraft) {
          built.push({
            id: "missing",
            kind: "missing_info",
            refLabel: tenantName,
            recipientEmail: tenantEmail || null,
            recipientPhone: tenantPhone || null,
            sendEmail: !!tenantEmail,
            sendSms: !!tenantPhone,
            subject: missingDraft.letter.subject,
            body: missingDraft.letter.body,
            status: "pending",
          });
        }

        setActions(built);
        setPhase(built.length === 0 ? "done" : "ready");
      } catch (e: unknown) {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : "Failed to draft letters");
      }
    }
    draft();
    return () => { cancelled = true; };
  }, [tenantId, tenantName, tenantEmail, tenantPhone]);

  function update(id: string, patch: Partial<ActionItem>) {
    setActions(prev => prev.map(a => a.id === id ? { ...a, ...patch } : a));
  }

  async function sendOne(action: ActionItem) {
    if (!action.sendEmail && !action.sendSms) {
      update(action.id, { status: "skipped" });
      return;
    }
    update(action.id, { status: "sending", error: undefined });
    try {
      const channels: ("EMAIL" | "SMS")[] = [
        ...(action.sendEmail && action.recipientEmail ? ["EMAIL" as const] : []),
        ...(action.sendSms && action.recipientPhone ? ["SMS" as const] : []),
      ];
      for (const ch of channels) {
        if (action.kind === "employer") {
          await tenantsApi.contactEmployerReference(tenantId, action.id, ch, {
            subject: action.subject,
            body: action.body,
          });
        } else if (action.kind === "landlord") {
          await tenantsApi.contactLandlordReference(tenantId, action.id, ch, {
            subject: action.subject,
            body: action.body,
          });
        } else {
          await tenantsApi.notifyMissingInfo(tenantId, ch, action.subject, action.body);
        }
      }
      update(action.id, { status: "sent" });
    } catch (e: unknown) {
      update(action.id, { status: "error", error: e instanceof Error ? e.message : "Send failed" });
    }
  }

  async function sendAll() {
    const pending = actions.filter(a => a.status === "pending");
    await Promise.all(pending.map(sendOne));
  }

  const pending = actions.filter(a => a.status === "pending");
  const allSentOrSkipped = actions.every(a => a.status === "sent" || a.status === "skipped");

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex justify-end" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-lg bg-white h-full shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-start justify-between gap-3 shrink-0">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">✨ AI Review — {tenantName}</h2>
            <p className="text-xs text-slate-500 mt-0.5">Review and confirm each action before sending</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-lg leading-none">×</button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Loading */}
          {phase === "loading" && !loadError && (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <div className="w-6 h-6 border-2 border-violet-600 border-t-transparent rounded-full animate-spin" />
              <p className="text-xs text-slate-500">AI is drafting letters…</p>
            </div>
          )}

          {/* Error */}
          {loadError && (
            <div className="rounded-lg bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-700">{loadError}</div>
          )}

          {/* No actions */}
          {phase !== "loading" && !loadError && actions.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 gap-2 text-center">
              <p className="text-sm font-medium text-slate-700">Nothing to send</p>
              <p className="text-xs text-slate-400">All references are on file and no info is missing.</p>
            </div>
          )}

          {/* All done */}
          {allSentOrSkipped && actions.length > 0 && (
            <div className="rounded-lg bg-green-50 border border-green-100 px-4 py-3 text-sm text-green-700 font-medium text-center">
              All actions completed.
            </div>
          )}

          {/* Action cards */}
          {actions.map(action => (
            <div
              key={action.id}
              className={`border rounded-xl overflow-hidden transition-opacity ${
                action.status === "skipped" ? "opacity-40" : ""
              } ${action.status === "sent" ? "border-green-200 bg-green-50/40" : "border-slate-200"}`}
            >
              {/* Card header */}
              <div className="flex items-start justify-between gap-2 px-4 pt-3 pb-2">
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className={`text-[12px] font-semibold px-1.5 py-0.5 rounded-full ${kindColor(action.kind)}`}>
                      {kindLabel(action.kind)}
                    </span>
                    {action.status === "sent" && (
                      <span className="text-[12px] text-green-600 font-medium">✓ Sent</span>
                    )}
                    {action.status === "skipped" && (
                      <span className="text-[12px] text-slate-400">Skipped</span>
                    )}
                    {action.status === "error" && (
                      <span className="text-[12px] text-red-600">{action.error}</span>
                    )}
                  </div>
                  <p className="text-xs font-medium text-slate-800">To: {action.refLabel}</p>
                  <p className="text-[13px] text-slate-400">
                    {action.recipientEmail && <span>{action.recipientEmail}</span>}
                    {action.recipientEmail && action.recipientPhone && <span> · </span>}
                    {action.recipientPhone && <span>{action.recipientPhone}</span>}
                  </p>
                </div>
                {/* Channel checkboxes — both checked by default */}
                {action.status === "pending" && (
                  <div className="flex items-center gap-2.5 shrink-0">
                    <label className={`flex items-center gap-1 text-[13px] font-medium ${!action.recipientEmail ? "opacity-30 cursor-not-allowed" : "cursor-pointer"}`}>
                      <input
                        type="checkbox"
                        disabled={!action.recipientEmail}
                        checked={action.sendEmail}
                        onChange={e => update(action.id, { sendEmail: e.target.checked })}
                      />
                      Email
                    </label>
                    <label className={`flex items-center gap-1 text-[13px] font-medium ${!action.recipientPhone ? "opacity-30 cursor-not-allowed" : "cursor-pointer"}`}>
                      <input
                        type="checkbox"
                        disabled={!action.recipientPhone}
                        checked={action.sendSms}
                        onChange={e => update(action.id, { sendSms: e.target.checked })}
                      />
                      SMS
                    </label>
                  </div>
                )}
              </div>

              {/* Editable draft */}
              {action.status !== "sent" && action.status !== "skipped" && (
                <div className="px-4 pb-3 space-y-2">
                  {action.kind !== "missing_info" && (
                    <input
                      value={action.subject}
                      onChange={e => update(action.id, { subject: e.target.value })}
                      className="w-full text-xs font-medium border border-slate-200 rounded-lg px-2.5 py-1.5 outline-none focus:border-violet-400"
                      placeholder="Subject"
                    />
                  )}
                  <textarea
                    rows={6}
                    value={action.body}
                    onChange={e => update(action.id, { body: e.target.value })}
                    className="w-full text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 outline-none focus:border-violet-400 resize-none"
                  />
                  <div className="flex items-center gap-2">
                    <button
                      disabled={action.status === "sending"}
                      onClick={() => sendOne(action)}
                      className="px-3 py-1.5 text-xs font-medium bg-black text-white rounded-lg hover:bg-slate-800 disabled:opacity-50 transition-colors"
                    >
                      {action.status === "sending" ? "Sending…" : "Confirm & send"}
                    </button>
                    <button
                      disabled={action.status === "sending"}
                      onClick={() => update(action.id, { status: "skipped" })}
                      className="px-3 py-1.5 text-xs font-medium text-slate-500 hover:text-slate-700 transition-colors"
                    >
                      Skip
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Footer */}
        {phase === "ready" && pending.length > 1 && (
          <div className="px-5 py-4 border-t border-slate-100 shrink-0">
            <button
              onClick={sendAll}
              className="w-full py-2.5 text-sm font-semibold bg-black text-white rounded-xl hover:bg-slate-800 transition-colors"
            >
              Send all {pending.length} actions
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
