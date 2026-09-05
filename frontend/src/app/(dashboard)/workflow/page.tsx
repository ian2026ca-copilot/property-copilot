"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { tenantsApi, leasesApi, paymentsApi, unitsApi, type TenantOut, type LeaseOut, type PaymentOut } from "@/lib/api";
import AIReviewPanel from "@/components/workflow/AIReviewPanel";
import BatchAIReviewPanel from "@/components/workflow/BatchAIReviewPanel";

// ─── Types ───────────────────────────────────────────────────────────────────

type WorkflowKind = "new" | "renew";

interface TenantRow {
  id: string;
  name: string;
  email: string;
  phone: string;
  kind: WorkflowKind;
  screeningStatus: string;
  lease: LeaseOut | null;
  nextPayment: PaymentOut | null;
  docCount: number;
  employerRefSent: boolean;
  landlordRefSent: boolean;
  tenantNotified: boolean;
  interestedUnitId: string | null;
  unitMonthlyRent: number | null;
  unitSecurityDeposit: number | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const SCREENING_LABEL: Record<string, { label: string; color: string }> = {
  NOT_STARTED:         { label: "Not started",        color: "bg-slate-100 text-slate-500" },
  IN_REVIEW:           { label: "In review",           color: "bg-blue-100 text-blue-700" },
  MORE_INFO_REQUESTED: { label: "More info requested", color: "bg-amber-100 text-amber-700" },
  APPROVED:            { label: "Approved",            color: "bg-green-100 text-green-700" },
  DECLINED:            { label: "Declined",            color: "bg-red-100 text-red-700" },
};


const PAYMENT_STATUS_LABEL: Record<string, { label: string; color: string }> = {
  PAID:    { label: "Paid",    color: "bg-green-100 text-green-700" },
  PENDING: { label: "Pending", color: "bg-amber-100 text-amber-700" },
  OVERDUE: { label: "Overdue", color: "bg-red-100 text-red-700" },
  VOIDED:  { label: "Voided",  color: "bg-slate-100 text-slate-500" },
};

function StatusBadge({ map, status }: { map: Record<string, { label: string; color: string }>; status: string }) {
  const s = map[status] ?? { label: status, color: "bg-slate-100 text-slate-500" };
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[12px] font-medium ${s.color}`}>
      {s.label}
    </span>
  );
}

// ─── Stage ───────────────────────────────────────────────────────────────────

type StageKey = "screening" | "lease" | "payment" | "done";

const STAGES: { key: StageKey; label: string; description: string }[] = [
  { key: "screening", label: "Screening",       description: "Application submitted & under review" },
  { key: "lease",     label: "Lease agreement", description: "Screening approved — lease being prepared" },
  { key: "payment",   label: "Payment",         description: "Lease signed — rent & deposit tracking" },
  { key: "done",      label: "Active / Done",   description: "Fully onboarded" },
];

function stageOf(row: TenantRow): StageKey {
  // Renewal with active lease → payment tracking
  if (row.kind === "renew" && row.lease?.status === "ACTIVE") return "payment";
  // Not approved → always screening (regardless of lease)
  if (row.screeningStatus !== "APPROVED") return "screening";
  // Approved: no lease → ready to create one
  if (!row.lease) return "lease";
  // If a DocuSign envelope is active, require it to be fully signed before moving to payment
  if (row.lease.docusign_envelope_id) {
    if (row.lease.signature_status === "completed") {
      if (row.nextPayment && row.nextPayment.status !== "PAID") return "payment";
      return "done";
    }
    // Envelope exists but not completed → stay in lease (pending signature)
    return "lease";
  }
  // No signature flow — use lease status directly
  if (row.lease.status === "ACTIVE") {
    if (row.nextPayment && row.nextPayment.status !== "PAID") return "payment";
    return "done";
  }
  return "lease";
}

// ─── Add-tenant modal ─────────────────────────────────────────────────────────

function AddTenantModal({
  candidates,
  onAdd,
  onClose,
}: {
  candidates: TenantRow[];
  onAdd: (row: TenantRow) => Promise<void>;
  onClose: () => void;
}) {
  const [adding, setAdding] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const filtered = candidates.filter(
    r =>
      r.name.toLowerCase().includes(search.toLowerCase()) ||
      r.email.toLowerCase().includes(search.toLowerCase())
  );

  async function handleAdd(row: TenantRow) {
    setAdding(row.id);
    await onAdd(row);
    setAdding(null);
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col max-h-[70vh]">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Add tenant to workflow</h2>
            <p className="text-xs text-slate-500 mt-0.5">Tenants not yet in screening</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-lg leading-none">×</button>
        </div>
        <div className="px-4 pt-3 shrink-0">
          <input
            autoFocus
            type="text"
            placeholder="Search by name or email…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-black"
          />
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1.5">
          {filtered.length === 0 && (
            <p className="text-xs text-slate-400 text-center py-6">
              {candidates.length === 0 ? "All tenants are already in the workflow." : "No matches."}
            </p>
          )}
          {filtered.map(row => (
            <div key={row.id} className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg border border-slate-100 hover:bg-slate-50">
              <div className="min-w-0">
                <p className="text-xs font-medium text-slate-900 truncate">{row.name}</p>
                <p className="text-[12px] text-slate-400 truncate">{row.email}</p>
              </div>
              <button
                disabled={adding === row.id}
                onClick={() => handleAdd(row)}
                className="shrink-0 px-3 py-1.5 text-xs font-medium bg-black text-white rounded-lg hover:bg-slate-800 disabled:opacity-50 transition-colors"
              >
                {adding === row.id ? "Adding…" : "Add"}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Card ─────────────────────────────────────────────────────────────────────

function TenantCard({
  row,
  onAIReview,
  onRemove,
}: {
  row: TenantRow;
  onAIReview: (row: TenantRow) => void;
  onRemove: (row: TenantRow) => void;
}) {
  const stage = stageOf(row);
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-3 space-y-2.5 hover:shadow-sm transition-shadow">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-slate-900 truncate">{row.name}</p>
          <p className="text-[12px] text-slate-400 truncate">{row.email}</p>
          {row.phone && <p className="text-[12px] text-slate-400">{row.phone}</p>}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <span className={`text-[13px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-full ${
            row.kind === "renew" ? "bg-violet-100 text-violet-700" : "bg-sky-100 text-sky-700"
          }`}>
            {row.kind === "renew" ? "Renew" : "New"}
          </span>
          <button
            onClick={() => onRemove(row)}
            title="Remove from workflow"
            className="text-slate-300 hover:text-red-400 transition-colors text-base leading-none px-0.5"
          >
            ×
          </button>
        </div>
      </div>

      {/* Screening */}
      <div className="space-y-1">
        <p className="text-[12px] font-medium text-slate-400 uppercase tracking-wide">Screening</p>
        <StatusBadge map={SCREENING_LABEL} status={row.screeningStatus} />
        {(row.employerRefSent || row.landlordRefSent || row.tenantNotified) && (
          <div className="flex flex-wrap gap-1 pt-0.5">
            {row.employerRefSent && (
              <span className="text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 px-1.5 py-0.5 rounded-full">✓ Employer ref sent</span>
            )}
            {row.landlordRefSent && (
              <span className="text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 px-1.5 py-0.5 rounded-full">✓ Landlord ref sent</span>
            )}
            {row.tenantNotified && (
              <span className="text-[11px] font-medium bg-blue-50 text-blue-700 border border-blue-200 px-1.5 py-0.5 rounded-full">✓ Tenant notified</span>
            )}
          </div>
        )}
      </div>

      {/* Lease */}
      {(stage === "lease" || stage === "payment" || stage === "done") && (
        <div className="space-y-1">
          <p className="text-[12px] font-medium text-slate-400 uppercase tracking-wide">Lease</p>
          {row.lease ? (() => {
            const sigStyles: Record<string, string> = {
              no_lease:      "bg-slate-50 text-slate-400",
              ready_to_send: "bg-violet-100 text-violet-700",
              sent:          "bg-blue-100 text-blue-700",
              delivered:     "bg-blue-100 text-blue-700",
              tenant_signed: "bg-amber-100 text-amber-700",
              completed:     "bg-emerald-100 text-emerald-700",
              declined:      "bg-red-100 text-red-600",
              voided:        "bg-slate-100 text-slate-400",
            };
            const sigLabels: Record<string, string> = {
              no_lease:      "Agreement needed",
              ready_to_send: "Need to send for signature",
              sent:          "Pending signature",
              delivered:     "Pending signature",
              tenant_signed: "Tenant signed — awaiting landlord",
              completed:     "Fully signed",
              declined:      "Declined",
              voided:        "Voided",
            };
            const rawSig = row.lease.signature_status ?? "no_lease";
            const sig = (rawSig === "new" || rawSig === "no_lease") && row.lease.document_url
              ? "ready_to_send"
              : rawSig === "new" ? "no_lease" : rawSig;
            const style = sigStyles[sig] ?? "bg-slate-100 text-slate-500";
            const label = sigLabels[sig] ?? sig;
            return (
              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[12px] font-medium ${style}`}>{label}</span>
            );
          })() : (
            <span className="text-[12px] text-slate-400">No lease yet</span>
          )}
        </div>
      )}

      {/* Payment */}
      {(stage === "payment" || stage === "done") && row.nextPayment && (
        <div className="space-y-1">
          <p className="text-[12px] font-medium text-slate-400 uppercase tracking-wide">Next payment</p>
          <div className="flex items-center gap-1.5 flex-wrap">
            <StatusBadge map={PAYMENT_STATUS_LABEL} status={row.nextPayment.status} />
            <span className="text-[12px] text-slate-500">
              ${row.nextPayment.amount.toLocaleString()} · due {row.nextPayment.due_date}
            </span>
          </div>
        </div>
      )}

      {/* Links */}
      <div className="flex items-center gap-1.5 pt-0.5 flex-wrap">
        <Link href={`/screening?tenantId=${row.id}`} className="text-[12px] font-medium text-violet-600 hover:underline">Screening</Link>
        {row.lease
          ? <Link href={`/leases?leaseId=${row.lease.id}`} className="text-[12px] font-medium text-violet-600 hover:underline">· Lease</Link>
          : <Link href={`/leases?tenant=${row.id}${row.interestedUnitId ? `&unitId=${row.interestedUnitId}` : ""}${row.unitMonthlyRent ? `&monthlyRent=${row.unitMonthlyRent}` : ""}`} className="text-[12px] font-medium text-violet-600 hover:underline">· Create Lease</Link>
        }
        {row.nextPayment && <Link href="/payments" className="text-[12px] font-medium text-violet-600 hover:underline">· Payments</Link>}
      </div>

      {/* AI auto-send */}
      {stage === "screening" && (
        <button
          onClick={() => onAIReview(row)}
          className="w-full mt-1 px-2 py-1.5 text-[13px] font-medium border border-violet-200 text-violet-700 rounded-lg hover:bg-violet-50 transition-colors text-center"
        >
          ✨ AI auto-send
        </button>
      )}
    </div>
  );
}

// ─── Confirm-remove dialog ────────────────────────────────────────────────────

function ConfirmRemoveDialog({
  tenant: row,
  onConfirm,
  onCancel,
}: {
  tenant: TenantRow;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Remove from workflow?</h2>
          <p className="text-xs text-slate-500 mt-1">
            <span className="font-medium text-slate-700">{row.name}</span> will be hidden from the workflow board. Use "Show hidden" to restore them at any time.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onConfirm}
            className="flex-1 py-2 text-xs font-medium bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
          >
            Remove
          </button>
          <button
            onClick={onCancel}
            className="flex-1 py-2 text-xs font-medium border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

const HIDDEN_KEY = "workflow_hidden_ids";

export default function WorkflowPage() {
  const [allRows, setAllRows] = useState<TenantRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<"all" | "new" | "renew">("all");
  const [aiReviewTenant, setAiReviewTenant] = useState<TenantRow | null>(null);
  const [batchReviewTenants, setBatchReviewTenants] = useState<TenantRow[] | null>(null);
  const [removingTenant, setRemovingTenant] = useState<TenantRow | null>(null);
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem(HIDDEN_KEY);
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch { return new Set(); }
  });

  function saveHidden(next: Set<string>) {
    setHiddenIds(next);
    localStorage.setItem(HIDDEN_KEY, JSON.stringify([...next]));
  }

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [persons, leases, payments, units] = await Promise.all([
        tenantsApi.listPersons(),
        leasesApi.list(),
        paymentsApi.list(),
        unitsApi.listAll(),
      ]);
      const unitRentById = new Map(units.map(u => [u.id, u.monthly_rent]));

      const leaseByTenant = new Map<string, LeaseOut>();
      for (const l of leases) {
        if (l.tenant_user_id) leaseByTenant.set(l.tenant_user_id, l);
      }

      const paymentByLease = new Map<string, PaymentOut>();
      const sorted = [...payments].sort((a, b) => a.due_date.localeCompare(b.due_date));
      for (const p of sorted) {
        if (!paymentByLease.has(p.lease_id) && p.status !== "PAID" && p.status !== "VOIDED") {
          paymentByLease.set(p.lease_id, p);
        }
      }

      const built: TenantRow[] = persons.map((t: TenantOut) => {
        const lease = leaseByTenant.get(t.id) ?? null;
        const isRenew = lease?.status === "ACTIVE" || lease?.status === "RENEWED";
        return {
          id: t.id,
          name: t.full_name,
          email: t.email,
          phone: t.phone,
          kind: isRenew ? "renew" : "new",
          screeningStatus: t.application_status,
          lease,
          nextPayment: lease ? (paymentByLease.get(lease.id) ?? null) : null,
          docCount: t.documents.length,
          employerRefSent: t.employer_ref_sent,
          landlordRefSent: t.landlord_ref_sent,
          tenantNotified: t.tenant_notified,
          interestedUnitId: t.interested_unit_id ?? null,
          unitMonthlyRent: t.interested_unit_id ? (unitRentById.get(t.interested_unit_id) ?? null) : null,
          unitSecurityDeposit: null,
        };
      });

      setAllRows(built);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load workflow");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Reload when user switches back to this tab (e.g. after changing status on screening page)
  useEffect(() => {
    function onVisible() { if (document.visibilityState === "visible") load(); }
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [load]);

  // All tenants show in workflow; hidden ones are tracked in localStorage
  function handleRemoveConfirmed() {
    if (!removingTenant) return;
    const next = new Set(hiddenIds);
    next.add(removingTenant.id);
    saveHidden(next);
    setRemovingTenant(null);
  }

  function restoreAll() {
    saveHidden(new Set());
  }

  const hiddenCount = [...hiddenIds].filter(id => allRows.some(r => r.id === id)).length;
  const visible = allRows.filter(r => !hiddenIds.has(r.id) && (filter === "all" || r.kind === filter));
  const byStage = (key: StageKey) => visible.filter(r => stageOf(r) === key);

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      {/* Batch AI review panel */}
      {batchReviewTenants && (
        <BatchAIReviewPanel
          tenants={batchReviewTenants.map(r => ({
            id: r.id, name: r.name, email: r.email, phone: r.phone, docCount: r.docCount,
          }))}
          onClose={() => setBatchReviewTenants(null)}
        />
      )}

      {/* Single AI review panel */}
      {!batchReviewTenants && aiReviewTenant && (
        <AIReviewPanel
          tenantId={aiReviewTenant.id}
          tenantName={aiReviewTenant.name}
          tenantEmail={aiReviewTenant.email}
          tenantPhone={aiReviewTenant.phone}
          docCount={aiReviewTenant.docCount}
          onClose={() => setAiReviewTenant(null)}
        />
      )}


      {/* Confirm remove */}
      {removingTenant && (
        <ConfirmRemoveDialog
          tenant={removingTenant}
          onConfirm={handleRemoveConfirmed}
          onCancel={() => setRemovingTenant(null)}
        />
      )}

      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Workflow</h1>
          <p className="text-sm text-slate-500 mt-0.5">Track every tenant through screening → lease → payment</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Filter */}
          <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1">
            {(["all", "new", "renew"] as const).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  filter === f ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {f === "all" ? "All" : f === "new" ? "New tenants" : "Renewals"}
              </button>
            ))}
          </div>
          {/* Restore hidden */}
          {hiddenCount > 0 && (
            <button
              onClick={restoreAll}
              className="px-3 py-2 text-xs font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
            >
              Show {hiddenCount} hidden
            </button>
          )}
        </div>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-20">
          <div className="w-6 h-6 border-2 border-black border-t-transparent rounded-full animate-spin" />
        </div>
      )}
      {error && <p className="text-sm text-red-600 py-8 text-center">{error}</p>}

      {!loading && !error && (
        <div className="grid grid-cols-4 gap-4 items-start">
          {STAGES.map(stage => {
            const cards = byStage(stage.key);
            return (
              <div key={stage.key} className="min-w-0">
                <div className="mb-3">
                  <div className="flex items-center gap-2 mb-0.5">
                    <h2 className="text-xs font-semibold text-slate-900">{stage.label}</h2>
                    <span className="bg-slate-200 text-slate-600 rounded-full px-1.5 py-0.5 text-[12px] font-medium">
                      {cards.length}
                    </span>
                  </div>
                  <p className="text-[12px] text-slate-400">{stage.description}</p>
                  {stage.key === "screening" && cards.length > 0 && (
                    <button
                      onClick={() => setBatchReviewTenants(cards)}
                      className="mt-2 w-full px-2 py-1.5 text-[13px] font-medium border border-violet-200 text-violet-700 rounded-lg hover:bg-violet-50 transition-colors"
                    >
                      ✨ AI auto-send all ({cards.length})
                    </button>
                  )}
                </div>
                <div className="space-y-2">
                  {cards.length === 0 && (
                    <div className="border border-dashed border-slate-200 rounded-xl p-4 text-center">
                      <p className="text-[13px] text-slate-400">No tenants here</p>
                    </div>
                  )}
                  {cards.map(row => (
                    <TenantCard
                      key={row.id}
                      row={row}
                      onAIReview={setAiReviewTenant}
                      onRemove={setRemovingTenant}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
