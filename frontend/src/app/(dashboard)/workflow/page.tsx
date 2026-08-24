"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { tenantsApi, leasesApi, paymentsApi, type TenantOut, type LeaseOut, type PaymentOut } from "@/lib/api";
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
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const SCREENING_LABEL: Record<string, { label: string; color: string }> = {
  NOT_STARTED:         { label: "Not started",        color: "bg-slate-100 text-slate-500" },
  IN_REVIEW:           { label: "In review",           color: "bg-blue-100 text-blue-700" },
  MORE_INFO_REQUESTED: { label: "More info requested", color: "bg-amber-100 text-amber-700" },
  APPROVED:            { label: "Approved",            color: "bg-green-100 text-green-700" },
  DECLINED:            { label: "Declined",            color: "bg-red-100 text-red-700" },
};

const LEASE_STATUS_LABEL: Record<string, { label: string; color: string }> = {
  ACTIVE:    { label: "Active",    color: "bg-green-100 text-green-700" },
  PENDING:   { label: "Pending",   color: "bg-blue-100 text-blue-700" },
  EXPIRED:   { label: "Expired",   color: "bg-slate-100 text-slate-500" },
  RENEWED:   { label: "Renewed",   color: "bg-violet-100 text-violet-700" },
  CANCELLED: { label: "Cancelled", color: "bg-red-100 text-red-700" },
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
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${s.color}`}>
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
  if (row.kind === "renew" && row.lease?.status === "ACTIVE") return "payment";
  if (row.screeningStatus === "DECLINED") return "screening";
  if (row.screeningStatus !== "APPROVED") return "screening";
  if (!row.lease) return "lease";
  if (row.lease.status === "PENDING") return "lease";
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
                <p className="text-[10px] text-slate-400 truncate">{row.email}</p>
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
          <p className="text-[10px] text-slate-400 truncate">{row.email}</p>
          {row.phone && <p className="text-[10px] text-slate-400">{row.phone}</p>}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <span className={`text-[9px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-full ${
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
        <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wide">Screening</p>
        <StatusBadge map={SCREENING_LABEL} status={row.screeningStatus} />
      </div>

      {/* Lease */}
      {(stage === "lease" || stage === "payment" || stage === "done") && (
        <div className="space-y-1">
          <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wide">Lease</p>
          {row.lease ? (
            <div className="flex items-center gap-1.5 flex-wrap">
              <StatusBadge map={LEASE_STATUS_LABEL} status={row.lease.status} />
              {row.lease.signature_status && (
                <span className="text-[10px] text-slate-400">sig: {row.lease.signature_status.toLowerCase()}</span>
              )}
            </div>
          ) : (
            <span className="text-[10px] text-slate-400">No lease yet</span>
          )}
        </div>
      )}

      {/* Payment */}
      {(stage === "payment" || stage === "done") && row.nextPayment && (
        <div className="space-y-1">
          <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wide">Next payment</p>
          <div className="flex items-center gap-1.5 flex-wrap">
            <StatusBadge map={PAYMENT_STATUS_LABEL} status={row.nextPayment.status} />
            <span className="text-[10px] text-slate-500">
              ${row.nextPayment.amount.toLocaleString()} · due {row.nextPayment.due_date}
            </span>
          </div>
        </div>
      )}

      {/* Links */}
      <div className="flex items-center gap-1.5 pt-0.5 flex-wrap">
        <Link href="/screening" className="text-[10px] font-medium text-violet-600 hover:underline">Screening</Link>
        {row.lease && <Link href="/leases" className="text-[10px] font-medium text-violet-600 hover:underline">· Lease</Link>}
        {row.nextPayment && <Link href="/payments" className="text-[10px] font-medium text-violet-600 hover:underline">· Payments</Link>}
      </div>

      {/* AI auto-send */}
      {stage === "screening" && (
        <button
          onClick={() => onAIReview(row)}
          className="w-full mt-1 px-2 py-1.5 text-[11px] font-medium border border-violet-200 text-violet-700 rounded-lg hover:bg-violet-50 transition-colors text-center"
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
            <span className="font-medium text-slate-700">{row.name}</span> will be removed from the screening workflow. Their screening status will be reset to "Not started". You can add them back at any time.
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

export default function WorkflowPage() {
  const [allRows, setAllRows] = useState<TenantRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<"all" | "new" | "renew">("all");
  const [aiReviewTenant, setAiReviewTenant] = useState<TenantRow | null>(null);
  const [batchReviewTenants, setBatchReviewTenants] = useState<TenantRow[] | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [removingTenant, setRemovingTenant] = useState<TenantRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [persons, leases, payments] = await Promise.all([
        tenantsApi.listPersons(),
        leasesApi.list(),
        paymentsApi.list(),
      ]);

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

  // Tenants in workflow = any status other than NOT_STARTED
  const inWorkflow = allRows.filter(r => r.screeningStatus !== "NOT_STARTED");
  // Tenants available to add = NOT_STARTED
  const candidates = allRows.filter(r => r.screeningStatus === "NOT_STARTED");

  async function handleAdd(row: TenantRow) {
    await tenantsApi.updateScreening(row.id, { application_status: "IN_REVIEW" });
    setAllRows(prev =>
      prev.map(r => r.id === row.id ? { ...r, screeningStatus: "IN_REVIEW" } : r)
    );
  }

  async function handleRemoveConfirmed() {
    if (!removingTenant) return;
    const id = removingTenant.id;
    setRemovingTenant(null);
    await tenantsApi.updateScreening(id, { application_status: "NOT_STARTED" });
    setAllRows(prev =>
      prev.map(r => r.id === id ? { ...r, screeningStatus: "NOT_STARTED" } : r)
    );
  }

  const visible = inWorkflow.filter(r => filter === "all" || r.kind === filter);
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


      {/* Add modal */}
      {showAddModal && (
        <AddTenantModal
          candidates={candidates}
          onAdd={handleAdd}
          onClose={() => setShowAddModal(false)}
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
          {/* Add tenant */}
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-black text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Add tenant
          </button>
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
                    <span className="bg-slate-200 text-slate-600 rounded-full px-1.5 py-0.5 text-[10px] font-medium">
                      {cards.length}
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-400">{stage.description}</p>
                  {stage.key === "screening" && cards.length > 0 && (
                    <button
                      onClick={() => setBatchReviewTenants(cards)}
                      className="mt-2 w-full px-2 py-1.5 text-[11px] font-medium border border-violet-200 text-violet-700 rounded-lg hover:bg-violet-50 transition-colors"
                    >
                      ✨ AI auto-send all ({cards.length})
                    </button>
                  )}
                </div>
                <div className="space-y-2">
                  {cards.length === 0 && (
                    <div className="border border-dashed border-slate-200 rounded-xl p-4 text-center">
                      <p className="text-[11px] text-slate-400">No tenants here</p>
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
