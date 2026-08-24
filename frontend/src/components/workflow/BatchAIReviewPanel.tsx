"use client";

import { useEffect, useState } from "react";
import { tenantsApi, type TenantApplicationOut } from "@/lib/api";

// ─── Types ────────────────────────────────────────────────────────────────────

type ActionKind = "employer" | "landlord" | "missing_info";

interface ActionItem {
  id: string;             // `${tenantId}:emp:${empId}` | `${tenantId}:addr:${addrId}` | `${tenantId}:missing`
  tenantId: string;
  tenantName: string;
  kind: ActionKind;
  refLabel: string;
  recipientEmail: string | null;
  recipientPhone: string | null;
  sendEmail: boolean;
  sendSms: boolean;
  subject: string;
  body: string;
  status: "pending" | "sending" | "sent" | "error" | "removed";
  error?: string;
}

export interface TenantMeta {
  id: string;
  name: string;
  email: string;
  phone: string;
  docCount: number;
}

interface BatchAIReviewPanelProps {
  tenants: TenantMeta[];
  onClose: () => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const KIND_LABEL: Record<ActionKind, string> = {
  employer:      "Employer reference check",
  landlord:      "Landlord reference check",
  missing_info:  "Request more info from tenant",
};
const KIND_COLOR: Record<ActionKind, string> = {
  employer:     "bg-blue-100 text-blue-700",
  landlord:     "bg-violet-100 text-violet-700",
  missing_info: "bg-amber-100 text-amber-700",
};

async function draftForTenant(
  tenant: TenantMeta,
  include: { employer: boolean; landlord: boolean; notify: boolean },
): Promise<ActionItem[]> {
  const app: TenantApplicationOut = await tenantsApi.getApplication(tenant.id);

  const employerRefs = include.employer
    ? (app.employment_history ?? []).filter(
        e => e.employer_reference_name && (e.employer_reference_email || e.employer_reference_phone)
      )
    : [];
  const landlordRefs = include.landlord
    ? (app.address_history ?? []).filter(
        a => a.landlord_name && (a.landlord_email || a.landlord_phone)
      )
    : [];

  const missing: string[] = [];
  if (include.notify) {
    if ((app.employment_history ?? []).filter(e => e.employer_reference_name).length === 0)
      missing.push("employer_reference");
    if ((app.address_history ?? []).filter(a => a.landlord_name).length === 0)
      missing.push("landlord_reference");
    if (tenant.docCount === 0) missing.push("id_documents");
  }

  const results = await Promise.allSettled([
    ...employerRefs.map(emp =>
      emp.id
        ? tenantsApi.generateReferenceLetter(tenant.id, emp.id).then(l => ({
            id: `${tenant.id}:emp:${emp.id}`,
            tenantId: tenant.id, tenantName: tenant.name,
            kind: "employer" as ActionKind,
            refLabel: emp.employer_reference_name ?? "Employer",
            recipientEmail: emp.employer_reference_email ?? null,
            recipientPhone: emp.employer_reference_phone ?? null,
            sendEmail: !!emp.employer_reference_email,
            sendSms: !!emp.employer_reference_phone,
            subject: l.subject, body: l.body, status: "pending" as const,
          }))
        : Promise.reject()
    ),
    ...landlordRefs.map(addr =>
      addr.id
        ? tenantsApi.generateLandlordReferenceLetter(tenant.id, addr.id).then(l => ({
            id: `${tenant.id}:addr:${addr.id}`,
            tenantId: tenant.id, tenantName: tenant.name,
            kind: "landlord" as ActionKind,
            refLabel: addr.landlord_name ?? "Landlord",
            recipientEmail: addr.landlord_email ?? null,
            recipientPhone: addr.landlord_phone ?? null,
            sendEmail: !!addr.landlord_email,
            sendSms: !!addr.landlord_phone,
            subject: l.subject, body: l.body, status: "pending" as const,
          }))
        : Promise.reject()
    ),
    ...(missing.length > 0
      ? [tenantsApi.generateMissingInfoMessage(tenant.id, missing).then(l => ({
            id: `${tenant.id}:missing`,
            tenantId: tenant.id, tenantName: tenant.name,
            kind: "missing_info" as ActionKind,
            refLabel: tenant.name,
            recipientEmail: tenant.email || null,
            recipientPhone: tenant.phone || null,
            sendEmail: !!tenant.email,
            sendSms: !!tenant.phone,
            subject: l.subject, body: l.body, status: "pending" as const,
          }))]
      : []),
  ]);

  return results.flatMap(r => r.status === "fulfilled" ? [r.value] : []);
}

// ─── Step 1: Configure ────────────────────────────────────────────────────────

function ConfigureStep({
  allTenants,
  selectedIds,
  setSelectedIds,
  includeEmployer,
  setIncludeEmployer,
  includeLandlord,
  setIncludeLandlord,
  includeNotify,
  setIncludeNotify,
  onStart,
}: {
  allTenants: TenantMeta[];
  selectedIds: Set<string>;
  setSelectedIds: (s: Set<string>) => void;
  includeEmployer: boolean; setIncludeEmployer: (v: boolean) => void;
  includeLandlord: boolean; setIncludeLandlord: (v: boolean) => void;
  includeNotify: boolean;   setIncludeNotify:   (v: boolean) => void;
  onStart: () => void;
}) {
  function toggleTenant(id: string) {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelectedIds(next);
  }
  function toggleAll() {
    if (selectedIds.size === allTenants.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(allTenants.map(t => t.id)));
  }

  const allSelected = selectedIds.size === allTenants.length;
  const canStart = selectedIds.size > 0 && (includeEmployer || includeLandlord || includeNotify);

  return (
    <div className="flex-1 overflow-y-auto p-5 space-y-5">
      {/* Tenants */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-semibold text-slate-700">Tenants</p>
          <button onClick={toggleAll} className="text-[11px] text-violet-600 hover:underline font-medium">
            {allSelected ? "Deselect all" : "Select all"}
          </button>
        </div>
        <div className="space-y-1.5">
          {allTenants.map(t => (
            <label key={t.id} className="flex items-center gap-3 px-3 py-2.5 border border-slate-100 rounded-lg hover:bg-slate-50 cursor-pointer">
              <input type="checkbox" checked={selectedIds.has(t.id)} onChange={() => toggleTenant(t.id)} className="shrink-0" />
              <div className="min-w-0">
                <p className="text-xs font-medium text-slate-900 truncate">{t.name}</p>
                <p className="text-[10px] text-slate-400 truncate">{t.email}</p>
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* Action types */}
      <div>
        <p className="text-xs font-semibold text-slate-700 mb-2">Action types to send</p>
        <div className="space-y-1.5">
          {[
            { label: "Employer reference check", desc: "Email/SMS to each employer reference on file", val: includeEmployer, set: setIncludeEmployer },
            { label: "Landlord reference check", desc: "Email/SMS to each landlord reference on file", val: includeLandlord, set: setIncludeLandlord },
            { label: "Request more info from tenant", desc: "Notify tenant if references or documents are missing", val: includeNotify, set: setIncludeNotify },
          ].map(({ label, desc, val, set }) => (
            <label key={label} className="flex items-start gap-3 px-3 py-2.5 border border-slate-100 rounded-lg hover:bg-slate-50 cursor-pointer">
              <input type="checkbox" checked={val} onChange={e => set(e.target.checked)} className="shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-medium text-slate-900">{label}</p>
                <p className="text-[10px] text-slate-400">{desc}</p>
              </div>
            </label>
          ))}
        </div>
      </div>

      <button
        disabled={!canStart}
        onClick={onStart}
        className="w-full py-2.5 text-sm font-semibold bg-black text-white rounded-xl hover:bg-slate-800 disabled:opacity-40 transition-colors"
      >
        Draft letters for {selectedIds.size} tenant{selectedIds.size !== 1 ? "s" : ""}
      </button>
    </div>
  );
}

// ─── Step 2: Review ───────────────────────────────────────────────────────────

function ReviewStep({
  actions,
  update,
  sendOne,
  sendAll,
  progress,
  total,
  phase,
  onBack,
}: {
  actions: ActionItem[];
  update: (id: string, patch: Partial<ActionItem>) => void;
  sendOne: (a: ActionItem) => void;
  sendAll: () => void;
  progress: number;
  total: number;
  phase: "loading" | "ready";
  onBack: () => void;
}) {
  const pending = actions.filter(a => a.status === "pending");
  const allDone = actions.length > 0 && actions.every(a => a.status !== "pending" && a.status !== "sending");

  // Group by tenant
  const tenantNames = Array.from(new Set(actions.map(a => a.tenantName)));
  // Tenants with at least one non-removed action
  const activeTenants = tenantNames.filter(n => actions.some(a => a.tenantName === n && a.status !== "removed"));
  const removedTenants = tenantNames.filter(n => actions.every(a => a.tenantName !== n || a.status === "removed"));

  function removeAllForTenant(name: string) {
    actions.filter(a => a.tenantName === name && a.status === "pending").forEach(a => update(a.id, { status: "removed" }));
  }
  function restoreAllForTenant(name: string) {
    actions.filter(a => a.tenantName === name && a.status === "removed").forEach(a => update(a.id, { status: "pending" }));
  }

  return (
    <>
      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        {/* Loading */}
        {phase === "loading" && (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <div className="w-6 h-6 border-2 border-violet-600 border-t-transparent rounded-full animate-spin" />
            <p className="text-xs text-slate-500">Drafting letters for {progress} / {total} tenants…</p>
          </div>
        )}

        {phase === "ready" && actions.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 gap-2 text-center">
            <p className="text-sm font-medium text-slate-700">Nothing to send</p>
            <p className="text-xs text-slate-400">No matching references or missing info for the selected tenants.</p>
            <button onClick={onBack} className="mt-2 text-xs text-violet-600 hover:underline">← Back to configure</button>
          </div>
        )}

        {allDone && actions.length > 0 && (
          <div className="rounded-lg bg-green-50 border border-green-100 px-4 py-3 text-sm text-green-700 font-medium text-center">
            All actions completed.
          </div>
        )}

        {/* Active tenants */}
        {activeTenants.map(tName => {
          const group = actions.filter(a => a.tenantName === tName && a.status !== "removed");
          return (
            <div key={tName}>
              {/* Tenant header */}
              <div className="flex items-center justify-between mb-2">
                <p className="text-[11px] font-semibold text-slate-600 uppercase tracking-wide">{tName}</p>
                <button
                  onClick={() => removeAllForTenant(tName)}
                  className="text-[10px] text-slate-400 hover:text-red-500 transition-colors font-medium"
                >
                  Remove tenant
                </button>
              </div>
              <div className="space-y-2.5">
                {group.map(action => (
                  <ActionCard key={action.id} action={action} update={update} sendOne={sendOne} />
                ))}
              </div>
            </div>
          );
        })}

        {/* Removed tenants — restore section */}
        {removedTenants.length > 0 && (
          <div className="border border-dashed border-slate-200 rounded-xl p-3 space-y-1.5">
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Removed tenants</p>
            {removedTenants.map(name => (
              <div key={name} className="flex items-center justify-between">
                <span className="text-xs text-slate-500">{name}</span>
                <button onClick={() => restoreAllForTenant(name)} className="text-[11px] text-violet-600 hover:underline font-medium">
                  Add back
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      {phase === "ready" && pending.length > 0 && (
        <div className="px-5 py-4 border-t border-slate-100 shrink-0 space-y-1">
          <button onClick={sendAll}
            className="w-full py-2.5 text-sm font-semibold bg-black text-white rounded-xl hover:bg-slate-800 transition-colors">
            Send all {pending.length} action{pending.length !== 1 ? "s" : ""}
          </button>
          <p className="text-[10px] text-slate-400 text-center">Sends via selected channels to all active tenants</p>
        </div>
      )}
    </>
  );
}

// ─── Action card ──────────────────────────────────────────────────────────────

function ActionCard({
  action,
  update,
  sendOne,
}: {
  action: ActionItem;
  update: (id: string, patch: Partial<ActionItem>) => void;
  sendOne: (a: ActionItem) => void;
}) {
  return (
    <div className={`border rounded-xl overflow-hidden ${action.status === "sent" ? "border-green-200 bg-green-50/40" : "border-slate-200"}`}>
      <div className="flex items-start justify-between gap-2 px-4 pt-3 pb-2">
        <div className="space-y-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${KIND_COLOR[action.kind]}`}>
              {KIND_LABEL[action.kind]}
            </span>
            {action.status === "sent" && <span className="text-[10px] text-green-600 font-medium">✓ Sent</span>}
            {action.status === "error" && <span className="text-[10px] text-red-600">{action.error}</span>}
          </div>
          <p className="text-xs font-medium text-slate-800">To: {action.refLabel}</p>
          <p className="text-[11px] text-slate-400">
            {[action.recipientEmail, action.recipientPhone].filter(Boolean).join(" · ")}
          </p>
        </div>
        <div className="flex items-start gap-3 shrink-0">
          {/* Channel checkboxes */}
          {action.status === "pending" && (
            <div className="flex items-center gap-2.5">
              <label className={`flex items-center gap-1 text-[11px] font-medium ${!action.recipientEmail ? "opacity-30 cursor-not-allowed" : "cursor-pointer"}`}>
                <input type="checkbox" disabled={!action.recipientEmail} checked={action.sendEmail}
                  onChange={e => update(action.id, { sendEmail: e.target.checked })} />
                Email
              </label>
              <label className={`flex items-center gap-1 text-[11px] font-medium ${!action.recipientPhone ? "opacity-30 cursor-not-allowed" : "cursor-pointer"}`}>
                <input type="checkbox" disabled={!action.recipientPhone} checked={action.sendSms}
                  onChange={e => update(action.id, { sendSms: e.target.checked })} />
                SMS
              </label>
            </div>
          )}
          {/* Remove × */}
          {action.status === "pending" && (
            <button
              onClick={() => update(action.id, { status: "removed" })}
              title="Remove this action"
              className="text-slate-300 hover:text-red-400 transition-colors text-base leading-none"
            >
              ×
            </button>
          )}
        </div>
      </div>

      {action.status !== "sent" && action.status !== "removed" && (
        <div className="px-4 pb-3 space-y-2">
          {action.kind !== "missing_info" && (
            <input value={action.subject}
              onChange={e => update(action.id, { subject: e.target.value })}
              className="w-full text-xs font-medium border border-slate-200 rounded-lg px-2.5 py-1.5 outline-none focus:border-violet-400"
              placeholder="Subject" />
          )}
          <textarea rows={5} value={action.body}
            onChange={e => update(action.id, { body: e.target.value })}
            className="w-full text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 outline-none focus:border-violet-400 resize-none" />
          <div className="flex items-center gap-2">
            <button disabled={action.status === "sending"} onClick={() => sendOne(action)}
              className="px-3 py-1.5 text-xs font-medium bg-black text-white rounded-lg hover:bg-slate-800 disabled:opacity-50 transition-colors">
              {action.status === "sending" ? "Sending…" : "Confirm & send"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function BatchAIReviewPanel({ tenants, onClose }: BatchAIReviewPanelProps) {
  const [step, setStep] = useState<"configure" | "review">("configure");

  // Config state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set(tenants.map(t => t.id)));
  const [includeEmployer, setIncludeEmployer] = useState(true);
  const [includeLandlord, setIncludeLandlord] = useState(true);
  const [includeNotify, setIncludeNotify] = useState(true);

  // Review state
  const [actions, setActions] = useState<ActionItem[]>([]);
  const [phase, setPhase] = useState<"loading" | "ready">("loading");
  const [progress, setProgress] = useState(0);

  function updateAction(id: string, patch: Partial<ActionItem>) {
    setActions(prev => prev.map(a => a.id === id ? { ...a, ...patch } : a));
  }

  useEffect(() => {
    if (step !== "review") return;
    let cancelled = false;
    async function draft() {
      setPhase("loading");
      setProgress(0);
      setActions([]);
      const selected = tenants.filter(t => selectedIds.has(t.id));
      const all: ActionItem[] = [];
      for (const tenant of selected) {
        if (cancelled) return;
        const items = await draftForTenant(tenant, {
          employer: includeEmployer,
          landlord: includeLandlord,
          notify: includeNotify,
        });
        all.push(...items);
        if (!cancelled) setProgress(p => p + 1);
      }
      if (!cancelled) { setActions(all); setPhase("ready"); }
    }
    draft();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  async function sendOne(action: ActionItem) {
    if (!action.sendEmail && !action.sendSms) { updateAction(action.id, { status: "removed" }); return; }
    updateAction(action.id, { status: "sending", error: undefined });
    try {
      const channels: ("EMAIL" | "SMS")[] = [
        ...(action.sendEmail && action.recipientEmail ? (["EMAIL"] as const) : []),
        ...(action.sendSms && action.recipientPhone ? (["SMS"] as const) : []),
      ];
      // Extract the real reference id from compound action id
      const parts = action.id.split(":");
      const refId = parts[2]; // empId or addrId, undefined for missing
      for (const ch of channels) {
        if (action.kind === "employer") {
          await tenantsApi.contactEmployerReference(action.tenantId, refId, ch, { subject: action.subject, body: action.body });
        } else if (action.kind === "landlord") {
          await tenantsApi.contactLandlordReference(action.tenantId, refId, ch, { subject: action.subject, body: action.body });
        } else {
          await tenantsApi.notifyMissingInfo(action.tenantId, ch, action.subject, action.body);
        }
      }
      updateAction(action.id, { status: "sent" });
    } catch (e: unknown) {
      updateAction(action.id, { status: "error", error: e instanceof Error ? e.message : "Send failed" });
    }
  }

  async function sendAll() {
    const pending = actions.filter(a => a.status === "pending");
    await Promise.all(pending.map(sendOne));
  }

  const title = step === "configure" ? "Configure batch send" : "✨ AI Auto-Send All — Screening";
  const subtitle = step === "configure"
    ? `${tenants.length} tenant${tenants.length !== 1 ? "s" : ""} in screening`
    : `${selectedIds.size} tenant${selectedIds.size !== 1 ? "s" : ""} · review and confirm before sending`;

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex justify-end" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-lg bg-white h-full shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-start justify-between gap-3 shrink-0">
          <div>
            {step === "review" && (
              <button onClick={() => setStep("configure")} className="text-[11px] text-violet-600 hover:underline mb-1 block">← Back to configure</button>
            )}
            <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
            <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-lg leading-none">×</button>
        </div>

        {step === "configure" && (
          <ConfigureStep
            allTenants={tenants}
            selectedIds={selectedIds}
            setSelectedIds={setSelectedIds}
            includeEmployer={includeEmployer} setIncludeEmployer={setIncludeEmployer}
            includeLandlord={includeLandlord} setIncludeLandlord={setIncludeLandlord}
            includeNotify={includeNotify} setIncludeNotify={setIncludeNotify}
            onStart={() => setStep("review")}
          />
        )}

        {step === "review" && (
          <ReviewStep
            actions={actions}
            update={updateAction}
            sendOne={sendOne}
            sendAll={sendAll}
            progress={progress}
            total={selectedIds.size}
            phase={phase}
            onBack={() => setStep("configure")}
          />
        )}
      </div>
    </div>
  );
}
