"use client";

import React, { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { tenantsApi, leasesApi, paymentsApi, unitsApi, profileApi, type TenantOut, type LeaseOut, type PaymentOut, type TenantApplicationOut, type TenantAiScreenOut, type TenantScreeningNoteOut, type EmployerReferenceLetterOut, type RefSummary, type UnitDetailOut, type LeaseTemplateOut } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import AIReviewPanel from "@/components/workflow/AIReviewPanel";
import BatchAIReviewPanel from "@/components/workflow/BatchAIReviewPanel";
import {
  useRentalApplicationState, buildRentalApplicationPayload, RentalApplicationSections,
  type AddressEntry, type EmploymentEntry,
  emptyAddress, emptyEmployment,
} from "@/components/rental-application/RentalApplicationFields";

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
  employerRefAnalyzed: boolean;
  landlordRefAnalyzed: boolean;
  employerRefSummary: RefSummary | null;
  landlordRefSummary: RefSummary | null;
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
  // Declined → skip workflow entirely (handled by visible filter)
  if (row.screeningStatus === "DECLINED") return "done";
  // Not approved → always screening (regardless of lease)
  if (row.screeningStatus !== "APPROVED") return "screening";
  // Approved: no lease → ready to create one
  if (!row.lease) return "lease";
  // If a DocuSign envelope is active, require it to be fully signed before moving to payment
  if (row.lease.docusign_envelope_id) {
    if (row.lease.signature_status === "completed") {
      // Active lease always stays in payment — even if current cycle is paid
      if (row.lease.status === "ACTIVE") return "payment";
      return "done";
    }
    // Envelope exists but not completed → stay in lease (pending signature)
    return "lease";
  }
  // No DocuSign — "new" means document generated but unsigned by either party → keep in Lease
  if (row.lease.signature_status === "new") return "lease";
  if (row.lease.status === "ACTIVE") return "payment";
  if (row.lease.status === "PENDING") return "lease";
  // Completed/expired lease → done
  return "done";
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

// ─── Ref summary chart ────────────────────────────────────────────────────────

function refScore(summary: RefSummary): number {
  let score = 100;
  if (summary.confirmed === false) score -= 30;
  else if (summary.confirmed == null) score -= 15;
  if (summary.would_rerent_or_good_standing === false) score -= 30;
  else if (summary.would_rerent_or_good_standing == null) score -= 15;
  score -= (summary.red_flags?.length ?? 0) * 10;
  return Math.max(0, Math.min(100, score));
}

function ScoreRing({ score }: { score: number }) {
  const r = 14, stroke = 3, cx = 18, cy = 18;
  const circumference = 2 * Math.PI * r;
  const dash = (score / 100) * circumference;
  const color = score >= 70 ? "#16a34a" : score >= 40 ? "#d97706" : "#dc2626";
  return (
    <svg width="36" height="36" viewBox="0 0 36 36" className="shrink-0">
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#e2e8f0" strokeWidth={stroke} />
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth={stroke}
        strokeDasharray={`${dash} ${circumference}`} strokeLinecap="round"
        transform="rotate(-90 18 18)" />
      <text x={cx} y={cy + 4} textAnchor="middle" fontSize="9" fontWeight="700" fill={color}>{score}</text>
    </svg>
  );
}

// ─── Card ─────────────────────────────────────────────────────────────────────

const SCREENING_STATUSES = [
  { value: "NOT_STARTED",         label: "Not started" },
  { value: "IN_REVIEW",           label: "In review" },
  { value: "MORE_INFO_REQUESTED", label: "More info requested" },
  { value: "APPROVED",            label: "Approved" },
  { value: "DECLINED",            label: "Declined" },
];

function TenantCard({
  row,
  onAIReview,
  onRemove,
  onMoreInfo,
  onStatusChange,
  onCreateLease,
  onSendSig,
  onOpenScreening,
}: {
  row: TenantRow;
  onAIReview: (row: TenantRow) => void;
  onRemove: (row: TenantRow) => void;
  onMoreInfo: (row: TenantRow) => void;
  onStatusChange: (id: string, status: string) => void;
  onCreateLease: (row: TenantRow) => void;
  onSendSig: (row: TenantRow) => void;
  onOpenScreening: (id: string) => void;
}) {
  const [changingStatus, setChangingStatus] = useState(false);
  const stage = stageOf(row);

  async function handleStatusSelect(e: React.ChangeEvent<HTMLSelectElement>) {
    const newStatus = e.target.value;
    setChangingStatus(true);
    try {
      await tenantsApi.updateScreening(row.id, { application_status: newStatus });
      onStatusChange(row.id, newStatus);
    } catch {
      // keep existing status on error
    } finally {
      setChangingStatus(false);
    }
  }
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
        <select
          value={row.screeningStatus}
          onChange={handleStatusSelect}
          disabled={changingStatus}
          onClick={e => e.stopPropagation()}
          className={`w-full text-[12px] font-medium rounded-full px-2 py-0.5 border-0 outline-none cursor-pointer disabled:opacity-60 ${SCREENING_LABEL[row.screeningStatus]?.color ?? "bg-slate-100 text-slate-500"}`}
        >
          {SCREENING_STATUSES.map(s => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
        {(row.employerRefSent || row.landlordRefSent || row.tenantNotified) && (
          <div className="flex flex-wrap gap-1 pt-0.5">
            {row.employerRefSent && (
              row.employerRefAnalyzed ? (
                <button
                  type="button"
                  onClick={e => { e.stopPropagation(); onOpenScreening(row.id); }}
                  className="flex items-center gap-1 border px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-700 border-violet-200 hover:bg-violet-200 transition-colors"
                >
                  {row.employerRefSummary && <ScoreRing score={refScore(row.employerRefSummary)} />}
                  <span className="text-[11px] font-medium">📬 Employer ref received</span>
                </button>
              ) : (
                <span className="text-[11px] font-medium border px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border-emerald-200">
                  ✓ Employer ref sent
                </span>
              )
            )}
            {row.landlordRefSent && (
              row.landlordRefAnalyzed ? (
                <button
                  type="button"
                  onClick={e => { e.stopPropagation(); onOpenScreening(row.id); }}
                  className="flex items-center gap-1 border px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-700 border-violet-200 hover:bg-violet-200 transition-colors"
                >
                  {row.landlordRefSummary && <ScoreRing score={refScore(row.landlordRefSummary)} />}
                  <span className="text-[11px] font-medium">📬 Landlord ref received</span>
                </button>
              ) : (
                <span className="text-[11px] font-medium border px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border-emerald-200">
                  ✓ Landlord ref sent
                </span>
              )
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
              ready_to_send: "bg-amber-100 text-amber-700",
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
            const clickable = sig === "ready_to_send";
            return clickable ? (
              <button
                onClick={e => { e.stopPropagation(); onSendSig(row); }}
                className={`inline-flex items-center rounded-full px-2 py-0.5 text-[12px] font-medium ${style} hover:brightness-95 cursor-pointer`}
              >{label} →</button>
            ) : (
              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[12px] font-medium ${style}`}>{label}</span>
            );
          })() : (
            <button
              onClick={e => { e.stopPropagation(); onCreateLease(row); }}
              className="inline-flex items-center rounded-full px-2 py-0.5 text-[12px] font-medium bg-amber-100 text-amber-700 hover:bg-amber-200 cursor-pointer transition-colors"
            >+ No lease yet</button>
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

      {/* More info requested — view details */}
      {row.screeningStatus === "MORE_INFO_REQUESTED" && (
        <button
          onClick={e => { e.stopPropagation(); onMoreInfo(row); }}
          className="w-full mt-1 px-2 py-1.5 text-[13px] font-medium border border-amber-300 text-amber-700 bg-amber-50 rounded-lg hover:bg-amber-100 transition-colors text-center"
        >
          ⚠ View missing info
        </button>
      )}

      {/* Send reference check */}
      {stage === "screening" && (
        <button
          onClick={() => onAIReview(row)}
          className="w-full mt-1 px-2 py-1.5 text-[13px] font-medium border border-violet-200 text-violet-700 rounded-lg hover:bg-violet-50 transition-colors text-center"
        >
          ✨ Send reference check email/sms
        </button>
      )}
    </div>
  );
}

// ─── More-info drawer (editable) ──────────────────────────────────────────────

function missingIssues(
  app: TenantApplicationOut,
  appState: ReturnType<typeof useRentalApplicationState>,
  docCount: number,
): string[] {
  const issues: string[] = [];
  const hasIncome = !!(appState.personalIncome || appState.householdIncome);
  if (!hasIncome) issues.push("Income (personal or household)");
  if (appState.employments.length === 0 || appState.employments.every(e => !e.company && !e.position)) issues.push("Employment history");
  else if (appState.employments.some(e => !e.employer_reference_name)) issues.push("Employer reference name on some entries");
  if (appState.addresses.length === 0 || appState.addresses.every(a => !a.street_address)) issues.push("Address history");
  else if (appState.addresses.some(a => !a.landlord_name)) issues.push("Landlord name on some addresses");
  if (docCount === 0) issues.push("ID document (tenant must upload from portal)");
  return issues;
}

function MoreInfoDrawer({ row, onClose, onSaved }: { row: TenantRow; onClose: () => void; onSaved: () => void }) {
  const appState = useRentalApplicationState();
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState("");
  const [saved, setSaved] = useState(false);
  const [changingStatus, setChangingStatus] = useState(false);
  const [app, setApp] = useState<TenantApplicationOut | null>(null);
  const [showNotify, setShowNotify] = useState(false);
  const [notifyChannel, setNotifyChannel] = useState<"EMAIL" | "SMS">("EMAIL");
  const [notifySubject, setNotifySubject] = useState("Action required: complete your rental application");
  const [notifyBody, setNotifyBody] = useState("");
  const [notifying, setNotifying] = useState(false);
  const [notifyErr, setNotifyErr] = useState("");
  const [notifySent, setNotifySent] = useState(false);

  // Personal fields
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState(row.phone || "");

  useEffect(() => {
    tenantsApi.getApplication(row.id)
      .then(a => {
        setApp(a);
        // Pre-fill personal
        const nameParts = row.name.split(" ");
        setFirstName(nameParts[0] || "");
        setLastName(nameParts.slice(1).join(" ") || "");
        setPhone(row.phone || "");
        // Pre-fill rental app state
        appState.setPersonalIncome(a.personal_income_annual ? String(a.personal_income_annual) : "");
        appState.setHouseholdIncome(a.household_income_annual ? String(a.household_income_annual) : "");
        appState.setPersonalMessage(a.personal_message || "");
        appState.setScreening({
          smoke_vape: a.smoke_vape ?? null,
          given_notice_to_landlord: a.given_notice_to_landlord ?? null,
          refused_rent: a.refused_rent ?? null,
          evicted: a.evicted ?? null,
          criminal_record: a.criminal_record ?? null,
        });
        appState.setAddresses(
          a.address_history.length > 0
            ? a.address_history.map(addr => ({
                is_current: addr.is_current,
                residential_status: addr.residential_status || "Rent",
                street_address: addr.street_address || "",
                city: addr.city || "",
                postal_code: addr.postal_code || "",
                country: addr.country || "",
                province: addr.province || "",
                move_in_date: addr.move_in_date || "",
                move_out_date: addr.move_out_date || "",
                monthly_rent: addr.monthly_rent != null ? String(addr.monthly_rent) : "",
                reason_for_moving: addr.reason_for_moving || "",
                landlord_first_name: "",
                landlord_middle_name: "",
                landlord_last_name: "",
                landlord_name: addr.landlord_name || "",
                landlord_phone: addr.landlord_phone || "",
                landlord_email: addr.landlord_email || "",
              } as AddressEntry))
            : [emptyAddress(true)]
        );
        appState.setEmployments(
          a.employment_history.length > 0
            ? a.employment_history.map(emp => ({
                is_current: emp.is_current,
                employment_type: emp.employment_type || "Full time employment",
                company: emp.company || "",
                position: emp.position || "",
                employment_length: emp.employment_length || "",
                company_website: "",
                company_linkedin_url: "",
                additional_notes: "",
                employer_reference_first_name: emp.employer_reference_first_name || "",
                employer_reference_middle_name: emp.employer_reference_middle_name || "",
                employer_reference_last_name: emp.employer_reference_last_name || "",
                employer_reference_name: emp.employer_reference_name || "",
                employer_reference_phone: emp.employer_reference_phone || "",
                employer_reference_email: emp.employer_reference_email || "",
              } as EmploymentEntry))
            : [emptyEmployment(true)]
        );
        // Build default notify message
        const missingList: string[] = [];
        if (!a.personal_income_annual && !a.household_income_annual) missingList.push("- Income information");
        if (!a.employment_history.length || a.employment_history.every(e => !e.company)) missingList.push("- Employment history");
        if (!a.address_history.length || a.address_history.every(x => !x.street_address)) missingList.push("- Address history");
        if (row.docCount === 0) missingList.push("- ID document (upload via your portal)");
        const nameParts2 = row.name.split(" ");
        const base = `Hi ${nameParts2[0] || row.name},\n\nWe're reviewing your rental application and need some additional information to proceed:\n\n${missingList.join("\n") || "- Please review your application for any missing details"}\n\nPlease log in to your portal to update your application.\n\nThank you`;
        setNotifyBody(base);
      })
      .catch(() => setLoadErr("Failed to load application details"))
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [row.id]);

  async function handleNotify() {
    setNotifying(true); setNotifyErr(""); setNotifySent(false);
    try {
      await tenantsApi.notifyMissingInfo(row.id, notifyChannel, notifySubject, notifyBody);
      setNotifySent(true);
      setShowNotify(false);
    } catch (e: unknown) {
      setNotifyErr(e instanceof Error ? e.message : "Failed to send notification");
    } finally {
      setNotifying(false);
    }
  }

  async function handleStatusChange(status: string) {
    setChangingStatus(true); setSaveErr("");
    try {
      await tenantsApi.updateScreening(row.id, { application_status: status });
      onSaved();
      onClose();
    } catch (e: unknown) {
      setSaveErr(e instanceof Error ? e.message : "Status update failed");
      setChangingStatus(false);
    }
  }

  async function handleSave() {
    setSaving(true); setSaveErr(""); setSaved(false);
    try {
      const payload = buildRentalApplicationPayload(appState);
      await tenantsApi.updatePerson(row.id, {
        first_name: firstName.trim() || undefined,
        last_name: lastName.trim() || undefined,
        phone: phone.trim() || undefined,
        ...payload,
      });
      setSaved(true);
      onSaved();
    } catch (e: unknown) {
      setSaveErr(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  const issues = app ? missingIssues(app, appState, row.docCount) : [];
  const hasIncome = !!(appState.personalIncome || appState.householdIncome);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg bg-white h-full overflow-y-auto shadow-2xl flex flex-col">

        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-slate-100 px-5 py-4 flex items-start justify-between z-10">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">More info requested</span>
            </div>
            <h2 className="text-sm font-bold text-slate-900 mt-1">{row.name}</h2>
            <p className="text-xs text-slate-400">{row.email}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none mt-1">×</button>
        </div>

        <div className="flex-1 px-5 py-4 space-y-5">
          {loading && <p className="text-sm text-slate-400 text-center py-10">Loading…</p>}
          {loadErr && <p className="text-sm text-red-500 text-center py-6">{loadErr}</p>}

          {!loading && !loadErr && (
            <>
              {/* Missing fields banner */}
              {issues.length > 0 && (
                <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3">
                  <p className="text-xs font-semibold text-amber-800 mb-1.5">⚠ Missing or incomplete — please fill in below</p>
                  <ul className="list-disc list-inside space-y-0.5">
                    {issues.map(i => <li key={i} className="text-xs text-amber-700">{i}</li>)}
                  </ul>
                </div>
              )}
              {issues.length === 0 && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5">
                  <p className="text-xs font-semibold text-emerald-700">✓ All required fields are filled in</p>
                </div>
              )}

              {/* Notify tenant */}
              <div className="rounded-xl border border-slate-200 overflow-hidden">
                <div className="px-4 py-3 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                  <p className="text-xs font-semibold text-slate-700">Notify tenant</p>
                  <button
                    onClick={() => { setShowNotify(v => !v); setNotifyErr(""); setNotifySent(false); }}
                    className="text-xs font-medium text-blue-600 hover:text-blue-800 transition-colors"
                  >
                    {showNotify ? "Cancel" : "✉ Compose message"}
                  </button>
                </div>
                {notifySent && (
                  <div className="px-4 py-2.5 bg-emerald-50 border-b border-emerald-100">
                    <p className="text-xs font-semibold text-emerald-700">✓ Notification sent to tenant</p>
                  </div>
                )}
                {showNotify && (
                  <div className="p-4 space-y-3">
                    <div className="flex gap-2">
                      {(["EMAIL", "SMS"] as const).map(ch => (
                        <button
                          key={ch}
                          onClick={() => setNotifyChannel(ch)}
                          className={`px-3 py-1 text-xs font-medium rounded-lg border transition-colors ${notifyChannel === ch ? "bg-black text-white border-black" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}
                        >
                          {ch === "EMAIL" ? "✉ Email" : "📱 SMS"}
                        </button>
                      ))}
                    </div>
                    {notifyChannel === "EMAIL" && (
                      <div>
                        <label className="block text-xs font-medium text-slate-500 mb-1">Subject</label>
                        <input className="w-full text-sm border border-slate-200 rounded-lg px-2.5 py-1.5 outline-none focus:border-black" value={notifySubject} onChange={e => setNotifySubject(e.target.value)} />
                      </div>
                    )}
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1">Message</label>
                      <textarea
                        rows={7}
                        className="w-full text-sm border border-slate-200 rounded-lg px-2.5 py-1.5 outline-none focus:border-black resize-none"
                        value={notifyBody}
                        onChange={e => setNotifyBody(e.target.value)}
                      />
                    </div>
                    {notifyErr && <p className="text-xs text-red-600">{notifyErr}</p>}
                    <button
                      onClick={handleNotify}
                      disabled={notifying || !notifyBody.trim()}
                      className="w-full py-2 text-sm font-medium bg-black text-white rounded-lg hover:bg-slate-800 disabled:opacity-50 transition-colors"
                    >
                      {notifying ? "Sending…" : `Send ${notifyChannel === "EMAIL" ? "email" : "SMS"}`}
                    </button>
                  </div>
                )}
              </div>

              {/* Personal */}
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <div className="px-5 py-3 border-b border-slate-100 bg-slate-50">
                  <p className="text-sm font-semibold text-slate-900">Personal details</p>
                </div>
                <div className="p-4 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1">First name</label>
                      <input className="w-full text-sm border border-slate-200 rounded-lg px-2.5 py-1.5 outline-none focus:border-black" value={firstName} onChange={e => setFirstName(e.target.value)} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1">Last name</label>
                      <input className="w-full text-sm border border-slate-200 rounded-lg px-2.5 py-1.5 outline-none focus:border-black" value={lastName} onChange={e => setLastName(e.target.value)} />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Phone</label>
                    <input className="w-full text-sm border border-slate-200 rounded-lg px-2.5 py-1.5 outline-none focus:border-black" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+1 403 000 0000" />
                  </div>
                  <div className={`grid grid-cols-2 gap-3 rounded-lg p-3 ${!hasIncome ? "border border-amber-300 bg-amber-50" : "border border-slate-200"}`}>
                    <div>
                      <label className={`block text-xs font-medium mb-1 ${!hasIncome ? "text-amber-700" : "text-slate-500"}`}>Personal income / yr {!hasIncome && "⚠"}</label>
                      <input type="number" min="0" className="w-full text-sm border border-slate-200 rounded-lg px-2.5 py-1.5 outline-none focus:border-black bg-white" value={appState.personalIncome} onChange={e => appState.setPersonalIncome(e.target.value)} placeholder="e.g. 60000" />
                    </div>
                    <div>
                      <label className={`block text-xs font-medium mb-1 ${!hasIncome ? "text-amber-700" : "text-slate-500"}`}>Household income / yr</label>
                      <input type="number" min="0" className="w-full text-sm border border-slate-200 rounded-lg px-2.5 py-1.5 outline-none focus:border-black bg-white" value={appState.householdIncome} onChange={e => appState.setHouseholdIncome(e.target.value)} placeholder="e.g. 90000" />
                    </div>
                  </div>
                </div>
              </div>

              {/* Documents notice */}
              <div className={`rounded-xl border px-4 py-3 ${row.docCount === 0 ? "border-amber-300 bg-amber-50" : "border-emerald-200 bg-emerald-50"}`}>
                <p className={`text-xs font-semibold ${row.docCount === 0 ? "text-amber-800" : "text-emerald-700"}`}>
                  {row.docCount === 0 ? "⚠ No ID document uploaded — tenant must upload via their portal" : `✓ ${row.docCount} document${row.docCount > 1 ? "s" : ""} uploaded`}
                </p>
              </div>

              {/* Rental application sections (address, employment, screening q's) */}
              <RentalApplicationSections state={appState} askCriminalRecord askRentalHistory />
            </>
          )}
        </div>

        {/* Footer */}
        {!loading && !loadErr && (
          <div className="sticky bottom-0 bg-white border-t border-slate-100 px-5 py-3 space-y-2">
            {saveErr && <p className="text-xs text-red-600">{saveErr}</p>}
            {saved && <p className="text-xs text-emerald-600">✓ Saved successfully</p>}

            {/* Status actions */}
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => handleStatusChange("IN_REVIEW")}
                disabled={changingStatus}
                className="py-2 text-xs font-semibold border border-blue-300 text-blue-700 bg-blue-50 rounded-lg hover:bg-blue-100 disabled:opacity-50 transition-colors"
              >
                {changingStatus ? "Updating…" : "→ Mark as In Review"}
              </button>
              <button
                onClick={() => handleStatusChange("APPROVED")}
                disabled={changingStatus}
                className="py-2 text-xs font-semibold border border-emerald-300 text-emerald-700 bg-emerald-50 rounded-lg hover:bg-emerald-100 disabled:opacity-50 transition-colors"
              >
                {changingStatus ? "Updating…" : "✓ Approve applicant"}
              </button>
            </div>

            {/* Save + link row */}
            <div className="flex items-center gap-2">
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 py-2 text-sm font-medium bg-black text-white rounded-lg hover:bg-slate-800 disabled:opacity-50 transition-colors"
              >
                {saving ? "Saving…" : "Save changes"}
              </button>
              <Link
                href={`/screening?tenantId=${row.id}`}
                className="px-4 py-2 text-sm font-medium border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap"
              >
                Screening →
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Batch create lease modal ─────────────────────────────────────────────────

type TenantLeaseForm = {
  selected: boolean;
  expanded: boolean;
  unit_id: string;
  lease_type: string;
  start_date: string;
  end_date: string;
  monthly_rent: string;
  security_deposit: string;
  landlord_name: string;
  landlord_email: string;
  landlord_phone: string;
  notes: string;
  template_id: string;
};

function BatchCreateLeaseModal({ rows, units, onClose, onCreated }: {
  rows: TenantRow[];
  units: UnitDetailOut[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const oneYear = new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toISOString().slice(0, 10);
  const inp = "w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black";

  const eligible = rows.filter(r => !r.lease);

  const buildDefault = (r: TenantRow): TenantLeaseForm => {
    const defUnit = units.find(u => u.id === r.interestedUnitId) ?? units[0] ?? null;
    return {
      selected: true,
      expanded: false,
      unit_id: defUnit?.id ?? "",
      lease_type: "FIXED",
      start_date: today,
      end_date: oneYear,
      monthly_rent: String(r.unitMonthlyRent ?? defUnit?.monthly_rent ?? ""),
      security_deposit: String(r.unitMonthlyRent ?? defUnit?.monthly_rent ?? ""),
      landlord_name: "",
      landlord_email: "",
      landlord_phone: "",
      notes: "",
      template_id: "",
    };
  };

  const [forms, setForms] = useState<Record<string, TenantLeaseForm>>(() =>
    Object.fromEntries(eligible.map(r => [r.id, buildDefault(r)]))
  );
  const [templates, setTemplates] = useState<LeaseTemplateOut[]>([]);
  const [creating, setCreating] = useState(false);
  const [results, setResults] = useState<{ id: string; leaseId: string | null; name: string; ok: boolean; msg: string; documentUrl: string | null }[] | null>(null);
  const [sending, setSending] = useState(false);
  const [sendResults, setSendResults] = useState<{ name: string; ok: boolean }[] | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    profileApi.me().then(me => {
      setForms(prev => {
        const next = { ...prev };
        for (const id of Object.keys(next)) {
          next[id] = {
            ...next[id],
            landlord_name: next[id].landlord_name || me.full_name || "",
            landlord_email: next[id].landlord_email || me.reference_reply_email || me.email || "",
            landlord_phone: next[id].landlord_phone || me.phone || "",
          };
        }
        return next;
      });
    }).catch(() => {});
    leasesApi.listTemplates().then(setTemplates).catch(() => {});
  }, []);

  function setField(id: string, k: keyof TenantLeaseForm, v: string | boolean) {
    setForms(prev => {
      const f = { ...prev[id], [k]: v };
      if (k === "unit_id") {
        const u = units.find(u => u.id === v);
        if (u) { f.monthly_rent = String(u.monthly_rent); f.security_deposit = String(u.monthly_rent); }
      }
      if (k === "monthly_rent" && !prev[id].security_deposit) f.security_deposit = v as string;
      return { ...prev, [id]: f };
    });
  }

  const selected = eligible.filter(r => forms[r.id]?.selected);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (selected.length === 0) { setErr("Select at least one tenant."); return; }
    const missing = selected.filter(r => !forms[r.id]?.unit_id || !forms[r.id]?.start_date || !forms[r.id]?.end_date || !forms[r.id]?.monthly_rent);
    if (missing.length > 0) { setErr(`Please fill unit, dates, and rent for: ${missing.map(r => r.name).join(", ")}`); return; }
    setCreating(true); setErr(""); setResults(null);

    const outcomes = await Promise.allSettled(
      selected.map(async row => {
        const f = forms[row.id];
        const lease = await leasesApi.create({
          unit_id: f.unit_id,
          tenant_user_id: row.id,
          start_date: f.start_date,
          end_date: f.end_date,
          monthly_rent: parseFloat(f.monthly_rent),
          security_deposit: f.security_deposit ? parseFloat(f.security_deposit) : 0,
          lease_type: f.lease_type as "FIXED" | "MONTH_TO_MONTH",
          landlord_name: f.landlord_name || null,
          landlord_email: f.landlord_email || null,
          landlord_phone: f.landlord_phone || null,
          notes: f.notes || null,
        });
        const templateId = f.template_id || templates[0]?.id;
        let documentUrl: string | null = null;
        if (templateId) {
          const withDoc = await leasesApi.generateDocument(lease.id, templateId).catch(() => null);
          documentUrl = withDoc?.document_url ?? null;
        }
        const unit = units.find(u => u.id === f.unit_id);
        const noteText = `Lease agreement created${unit ? ` for ${unit.property_name} — Unit ${unit.unit_number}` : ""} (${f.start_date} → ${f.end_date}, $${f.monthly_rent}/mo).${documentUrl ? " Lease agreement document generated." : ""}`;
        await tenantsApi.addNote(row.id, noteText).catch(() => {});
        return { name: row.name, leaseId: lease.id, documentUrl };
      })
    );

    setResults(outcomes.map((o, i) => ({
      id: selected[i].id,
      leaseId: o.status === "fulfilled" ? o.value.leaseId : null,
      name: selected[i].name,
      ok: o.status === "fulfilled",
      msg: o.status === "rejected" ? (o.reason instanceof Error ? o.reason.message : "Failed") : "Created",
      documentUrl: o.status === "fulfilled" ? o.value.documentUrl : null,
    })));
    // Auto-expand cards that succeeded so user can see the document link
    if (outcomes.some(o => o.status === "fulfilled")) {
      setForms(prev => {
        const next = { ...prev };
        outcomes.forEach((o, i) => { if (o.status === "fulfilled") next[selected[i].id] = { ...next[selected[i].id], expanded: true }; });
        return next;
      });
      onCreated();
    }
    setCreating(false);
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Create lease agreements</h2>
            <p className="text-xs text-slate-500 mt-0.5">{eligible.length} tenant{eligible.length !== 1 ? "s" : ""} without a lease</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
        </div>

        <form onSubmit={handleCreate} className="flex flex-col flex-1 min-h-0">
          <div className="overflow-y-auto flex-1 px-5 py-4 space-y-3">
            {eligible.length === 0 ? (
              <p className="text-sm text-slate-500 text-center py-4">All tenants already have a lease.</p>
            ) : eligible.map(row => {
              const f = forms[row.id];
              if (!f) return null;
              const resultEntry = results?.find(r => r.name === row.name);
              return (
                <div key={row.id} className={`rounded-xl border transition-colors ${f.selected ? "border-slate-200" : "border-slate-100 opacity-60"}`}>
                  {/* Tenant row: checkbox + name + collapse toggle */}
                  <div className="flex items-center gap-3 px-4 py-3">
                    <input
                      type="checkbox"
                      checked={f.selected}
                      onChange={e => setField(row.id, "selected", e.target.checked)}
                      className="w-4 h-4 accent-black cursor-pointer shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-900 truncate">{row.name}</p>
                      <p className="text-xs text-slate-400 truncate">{row.email}</p>
                    </div>
                    {resultEntry && (
                      <span className={`text-xs font-medium ${resultEntry.ok ? "text-emerald-600" : "text-red-500"}`}>
                        {resultEntry.ok ? "✓ Created" : "✗ Failed"}
                      </span>
                    )}
                    {f.selected && (
                      <button type="button" onClick={() => setField(row.id, "expanded", !f.expanded)}
                        className="text-slate-400 hover:text-slate-600 text-xs flex items-center gap-1">
                        {f.expanded ? "▲ Hide" : "▼ Details"}
                      </button>
                    )}
                  </div>

                  {/* Collapsible lease detail */}
                  {f.selected && f.expanded && (
                    <div className="border-t border-slate-100 px-4 py-4 space-y-3">
                      {/* Tenant read-only */}
                      <div>
                        <label className="block text-xs font-medium text-slate-500 mb-1">Tenant</label>
                        <div className="flex items-center gap-2 border border-slate-200 rounded-lg px-3 py-2 bg-slate-50">
                          <span className="w-1.5 h-1.5 rounded-full bg-black inline-block shrink-0" />
                          <span className="text-sm text-slate-700 font-medium">{row.name}</span>
                          <span className="text-xs text-slate-400 ml-1 truncate">{row.email}</span>
                        </div>
                      </div>

                      {/* Unit */}
                      <div>
                        <label className="block text-xs font-medium text-slate-500 mb-1">Unit *</label>
                        <select value={f.unit_id} onChange={e => setField(row.id, "unit_id", e.target.value)} className={inp}>
                          <option value="">— select unit —</option>
                          {units.map(u => (
                            <option key={u.id} value={u.id}>
                              {u.property_name} — Unit {u.unit_number} · ${u.monthly_rent}/mo
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Lease type */}
                      <div>
                        <label className="block text-xs font-medium text-slate-500 mb-1">Lease type</label>
                        <select value={f.lease_type} onChange={e => setField(row.id, "lease_type", e.target.value)} className={inp}>
                          <option value="FIXED">Fixed term</option>
                          <option value="MONTH_TO_MONTH">Month-to-month</option>
                        </select>
                      </div>

                      {/* Dates */}
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-slate-500 mb-1">Start date *</label>
                          <input type="date" value={f.start_date} onChange={e => setField(row.id, "start_date", e.target.value)} className={inp} />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-500 mb-1">End date *</label>
                          <input type="date" value={f.end_date} onChange={e => setField(row.id, "end_date", e.target.value)} className={inp} />
                        </div>
                      </div>

                      {/* Rent + deposit */}
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-slate-500 mb-1">Monthly rent *</label>
                          <input type="number" min="0" step="0.01" value={f.monthly_rent}
                            onChange={e => setField(row.id, "monthly_rent", e.target.value)} placeholder="2000" className={inp} />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-500 mb-1">Security deposit</label>
                          <input type="number" min="0" step="0.01" value={f.security_deposit}
                            onChange={e => setField(row.id, "security_deposit", e.target.value)} placeholder="2000" className={inp} />
                        </div>
                      </div>

                      {/* Landlord name */}
                      <div>
                        <label className="block text-xs font-medium text-slate-500 mb-1">Landlord name</label>
                        <input value={f.landlord_name} onChange={e => setField(row.id, "landlord_name", e.target.value)}
                          placeholder="Enter landlord name" className={inp} />
                      </div>

                      {/* Landlord email + phone */}
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-slate-500 mb-1">Landlord email</label>
                          <input type="email" value={f.landlord_email} onChange={e => setField(row.id, "landlord_email", e.target.value)}
                            placeholder="landlord@example.com" className={inp} />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-500 mb-1">Landlord phone</label>
                          <input type="tel" value={f.landlord_phone} onChange={e => setField(row.id, "landlord_phone", e.target.value)}
                            placeholder="(555) 000-0000" className={inp} />
                        </div>
                      </div>

                      {/* Notes */}
                      <div>
                        <label className="block text-xs font-medium text-slate-500 mb-1">Notes</label>
                        <textarea value={f.notes} onChange={e => setField(row.id, "notes", e.target.value)} rows={2}
                          className={`${inp} resize-none`} />
                      </div>

                      {/* Template */}
                      <div>
                        <label className="block text-xs font-medium text-slate-500 mb-1">Lease agreement template</label>
                        {f.template_id ? (
                          <div className="flex items-center gap-2 border border-violet-200 bg-violet-50 rounded-xl px-3 py-2.5">
                            <span className="text-violet-500">✨</span>
                            <span className="text-sm text-violet-800 font-medium flex-1 truncate">
                              {templates.find(t => t.id === f.template_id)?.name}
                            </span>
                            <button type="button" onClick={() => setField(row.id, "template_id", "")}
                              className="text-xs text-slate-400 hover:text-slate-600 shrink-0">× Remove</button>
                          </div>
                        ) : (
                          <select value="" onChange={e => { if (e.target.value) setField(row.id, "template_id", e.target.value); }}
                            className={inp}>
                            <option value="">✨ Select template for AI-generated agreement</option>
                            {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                          </select>
                        )}
                      </div>

                      {/* Generated document link */}
                      {(() => {
                        const res = results?.find(r => r.id === row.id);
                        if (!res?.ok) return null;
                        return (
                          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 space-y-1">
                            <p className="text-xs font-medium text-emerald-700">✓ Lease created successfully</p>
                            {res.documentUrl ? (
                              <a href={res.documentUrl} target="_blank" rel="noopener noreferrer"
                                className="flex items-center gap-1.5 text-xs text-violet-700 hover:underline font-medium">
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                                </svg>
                                View lease agreement document
                              </a>
                            ) : (
                              <p className="text-xs text-emerald-600">No template selected — document not generated.</p>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  )}

                  {/* Collapsed summary when selected */}
                  {f.selected && !f.expanded && (
                    <div className="border-t border-slate-100 px-4 py-2 flex items-center gap-3 text-xs text-slate-500">
                      {f.unit_id ? (
                        <span>{units.find(u => u.id === f.unit_id)?.property_name} — Unit {units.find(u => u.id === f.unit_id)?.unit_number}</span>
                      ) : <span className="text-amber-500">No unit selected</span>}
                      {f.monthly_rent && <span>· ${f.monthly_rent}/mo</span>}
                      {f.start_date && <span>· {f.start_date}</span>}
                    </div>
                  )}
                </div>
              );
            })}

            {err && <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">{err}</p>}
          </div>

          {/* Footer */}
          <div className="px-5 py-4 border-t border-slate-100 flex flex-col gap-2 shrink-0">
            {sendResults && (
              <div className="flex flex-wrap gap-2">
                {sendResults.map((r, i) => (
                  <span key={i} className={`text-xs px-2 py-1 rounded-full ${r.ok ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-600"}`}>
                    {r.ok ? "✓" : "✗"} {r.name}
                  </span>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              {(!results || results.some(r => !r.ok)) && (
                <button type="submit" disabled={creating || selected.length === 0}
                  className="flex-1 py-2.5 text-sm font-medium bg-black text-white rounded-lg hover:bg-slate-800 disabled:opacity-50 transition-colors">
                  {creating ? "Creating…" : `Create ${selected.length} lease${selected.length !== 1 ? "s" : ""}`}
                </button>
              )}
              {results?.every(r => r.ok) && !sendResults && (() => {
                const sendable = results.filter(r => r.ok && r.leaseId);
                return sendable.length > 0 ? (
                  <button type="button" disabled={sending}
                    onClick={async () => {
                      setSending(true);
                      const outcomes = await Promise.allSettled(
                        sendable.map(r => leasesApi.sendForSignature(r.leaseId!))
                      );
                      setSendResults(sendable.map((r, i) => ({ name: r.name, ok: outcomes[i].status === "fulfilled" })));
                      setSending(false);
                      onCreated();
                    }}
                    className="flex-1 py-2.5 text-sm font-medium bg-violet-600 text-white rounded-lg hover:bg-violet-700 disabled:opacity-50 transition-colors">
                    {sending ? "Sending…" : `📨 Send ${sendable.length} lease agreement${sendable.length !== 1 ? "s" : ""}`}
                  </button>
                ) : null;
              })()}
              <button type="button" onClick={onClose}
                className="flex-1 py-2.5 text-sm font-medium border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors">
                {results?.every(r => r.ok) ? "Done" : "Cancel"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Create lease modal ───────────────────────────────────────────────────────

function CreateLeaseModal({ row, units, onClose, onCreated }: {
  row: TenantRow;
  units: UnitDetailOut[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const { user } = useAuth();
  const today = new Date().toISOString().slice(0, 10);
  const oneYear = new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toISOString().slice(0, 10);
  const defaultUnit = units.find(u => u.id === row.interestedUnitId) ?? units[0] ?? null;

  const inp = "w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black";

  const [form, setForm] = useState({
    unit_id: defaultUnit?.id ?? "",
    start_date: today,
    end_date: oneYear,
    monthly_rent: String(row.unitMonthlyRent ?? defaultUnit?.monthly_rent ?? ""),
    security_deposit: String(row.unitMonthlyRent ?? defaultUnit?.monthly_rent ?? ""),
    lease_type: "FIXED",
    landlord_name: user?.full_name ?? "",
    landlord_email: user?.email ?? "",
    landlord_phone: "",
    notes: "",
  });
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [err, setErr] = useState("");
  const [templates, setTemplates] = useState<LeaseTemplateOut[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);

  useEffect(() => {
    profileApi.me().then(me => {
      setForm(f => ({
        ...f,
        landlord_name: f.landlord_name || me.full_name || "",
        landlord_email: f.landlord_email || me.reference_reply_email || me.email || "",
        landlord_phone: f.landlord_phone || me.phone || "",
      }));
    }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    leasesApi.listTemplates().then(list => setTemplates(list)).catch(() => {});
  }, []);

  function set(k: string, v: string) {
    setForm(f => {
      const next = { ...f, [k]: v };
      if (k === "monthly_rent" && !f.security_deposit) next.security_deposit = v;
      return next;
    });
  }

  const isWorking = saving || generating;

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.unit_id || !form.start_date || !form.end_date || !form.monthly_rent) {
      setErr("Unit, dates, and rent are required.");
      return;
    }
    setSaving(true); setErr("");
    try {
      const lease = await leasesApi.create({
        unit_id: form.unit_id,
        tenant_user_id: row.id,
        start_date: form.start_date,
        end_date: form.end_date,
        monthly_rent: parseFloat(form.monthly_rent),
        security_deposit: form.security_deposit ? parseFloat(form.security_deposit) : 0,
        lease_type: form.lease_type as "FIXED" | "MONTH_TO_MONTH",
        landlord_name: form.landlord_name || null,
        landlord_email: form.landlord_email || null,
        landlord_phone: form.landlord_phone || null,
        notes: form.notes || null,
      });

      if (selectedTemplateId) {
        setGenerating(true);
        try {
          await leasesApi.generateDocument(lease.id, selectedTemplateId);
        } catch (genErr: unknown) {
          setErr(`Lease created, but document generation failed: ${genErr instanceof Error ? genErr.message : "unknown error"}`);
        } finally {
          setGenerating(false);
        }
      }

      onCreated();
      onClose();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Failed to create lease");
    } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="text-base font-semibold text-slate-900">Create lease — {row.name}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
        </div>
        <form onSubmit={handleCreate} className="px-6 py-5 space-y-4">
          {err && <p className="text-red-600 text-sm bg-red-50 px-3 py-2 rounded-lg">{err}</p>}

          {/* Tenant (read-only, pre-filled) */}
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Tenant</label>
            <div className="flex items-center gap-2 border border-slate-200 rounded-lg px-3 py-2 bg-slate-50">
              <span className="w-1.5 h-1.5 rounded-full bg-black inline-block shrink-0" />
              <span className="text-sm text-slate-700 font-medium">{row.name}</span>
              <span className="text-xs text-slate-400 ml-1">{row.email}</span>
            </div>
          </div>

          {/* Unit */}
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Unit *</label>
            <select value={form.unit_id} onChange={e => {
              const u = units.find(u => u.id === e.target.value);
              set("unit_id", e.target.value);
              if (u && !form.monthly_rent) set("monthly_rent", String(u.monthly_rent));
            }} className={inp}>
              <option value="">— select unit —</option>
              {units.map(u => (
                <option key={u.id} value={u.id}>
                  {u.property_name} — Unit {u.unit_number} · ${u.monthly_rent}/mo
                </option>
              ))}
            </select>
          </div>

          {/* Lease type */}
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Lease type</label>
            <select value={form.lease_type} onChange={e => set("lease_type", e.target.value)} className={inp}>
              <option value="FIXED">Fixed term</option>
              <option value="MONTH_TO_MONTH">Month-to-month</option>
            </select>
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Start date *</label>
              <input type="date" value={form.start_date} onChange={e => set("start_date", e.target.value)} className={inp} />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">End date *</label>
              <input type="date" value={form.end_date} onChange={e => set("end_date", e.target.value)} className={inp} />
            </div>
          </div>

          {/* Rent + deposit */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Monthly rent *</label>
              <input type="number" min="0" step="0.01" value={form.monthly_rent}
                onChange={e => set("monthly_rent", e.target.value)} placeholder="2000" className={inp} />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Security deposit</label>
              <input type="number" min="0" step="0.01" value={form.security_deposit}
                onChange={e => set("security_deposit", e.target.value)} placeholder="2000" className={inp} />
            </div>
          </div>

          {/* Landlord name */}
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Landlord name</label>
            <input value={form.landlord_name} onChange={e => set("landlord_name", e.target.value)}
              placeholder="Enter landlord name" className={inp} />
          </div>

          {/* Landlord email + phone */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Landlord email</label>
              <input type="email" value={form.landlord_email} onChange={e => set("landlord_email", e.target.value)}
                placeholder="landlord@example.com" className={inp} />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Landlord phone</label>
              <input type="tel" value={form.landlord_phone} onChange={e => set("landlord_phone", e.target.value)}
                placeholder="(555) 000-0000" className={inp} />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Notes</label>
            <textarea value={form.notes} onChange={e => set("notes", e.target.value)} rows={2}
              className={`${inp} resize-none`} />
          </div>

          {/* Template selection */}
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Lease agreement template</label>
            {selectedTemplateId ? (
              <div className="flex items-center gap-2 border border-violet-200 bg-violet-50 rounded-xl px-3 py-2.5">
                <span className="text-violet-500">✨</span>
                <span className="text-sm text-violet-800 font-medium flex-1 truncate">
                  {templates.find(t => t.id === selectedTemplateId)?.name}
                </span>
                <button type="button" onClick={() => setSelectedTemplateId("")}
                  className="text-xs text-slate-400 hover:text-slate-600 shrink-0">
                  × Remove
                </button>
              </div>
            ) : (
              <button type="button" onClick={() => setShowTemplatePicker(p => !p)}
                className="w-full flex items-center gap-2 px-3 py-2.5 border border-dashed border-slate-300 hover:border-violet-400 hover:bg-violet-50 rounded-xl text-sm text-slate-500 hover:text-violet-700 transition-colors group">
                <svg className="w-4 h-4 group-hover:text-violet-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                ✨ Select template for AI-generated agreement
                <svg className="w-3.5 h-3.5 ml-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={showTemplatePicker ? "M5 15l7-7 7 7" : "M19 9l-7 7-7-7"} />
                </svg>
              </button>
            )}
            {showTemplatePicker && !selectedTemplateId && (
              <div className="mt-1 border border-slate-200 rounded-xl shadow-sm overflow-hidden">
                {templates.length === 0 ? (
                  <div className="px-4 py-3 text-xs text-slate-400 text-center italic">
                    No templates yet — go to Settings → Templates to upload one.
                  </div>
                ) : (
                  <ul className="divide-y divide-slate-100 max-h-48 overflow-y-auto">
                    {templates.map(t => (
                      <li key={t.id}>
                        <button type="button"
                          onClick={() => { setSelectedTemplateId(t.id); setShowTemplatePicker(false); }}
                          className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-violet-50 transition-colors text-left">
                          <div className="w-7 h-7 rounded-lg bg-violet-100 flex items-center justify-center shrink-0">
                            <svg className="w-3.5 h-3.5 text-violet-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                            </svg>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-slate-800 truncate">{t.name}</p>
                            {t.description && <p className="text-[13px] text-slate-400 truncate">{t.description}</p>}
                          </div>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>

          <div className="pt-2 flex gap-3">
            <button type="button" onClick={onClose}
              className="flex-1 px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50">
              Cancel
            </button>
            <button type="submit" disabled={isWorking}
              className="flex-1 px-4 py-2 bg-black text-white rounded-lg text-sm font-medium hover:bg-slate-800 disabled:opacity-50 flex items-center justify-center gap-2">
              {generating ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Generating document…
                </>
              ) : saving ? "Creating…" : selectedTemplateId ? "Create & Generate Document" : "Create lease"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Send for signature drawer ────────────────────────────────────────────────

function SendForSignatureDrawer({ row, onClose, onSent }: {
  row: TenantRow;
  onClose: () => void;
  onSent: () => void;
}) {
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState("");

  async function handleSend() {
    if (!row.lease) return;
    setSending(true); setErr("");
    try {
      await leasesApi.sendForSignature(row.lease.id);
      onSent();
      onClose();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Failed to send for signature");
    } finally { setSending(false); }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h2 className="text-sm font-semibold text-slate-900">Lease agreement — {row.name}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-lg">✕</button>
        </div>
        <div className="p-5 space-y-4">
          {row.lease?.document_url ? (
            <div className="rounded-lg border border-slate-200 p-3 bg-slate-50 flex items-center gap-3">
              <span className="text-2xl">📄</span>
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-900">Lease document ready</p>
                <a href={row.lease.document_url} target="_blank" rel="noreferrer" className="text-xs text-violet-600 hover:underline">View document ↗</a>
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-amber-200 p-3 bg-amber-50">
              <p className="text-sm text-amber-700">No document generated yet. Please generate a lease document from the <Link href={`/leases?leaseId=${row.lease?.id}`} className="underline font-medium">lease page</Link> first.</p>
            </div>
          )}
          <div className="text-xs text-slate-500 space-y-1">
            {row.lease?.start_date && <p>Start: <span className="font-medium text-slate-700">{row.lease.start_date}</span></p>}
            {row.lease?.end_date && <p>End: <span className="font-medium text-slate-700">{row.lease.end_date}</span></p>}
            {row.lease?.monthly_rent && <p>Monthly rent: <span className="font-medium text-slate-700">${row.lease.monthly_rent.toLocaleString()}</span></p>}
          </div>
          {err && <p className="text-sm text-red-600">{err}</p>}
        </div>
        <div className="flex gap-2 px-5 pb-5">
          <button onClick={onClose} className="flex-1 py-2 text-sm border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">Cancel</button>
          <button onClick={handleSend} disabled={sending || !row.lease?.document_url} className="flex-1 py-2 text-sm bg-black text-white rounded-lg hover:bg-slate-800 transition-colors disabled:opacity-50 font-medium">
            {sending ? "Sending…" : "✉ Send for signature"}
          </button>
        </div>
      </div>
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

// ─── Check reference emails button ────────────────────────────────────────────

function CheckRefEmailsButton({ cards }: { cards: TenantRow[] }) {
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [err, setErr] = useState("");

  const refSentCards = cards.filter(c => c.employerRefSent || c.landlordRefSent);
  const disabled = checking || refSentCards.length === 0;

  async function handleCheck() {
    setChecking(true); setResult(null); setErr("");
    try {
      const res = await tenantsApi.checkReferenceEmailsNow();
      setResult((res.new_responses > 0 ? "✓ " : "ℹ ") + res.message);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Check failed");
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="mt-1.5">
      <button
        onClick={handleCheck}
        disabled={disabled}
        title={refSentCards.length === 0 ? "No tenants have had reference emails sent yet" : `Check replies for ${refSentCards.length} tenant${refSentCards.length > 1 ? "s" : ""} with sent references`}
        className="w-full px-2 py-1.5 text-[13px] font-medium border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        {checking ? "Checking…" : `📬 Check reference emails${refSentCards.length > 0 ? ` (${refSentCards.length})` : ""}`}
      </button>
      {result && <p className="mt-1 text-[12px] text-emerald-600 text-center">{result}</p>}
      {err && <p className="mt-1 text-[12px] text-red-500 text-center">{err}</p>}
    </div>
  );
}

function CheckLeaseSignaturesButton({ cards, onUpdated }: { cards: TenantRow[]; onUpdated: () => void }) {
  const [checking, setChecking] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const [errors, setErrors] = useState<{ name: string; msg: string }[]>([]);

  const pendingCards = cards.filter(c => c.lease && ["sent", "delivered", "tenant_signed"].includes(c.lease.signature_status ?? ""));

  async function handleCheck() {
    setChecking(true); setSummary(null); setErrors([]);
    const outcomes = await Promise.allSettled(
      pendingCards.map(c => leasesApi.checkSignatureStatus(c.lease!.id))
    );
    const errs: { name: string; msg: string }[] = [];
    outcomes.forEach((o, i) => {
      if (o.status === "rejected") {
        const raw = o.reason instanceof Error ? o.reason.message : String(o.reason);
        errs.push({ name: pendingCards[i].name, msg: raw });
      }
    });
    const ok = outcomes.filter(o => o.status === "fulfilled").length;
    setSummary(ok > 0 ? `✓ Checked ${ok} lease${ok > 1 ? "s" : ""}${errs.length > 0 ? ` · ${errs.length} error${errs.length > 1 ? "s" : ""}` : ""}` : errs.length > 0 ? null : "✓ All leases up to date");
    setErrors(errs);
    setChecking(false);
    if (ok > 0) onUpdated();
  }

  return (
    <div className="mt-1.5 space-y-1">
      <button
        onClick={handleCheck}
        disabled={checking || pendingCards.length === 0}
        title={pendingCards.length === 0 ? "No leases with pending signatures" : `Check signature status for ${pendingCards.length} lease${pendingCards.length > 1 ? "s" : ""}`}
        className="w-full px-2 py-1.5 text-[13px] font-medium border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        {checking ? "Checking…" : `🖊 Check lease signatures${pendingCards.length > 0 ? ` (${pendingCards.length})` : ""}`}
      </button>
      {summary && <p className="text-[12px] text-emerald-600 text-center">{summary}</p>}
      {errors.length > 0 && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 space-y-1">
          <p className="text-[11px] font-semibold text-red-600 uppercase tracking-wide">Send errors</p>
          {errors.map((e, i) => (
            <div key={i}>
              <p className="text-[12px] font-medium text-red-700">{e.name}</p>
              <p className="text-[12px] text-red-500">{e.msg}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Workflow Screening Drawer ────────────────────────────────────────────────

type AppStatus = "NOT_STARTED" | "IN_REVIEW" | "MORE_INFO_REQUESTED" | "APPROVED" | "DECLINED";
const APP_STATUSES: AppStatus[] = ["NOT_STARTED", "IN_REVIEW", "MORE_INFO_REQUESTED", "APPROVED", "DECLINED"];
const APP_STATUS_LABELS: Record<AppStatus, string> = {
  NOT_STARTED: "Not started", IN_REVIEW: "In review", MORE_INFO_REQUESTED: "More info requested",
  APPROVED: "Approved", DECLINED: "Declined",
};
const APP_STATUS_STYLES: Record<AppStatus, string> = {
  APPROVED: "bg-emerald-100 text-emerald-700", IN_REVIEW: "bg-blue-100 text-blue-700",
  NOT_STARTED: "bg-slate-100 text-slate-500", DECLINED: "bg-red-100 text-red-600",
  MORE_INFO_REQUESTED: "bg-amber-100 text-amber-700",
};
function asAppStatus(s: string): AppStatus {
  return (APP_STATUSES as string[]).includes(s) ? (s as AppStatus) : "NOT_STARTED";
}

function BigScoreRing({ score }: { score: number | null }) {
  const s = score ?? 0;
  const color = score === null ? "#cbd5e1" : s >= 80 ? "#22c55e" : s >= 60 ? "#f59e0b" : "#ef4444";
  const r = 22, circ = 2 * Math.PI * r, dash = score === null ? 0 : (s / 100) * circ;
  return (
    <div className="relative w-14 h-14 flex items-center justify-center shrink-0">
      <svg width="56" height="56" className="-rotate-90">
        <circle cx="28" cy="28" r={r} fill="none" stroke="#f1f5f9" strokeWidth="4" />
        <circle cx="28" cy="28" r={r} fill="none" stroke={color} strokeWidth="4" strokeDasharray={`${dash} ${circ}`} strokeLinecap="round" />
      </svg>
      <span className="absolute text-xs font-bold text-slate-900">{score !== null ? score : "—"}</span>
    </div>
  );
}

const IMAGE_EXT_RE = /\.(jpe?g|png|webp|gif)$/i;
const NOTE_COLLAPSE_THRESHOLD = 160;

function WorkflowScreeningDrawer({
  tenant,
  unit,
  criminalEnabled,
  rentalHistoryEnabled,
  onClose,
  onStatusChange,
}: {
  tenant: TenantOut;
  unit: { label: string; rent: number } | null;
  criminalEnabled: boolean;
  rentalHistoryEnabled: boolean;
  onClose: () => void;
  onStatusChange: (id: string, status: string) => void;
}) {
  const [detail, setDetail] = useState<TenantApplicationOut | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(true);
  const [ai, setAi] = useState<TenantAiScreenOut | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState("");
  const [notes, setNotes] = useState<TenantScreeningNoteOut[]>([]);
  const [loadingNotes, setLoadingNotes] = useState(true);
  const [newNote, setNewNote] = useState("");
  const [addingNote, setAddingNote] = useState(false);
  const [noteError, setNoteError] = useState("");
  const [expandedNotes, setExpandedNotes] = useState<Set<string>>(new Set());
  const [savingStatus, setSavingStatus] = useState<AppStatus | null>(null);
  const [statusError, setStatusError] = useState("");
  const [openSections, setOpenSections] = useState<Set<string>>(new Set(["ai", "financials", "employer", "landlord"]));
  const [letterDrafts, setLetterDrafts] = useState<Record<string, EmployerReferenceLetterOut>>({});
  const [sendChannels, setSendChannels] = useState<Record<string, { email: boolean; sms: boolean }>>({});
  const [sendingLetter, setSendingLetter] = useState<Record<string, boolean>>({});
  const [contactError, setContactError] = useState<Record<string, string>>({});
  const [letterError, setLetterError] = useState<Record<string, string>>({});
  const [generatingLetter, setGeneratingLetter] = useState<Record<string, boolean>>({});
  const [missingDraft, setMissingDraft] = useState<EmployerReferenceLetterOut | null>(null);
  const [generatingMissing, setGeneratingMissing] = useState(false);
  const [missingError, setMissingError] = useState("");
  const [missingChannels, setMissingChannels] = useState({ email: true, sms: false });
  const [sendingMissing, setSendingMissing] = useState(false);
  const [checkingEmails, setCheckingEmails] = useState(false);
  const [checkEmailResult, setCheckEmailResult] = useState<{ ok: boolean; message: string } | null>(null);

  const status = asAppStatus(tenant.application_status);
  const docCount = tenant.documents.length;

  const employmentWithRef = (detail?.employment_history ?? []).filter(e => e.employer_reference_name);
  const addressesWithRef = (detail?.address_history ?? []).filter(a => a.landlord_name);
  const monthlyIncome = detail?.household_income_annual
    ? detail.household_income_annual / 12
    : detail?.personal_income_annual ? detail.personal_income_annual / 12 : null;
  const incomeRatio = monthlyIncome && unit ? monthlyIncome / unit.rent : null;

  const empRefSent = notes.some(n => n.note.includes("(employer reference)"));
  const lldRefSent = notes.some(n => n.note.includes("(landlord reference)"));
  const tntNotified = notes.some(n => n.note.includes("requesting missing application info"));
  const empRefAnalyzed = notes.some(n => n.note.includes("employer reference)") && n.note.includes("Reference reply received from"));
  const lldRefAnalyzed = notes.some(n => n.note.includes("landlord reference)") && n.note.includes("Reference reply received from"));

  async function refreshNotes() {
    const n = await tenantsApi.listNotes(tenant.id);
    setNotes(n);
  }

  useEffect(() => {
    let cancelled = false;
    tenantsApi.getApplication(tenant.id)
      .then(d => { if (!cancelled) setDetail(d); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoadingDetail(false); });
    tenantsApi.listNotes(tenant.id)
      .then(n => { if (!cancelled) setNotes(n); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoadingNotes(false); });
    return () => { cancelled = true; };
  }, [tenant.id]);

  function SectionHeader({ id, label, badge }: { id: string; label: string; badge?: React.ReactNode }) {
    return (
      <button type="button" onClick={() => setOpenSections(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; })}
        className="w-full flex items-center justify-between py-1 text-left">
        <span className="flex items-center gap-2">
          <span className="text-[13px] uppercase tracking-wider text-slate-400 font-medium">{label}</span>
          {badge}
        </span>
        <svg className={`w-4 h-4 text-slate-400 transition-transform ${openSections.has(id) ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
    );
  }

  async function handleDecide(s: AppStatus, missingItems?: { noEmployer: boolean; noLandlord: boolean; noDocs: boolean }) {
    setSavingStatus(s); setStatusError("");
    try {
      await tenantsApi.updateScreening(tenant.id, { application_status: s });
      onStatusChange(tenant.id, s);
      if (s === "MORE_INFO_REQUESTED" && missingItems) {
        setOpenSections(prev => {
          const next = new Set(prev);
          if (missingItems.noEmployer) next.add("employer");
          if (missingItems.noLandlord) next.add("landlord");
          if (missingItems.noDocs) next.add("documents");
          return next;
        });
      }
      await refreshNotes();
    } catch (e: unknown) {
      setStatusError(e instanceof Error ? e.message : "Failed to save decision");
    } finally { setSavingStatus(null); }
  }

  async function handleRunScreening() {
    setAiLoading(true); setAiError("");
    try { const r = await tenantsApi.aiScreen(tenant.id); setAi(r); }
    catch (e: unknown) { setAiError(e instanceof Error ? e.message : "Failed to run screening"); }
    finally { setAiLoading(false); }
  }

  async function handleAddNote() {
    if (!newNote.trim()) return;
    setAddingNote(true); setNoteError("");
    try { const saved = await tenantsApi.addNote(tenant.id, newNote.trim()); setNotes(prev => [saved, ...prev]); setNewNote(""); }
    catch (e: unknown) { setNoteError(e instanceof Error ? e.message : "Failed to add note"); }
    finally { setAddingNote(false); }
  }

  type ReferenceKind = "EMPLOYMENT" | "ADDRESS";

  async function handleGenerateLetter(kind: ReferenceKind, refId: string, hasEmail: boolean, hasPhone: boolean) {
    setGeneratingLetter(prev => ({ ...prev, [refId]: true }));
    setLetterError(prev => ({ ...prev, [refId]: "" }));
    const gen = kind === "EMPLOYMENT" ? tenantsApi.generateReferenceLetter : tenantsApi.generateLandlordReferenceLetter;
    try {
      const letter = await gen(tenant.id, refId);
      setLetterDrafts(prev => ({ ...prev, [refId]: letter }));
      setSendChannels(prev => ({ ...prev, [refId]: { email: hasEmail, sms: !hasEmail && hasPhone } }));
    } catch (e: unknown) { setLetterError(prev => ({ ...prev, [refId]: e instanceof Error ? e.message : "Failed to generate" })); }
    finally { setGeneratingLetter(prev => ({ ...prev, [refId]: false })); }
  }

  async function handleSendLetter(kind: ReferenceKind, refId: string) {
    const letter = letterDrafts[refId]; const channels = sendChannels[refId];
    if (!letter || !channels || (!channels.email && !channels.sms)) return;
    setSendingLetter(prev => ({ ...prev, [refId]: true }));
    setContactError(prev => ({ ...prev, [refId]: "" }));
    const contact = kind === "EMPLOYMENT" ? tenantsApi.contactEmployerReference : tenantsApi.contactLandlordReference;
    try {
      if (channels.email) { const n = await contact(tenant.id, refId, "EMAIL", letter); setNotes(prev => [n, ...prev]); }
      if (channels.sms) { const n = await contact(tenant.id, refId, "SMS", letter); setNotes(prev => [n, ...prev]); }
      setLetterDrafts(prev => { const next = { ...prev }; delete next[refId]; return next; });
    } catch (e: unknown) { setContactError(prev => ({ ...prev, [refId]: e instanceof Error ? e.message : "Failed to send" })); }
    finally { setSendingLetter(prev => ({ ...prev, [refId]: false })); }
  }

  async function handleGenerateMissingMsg(missing: string[]) {
    setGeneratingMissing(true); setMissingError("");
    try { const d = await tenantsApi.generateMissingInfoMessage(tenant.id, missing); setMissingDraft(d); }
    catch (e: unknown) { setMissingError(e instanceof Error ? e.message : "Failed to generate"); }
    finally { setGeneratingMissing(false); }
  }

  async function handleSendMissingMsg() {
    if (!missingDraft) return;
    setSendingMissing(true); setMissingError("");
    try {
      if (missingChannels.email) { const n = await tenantsApi.notifyMissingInfo(tenant.id, "EMAIL", missingDraft.subject, missingDraft.body); setNotes(prev => [n, ...prev]); }
      if (missingChannels.sms) { const n = await tenantsApi.notifyMissingInfo(tenant.id, "SMS", missingDraft.subject, missingDraft.body); setNotes(prev => [n, ...prev]); }
      setMissingDraft(null);
    } catch (e: unknown) { setMissingError(e instanceof Error ? e.message : "Failed to send"); }
    finally { setSendingMissing(false); }
  }

  async function handleCheckEmails() {
    setCheckingEmails(true); setCheckEmailResult(null);
    try {
      const res = await tenantsApi.checkReferenceEmailsNow();
      setCheckEmailResult(res);
      if (res.new_responses > 0) await refreshNotes();
    } catch (e: unknown) { setCheckEmailResult({ ok: false, message: e instanceof Error ? e.message : "Check failed" }); }
    finally { setCheckingEmails(false); }
  }

  function toggleNoteExpanded(id: string) {
    setExpandedNotes(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  }

  const initials = (name: string) => name.split(" ").filter(Boolean).slice(0, 2).map(p => p[0]?.toUpperCase()).join("") || "?";

  return (
    <div className="fixed inset-0 bg-black/30 z-50 flex justify-end" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-sm bg-white h-full shadow-2xl flex flex-col overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 bg-black border-b border-slate-800 shrink-0">
          <h2 className="text-white text-sm font-semibold">Screening report</h2>
          <button onClick={onClose} className="text-white/60 hover:text-white text-lg">✕</button>
        </div>
        <div className="p-5 space-y-5">
          {/* Header */}
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-black text-white text-sm font-bold flex items-center justify-center shrink-0">
              {initials(tenant.full_name)}
            </div>
            <div>
              <p className="font-semibold text-slate-900">{tenant.full_name}</p>
              <p className="text-xs text-slate-500">{tenant.email} · {tenant.phone || "no phone"}</p>
              {unit && <p className="text-xs text-slate-500 mt-0.5">Applied for {unit.label}</p>}
            </div>
          </div>

          {/* Outreach badges */}
          {(empRefSent || lldRefSent || tntNotified) && (
            <div className="flex flex-wrap gap-1.5">
              {empRefSent && (
                empRefAnalyzed && tenant.employer_ref_summary ? (
                  <span className="flex items-center gap-1 text-[12px] font-medium border px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 border-violet-200">
                    <ScoreRing score={refScore(tenant.employer_ref_summary)} />
                    📬 Employer ref received
                  </span>
                ) : (
                  <span className={`flex items-center gap-1 text-[12px] font-medium border px-2 py-0.5 rounded-full ${empRefAnalyzed ? "bg-violet-100 text-violet-700 border-violet-200" : "bg-emerald-50 text-emerald-700 border-emerald-200"}`}>
                    {empRefAnalyzed ? "📬" : "✓"} {empRefAnalyzed ? "Employer ref received" : "Employer ref sent"}
                  </span>
                )
              )}
              {lldRefSent && (
                lldRefAnalyzed && tenant.landlord_ref_summary ? (
                  <span className="flex items-center gap-1 text-[12px] font-medium border px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 border-violet-200">
                    <ScoreRing score={refScore(tenant.landlord_ref_summary)} />
                    📬 Landlord ref received
                  </span>
                ) : (
                  <span className={`flex items-center gap-1 text-[12px] font-medium border px-2 py-0.5 rounded-full ${lldRefAnalyzed ? "bg-violet-100 text-violet-700 border-violet-200" : "bg-emerald-50 text-emerald-700 border-emerald-200"}`}>
                    {lldRefAnalyzed ? "📬" : "✓"} {lldRefAnalyzed ? "Landlord ref received" : "Landlord ref sent"}
                  </span>
                )
              )}
              {tntNotified && (
                <span className="flex items-center gap-1 text-[12px] font-medium bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded-full">✓ Tenant notified</span>
              )}
            </div>
          )}

          {/* AI summary */}
          <div className="border-b border-slate-100 pb-1">
            <SectionHeader id="ai" label="AI summary" />
          </div>
          {openSections.has("ai") && (
            <div className="rounded-xl border border-slate-200 p-3.5">
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-[12px] uppercase tracking-wider font-medium text-slate-500">AI summary</p>
                <button type="button" onClick={handleRunScreening} disabled={aiLoading}
                  className="text-[13px] font-medium text-violet-700 hover:text-violet-900 disabled:opacity-50">
                  {aiLoading ? "Running…" : ai ? "Run again" : "✨ Run screening"}
                </button>
              </div>
              {aiError && <p className="text-xs text-red-600">{aiError}</p>}
              {ai ? (
                <div className="flex items-start gap-3">
                  <BigScoreRing score={ai.score} />
                  <p className="text-xs leading-relaxed text-slate-700 flex-1">{ai.verdict}</p>
                </div>
              ) : !aiError && (
                <p className="text-xs text-slate-400">Not run yet — click "Run screening" for an AI-written summary.</p>
              )}
            </div>
          )}

          {/* Financials */}
          <div className="border-b border-slate-100 pb-1">
            <SectionHeader id="financials" label="Financials" />
          </div>
          {openSections.has("financials") && (
            <div className="bg-slate-50 rounded-xl p-4 grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-[13px] text-slate-400 uppercase tracking-wider">Monthly income</p>
                <p className="font-bold text-slate-900 mt-0.5">{monthlyIncome ? `$${monthlyIncome.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : "—"}</p>
              </div>
              <div>
                <p className="text-[13px] text-slate-400 uppercase tracking-wider">Income ratio</p>
                <p className={`font-bold mt-0.5 ${incomeRatio && incomeRatio >= 3 ? "text-emerald-600" : incomeRatio ? "text-amber-600" : "text-slate-400"}`}>
                  {incomeRatio ? `${incomeRatio.toFixed(1)}×` : "—"}
                </p>
              </div>
              <div>
                <p className="text-[13px] text-slate-400 uppercase tracking-wider">Documents</p>
                <p className={`font-bold mt-0.5 ${docCount > 0 ? "text-emerald-600" : "text-slate-400"}`}>{docCount}</p>
              </div>
              <div>
                <p className="text-[13px] text-slate-400 uppercase tracking-wider">Employment on file</p>
                <p className="font-medium text-slate-900 text-xs mt-0.5">{detail?.employment_history?.length ? `${detail.employment_history.length} record(s)` : "None"}</p>
              </div>
              {rentalHistoryEnabled && (
                <div>
                  <p className="text-[13px] text-slate-400 uppercase tracking-wider">Evicted / refused rent</p>
                  <p className={`font-bold mt-0.5 ${detail?.evicted || detail?.refused_rent ? "text-red-600" : "text-emerald-600"}`}>
                    {detail?.evicted || detail?.refused_rent ? "Disclosed" : "None disclosed"}
                  </p>
                </div>
              )}
              {criminalEnabled && (
                <div>
                  <p className="text-[13px] text-slate-400 uppercase tracking-wider">Criminal record</p>
                  <p className={`font-bold mt-0.5 ${detail?.criminal_record ? "text-red-600" : "text-emerald-600"}`}>
                    {detail?.criminal_record ? "Disclosed" : "None disclosed"}
                  </p>
                </div>
              )}
            </div>
          )}

          {loadingDetail && <p className="text-xs text-slate-400 text-center">Loading application detail…</p>}

          {/* Documents */}
          <div className="border-b border-slate-100 pb-1">
            <SectionHeader id="documents" label="Documents" badge={docCount > 0 ? <span className="bg-slate-100 text-slate-500 rounded-full px-1.5 py-0.5 text-[12px]">{docCount}</span> : undefined} />
          </div>
          {openSections.has("documents") && (
            <div>
              {docCount === 0 ? (
                <p className="text-xs text-slate-400">No documents uploaded.</p>
              ) : (
                <div className="space-y-1.5">
                  {tenant.documents.map(d => {
                    const isImage = IMAGE_EXT_RE.test(d.filename);
                    return (
                      <a key={d.id} href={d.url} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-2.5 text-xs text-slate-700 hover:text-blue-600 border border-slate-100 rounded-lg px-2.5 py-1.5">
                        {isImage ? (
                          <img src={d.url} alt={d.original_name} className="w-10 h-10 rounded-md object-cover border border-slate-200 shrink-0" />
                        ) : (
                          <span className="w-10 h-10 rounded-md bg-slate-100 flex items-center justify-center text-slate-400 shrink-0 text-[13px] font-medium">FILE</span>
                        )}
                        <span className="truncate flex-1">{d.original_name}</span>
                        <span className="text-[12px] text-slate-400 uppercase shrink-0">{d.doc_type.replace("_", " ")}</span>
                      </a>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Employer references */}
          <div className="border-b border-slate-100 pb-1">
            <SectionHeader id="employer" label="Employer references" badge={employmentWithRef.length === 0 ? <span className="text-amber-500 text-[12px]">⚠ none</span> : <span className="bg-slate-100 text-slate-500 rounded-full px-1.5 py-0.5 text-[12px]">{employmentWithRef.length}</span>} />
          </div>
          {openSections.has("employer") && (
            <div>
              {employmentWithRef.length === 0 ? (
                <div className="rounded-lg border border-amber-100 bg-amber-50 px-3 py-2.5 text-xs text-amber-800 space-y-0.5">
                  <p className="font-medium">No employer reference on file</p>
                  <p className="text-amber-700">Ask the applicant to fill out their employment history with an employer reference contact.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {employmentWithRef.map((emp, i) => (
                    <div key={emp.id ?? i} className="border border-slate-100 rounded-lg px-3 py-2 text-xs space-y-1">
                      <p className="font-medium text-slate-900">
                        {emp.employer_reference_name}
                        {(emp.company || emp.position) && <span className="font-normal text-slate-400"> — {[emp.position, emp.company].filter(Boolean).join(" at ")}</span>}
                      </p>
                      <p className="text-slate-500">{[emp.employer_reference_phone, emp.employer_reference_email].filter(Boolean).join(" · ") || "No contact info on file"}</p>
                      {emp.id && !letterDrafts[emp.id] && (
                        <div className="pt-1">
                          <button type="button" disabled={(!emp.employer_reference_email && !emp.employer_reference_phone) || !!generatingLetter[emp.id]}
                            onClick={() => handleGenerateLetter("EMPLOYMENT", emp.id as string, !!emp.employer_reference_email, !!emp.employer_reference_phone)}
                            className="px-2 py-1 text-[13px] font-medium border border-violet-200 text-violet-700 rounded-md hover:bg-violet-50 disabled:opacity-40 disabled:cursor-not-allowed">
                            {generatingLetter[emp.id] ? "Drafting…" : "✨ AI send reference check email and sms"}
                          </button>
                        </div>
                      )}
                      {emp.id && contactError[emp.id] && <p className="text-red-600">{contactError[emp.id]}</p>}
                      {emp.id && letterError[emp.id] && <p className="text-red-600">{letterError[emp.id]}</p>}
                      {emp.id && letterDrafts[emp.id] && (
                        <div className="mt-2 border border-violet-100 bg-violet-50/50 rounded-lg p-2.5 space-y-2">
                          <p className="text-[12px] uppercase tracking-wider text-violet-500 font-medium">AI-drafted letter — review before sending</p>
                          <input value={letterDrafts[emp.id].subject}
                            onChange={e => setLetterDrafts(prev => ({ ...prev, [emp.id as string]: { ...prev[emp.id as string], subject: e.target.value } }))}
                            className="w-full text-xs font-medium border border-slate-200 rounded-md px-2 py-1 outline-none focus:border-violet-400" />
                          <textarea value={letterDrafts[emp.id].body} rows={5}
                            onChange={e => setLetterDrafts(prev => ({ ...prev, [emp.id as string]: { ...prev[emp.id as string], body: e.target.value } }))}
                            className="w-full text-xs border border-slate-200 rounded-md px-2 py-1.5 outline-none focus:border-violet-400 resize-none" />
                          <div className="flex items-center gap-3 text-slate-600">
                            <label className={`flex items-center gap-1 ${!emp.employer_reference_email ? "opacity-40" : ""}`}>
                              <input type="checkbox" disabled={!emp.employer_reference_email} checked={!!sendChannels[emp.id as string]?.email}
                                onChange={e => setSendChannels(prev => ({ ...prev, [emp.id as string]: { email: e.target.checked, sms: !!prev[emp.id as string]?.sms } }))} />
                              Email
                            </label>
                            <label className={`flex items-center gap-1 ${!emp.employer_reference_phone ? "opacity-40" : ""}`}>
                              <input type="checkbox" disabled={!emp.employer_reference_phone} checked={!!sendChannels[emp.id as string]?.sms}
                                onChange={e => setSendChannels(prev => ({ ...prev, [emp.id as string]: { email: !!prev[emp.id as string]?.email, sms: e.target.checked } }))} />
                              SMS
                            </label>
                          </div>
                          <div className="flex items-center gap-2">
                            <button type="button" disabled={!!sendingLetter[emp.id] || (!sendChannels[emp.id as string]?.email && !sendChannels[emp.id as string]?.sms)}
                              onClick={() => handleSendLetter("EMPLOYMENT", emp.id as string)}
                              className="px-2.5 py-1 text-[13px] font-medium bg-violet-600 text-white rounded-md hover:bg-violet-700 disabled:opacity-50">
                              {sendingLetter[emp.id] ? "Sending…" : "Send letter"}
                            </button>
                            <button type="button" onClick={() => setLetterDrafts(prev => { const next = { ...prev }; delete next[emp.id as string]; return next; })}
                              className="px-2.5 py-1 text-[13px] font-medium text-slate-500 hover:text-slate-700">Discard</button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Landlord references */}
          <div className="border-b border-slate-100 pb-1">
            <SectionHeader id="landlord" label="Landlord references" badge={addressesWithRef.length === 0 ? <span className="text-amber-500 text-[12px]">⚠ none</span> : <span className="bg-slate-100 text-slate-500 rounded-full px-1.5 py-0.5 text-[12px]">{addressesWithRef.length}</span>} />
          </div>
          {openSections.has("landlord") && (
            <div>
              {addressesWithRef.length === 0 ? (
                <div className="rounded-lg border border-amber-100 bg-amber-50 px-3 py-2.5 text-xs text-amber-800 space-y-0.5">
                  <p className="font-medium">No landlord reference on file</p>
                  <p className="text-amber-700">Ask the applicant to fill out their address history with a landlord reference contact.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {addressesWithRef.map((a, i) => (
                    <div key={a.id ?? i} className="border border-slate-100 rounded-lg px-3 py-2 text-xs space-y-1">
                      <p className="font-medium text-slate-900">
                        {a.landlord_name}
                        <span className="font-normal text-slate-400"> — {a.is_current ? "Current address" : "Previous address"}{a.street_address ? ` · ${a.street_address}${a.city ? `, ${a.city}` : ""}` : ""}</span>
                      </p>
                      <p className="text-slate-500">{[a.landlord_phone, a.landlord_email].filter(Boolean).join(" · ") || "No contact info on file"}</p>
                      {a.id && !letterDrafts[a.id] && (
                        <div className="pt-1">
                          <button type="button" disabled={(!a.landlord_email && !a.landlord_phone) || !!generatingLetter[a.id]}
                            onClick={() => handleGenerateLetter("ADDRESS", a.id as string, !!a.landlord_email, !!a.landlord_phone)}
                            className="px-2 py-1 text-[13px] font-medium border border-violet-200 text-violet-700 rounded-md hover:bg-violet-50 disabled:opacity-40 disabled:cursor-not-allowed">
                            {generatingLetter[a.id] ? "Drafting…" : "✨ AI send reference check email and sms"}
                          </button>
                        </div>
                      )}
                      {a.id && contactError[a.id] && <p className="text-red-600">{contactError[a.id]}</p>}
                      {a.id && letterError[a.id] && <p className="text-red-600">{letterError[a.id]}</p>}
                      {a.id && letterDrafts[a.id] && (
                        <div className="mt-2 border border-violet-100 bg-violet-50/50 rounded-lg p-2.5 space-y-2">
                          <p className="text-[12px] uppercase tracking-wider text-violet-500 font-medium">AI-drafted letter — review before sending</p>
                          <input value={letterDrafts[a.id].subject}
                            onChange={e => setLetterDrafts(prev => ({ ...prev, [a.id as string]: { ...prev[a.id as string], subject: e.target.value } }))}
                            className="w-full text-xs font-medium border border-slate-200 rounded-md px-2 py-1 outline-none focus:border-violet-400" />
                          <textarea value={letterDrafts[a.id].body} rows={5}
                            onChange={e => setLetterDrafts(prev => ({ ...prev, [a.id as string]: { ...prev[a.id as string], body: e.target.value } }))}
                            className="w-full text-xs border border-slate-200 rounded-md px-2 py-1.5 outline-none focus:border-violet-400 resize-none" />
                          <div className="flex items-center gap-3 text-slate-600">
                            <label className={`flex items-center gap-1 ${!a.landlord_email ? "opacity-40" : ""}`}>
                              <input type="checkbox" disabled={!a.landlord_email} checked={!!sendChannels[a.id as string]?.email}
                                onChange={e => setSendChannels(prev => ({ ...prev, [a.id as string]: { email: e.target.checked, sms: !!prev[a.id as string]?.sms } }))} />
                              Email
                            </label>
                            <label className={`flex items-center gap-1 ${!a.landlord_phone ? "opacity-40" : ""}`}>
                              <input type="checkbox" disabled={!a.landlord_phone} checked={!!sendChannels[a.id as string]?.sms}
                                onChange={e => setSendChannels(prev => ({ ...prev, [a.id as string]: { email: !!prev[a.id as string]?.email, sms: e.target.checked } }))} />
                              SMS
                            </label>
                          </div>
                          <div className="flex items-center gap-2">
                            <button type="button" disabled={!!sendingLetter[a.id] || (!sendChannels[a.id as string]?.email && !sendChannels[a.id as string]?.sms)}
                              onClick={() => handleSendLetter("ADDRESS", a.id as string)}
                              className="px-2.5 py-1 text-[13px] font-medium bg-violet-600 text-white rounded-md hover:bg-violet-700 disabled:opacity-50">
                              {sendingLetter[a.id] ? "Sending…" : "Send letter"}
                            </button>
                            <button type="button" onClick={() => setLetterDrafts(prev => { const next = { ...prev }; delete next[a.id as string]; return next; })}
                              className="px-2.5 py-1 text-[13px] font-medium text-slate-500 hover:text-slate-700">Discard</button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Status */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-[13px] uppercase tracking-wider text-slate-400 font-medium">Application status</p>
              <span className={`text-[13px] font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${APP_STATUS_STYLES[status]}`}>{APP_STATUS_LABELS[status]}</span>
            </div>
            {statusError && <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2 mb-2">{statusError}</p>}
            <div className="space-y-2">
              {(() => {
                const missing = [
                  ...(employmentWithRef.length === 0 ? ["employer_reference"] : []),
                  ...(addressesWithRef.length === 0 ? ["landlord_reference"] : []),
                  ...(docCount === 0 ? ["id_documents"] : []),
                ];
                if (missing.length === 0) return null;
                return (
                  <>
                    <button type="button" disabled={generatingMissing || !!missingDraft}
                      onClick={() => handleGenerateMissingMsg(missing)}
                      className="w-full py-2 text-sm border border-amber-300 text-amber-800 rounded-lg hover:bg-amber-50 transition-colors disabled:opacity-50 font-medium">
                      {generatingMissing ? "Drafting…" : "✨ Notify tenant (AI draft)"}
                    </button>
                    {missingDraft && (
                      <div className="border border-amber-200 bg-amber-50/60 rounded-xl p-3 space-y-2 text-xs">
                        <p className="text-[12px] uppercase tracking-wider text-amber-600 font-medium">AI-drafted message — review before sending</p>
                        {missingError && <p className="text-red-600">{missingError}</p>}
                        <input value={missingDraft.subject} onChange={e => setMissingDraft(d => d ? { ...d, subject: e.target.value } : d)}
                          className="w-full font-medium border border-slate-200 rounded-md px-2 py-1 outline-none focus:border-amber-400 bg-white" />
                        <textarea value={missingDraft.body} rows={6} onChange={e => setMissingDraft(d => d ? { ...d, body: e.target.value } : d)}
                          className="w-full border border-slate-200 rounded-md px-2 py-1.5 outline-none focus:border-amber-400 resize-none bg-white" />
                        <div className="flex items-center gap-3 text-slate-600">
                          <label className={`flex items-center gap-1 ${!tenant.email ? "opacity-40" : ""}`}>
                            <input type="checkbox" disabled={!tenant.email} checked={missingChannels.email}
                              onChange={e => setMissingChannels(c => ({ ...c, email: e.target.checked }))} />
                            Email
                          </label>
                          <label className={`flex items-center gap-1 ${!tenant.phone ? "opacity-40" : ""}`}>
                            <input type="checkbox" disabled={!tenant.phone} checked={missingChannels.sms}
                              onChange={e => setMissingChannels(c => ({ ...c, sms: e.target.checked }))} />
                            SMS
                          </label>
                        </div>
                        <div className="flex gap-2">
                          <button type="button" disabled={sendingMissing || (!missingChannels.email && !missingChannels.sms)} onClick={handleSendMissingMsg}
                            className="px-2.5 py-1 text-[13px] font-medium bg-amber-600 text-white rounded-md hover:bg-amber-700 disabled:opacity-50">
                            {sendingMissing ? "Sending…" : "Send to tenant"}
                          </button>
                          <button type="button" onClick={() => setMissingDraft(null)}
                            className="px-2.5 py-1 text-[13px] font-medium text-slate-500 hover:text-slate-700">Discard</button>
                        </div>
                      </div>
                    )}
                  </>
                );
              })()}
              {status !== "APPROVED" && (
                <button onClick={() => handleDecide("APPROVED")} disabled={savingStatus !== null}
                  className="w-full py-2 text-sm bg-black text-white rounded-lg hover:bg-slate-800 font-medium transition-colors disabled:opacity-50">
                  {savingStatus === "APPROVED" ? "Saving…" : "Approve applicant"}
                </button>
              )}
              {status !== "DECLINED" && (
                <button onClick={() => handleDecide("DECLINED")} disabled={savingStatus !== null}
                  className="w-full py-2 text-sm border border-red-200 text-red-600 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50">
                  {savingStatus === "DECLINED" ? "Saving…" : "Decline applicant"}
                </button>
              )}
              {status !== "MORE_INFO_REQUESTED" && (
                <button onClick={() => handleDecide("MORE_INFO_REQUESTED", {
                  noEmployer: employmentWithRef.length === 0, noLandlord: addressesWithRef.length === 0, noDocs: docCount === 0,
                })} disabled={savingStatus !== null}
                  className="w-full py-2 text-sm border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50">
                  {savingStatus === "MORE_INFO_REQUESTED" ? "Saving…" : "Request more info"}
                </button>
              )}
              {status !== "IN_REVIEW" && (
                <button onClick={() => handleDecide("IN_REVIEW")} disabled={savingStatus !== null}
                  className="w-full py-2 text-sm border border-blue-200 text-blue-600 rounded-lg hover:bg-blue-50 transition-colors disabled:opacity-50">
                  {savingStatus === "IN_REVIEW" ? "Saving…" : "Mark as in review"}
                </button>
              )}
              {status !== "NOT_STARTED" && (
                <button onClick={() => handleDecide("NOT_STARTED")} disabled={savingStatus !== null}
                  className="w-full py-1.5 text-xs text-slate-400 hover:text-slate-600 transition-colors disabled:opacity-50">
                  {savingStatus === "NOT_STARTED" ? "Saving…" : "Reset to not started"}
                </button>
              )}
            </div>
          </div>

          {/* Check reference emails */}
          <div className="border border-slate-200 rounded-xl p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-[13px] font-semibold text-slate-800">Check reference emails</p>
                <p className="text-[12px] text-slate-400">Scan inbox for replies and auto-summarize with AI</p>
              </div>
              <button type="button" onClick={handleCheckEmails} disabled={checkingEmails}
                className="shrink-0 px-3 py-1.5 text-[13px] font-medium border border-violet-200 text-violet-700 rounded-lg hover:bg-violet-50 transition-colors disabled:opacity-50">
                {checkingEmails ? "Checking…" : "Check now"}
              </button>
            </div>
            {checkEmailResult && (
              <p className={`text-[12px] ${checkEmailResult.ok ? "text-emerald-600" : "text-red-600"}`}>
                {checkEmailResult.ok ? "✓ " : "✗ "}{checkEmailResult.message}
              </p>
            )}
          </div>

          {/* Notes */}
          <div className="border-b border-slate-100 pb-1">
            <SectionHeader id="notes" label="Notes" badge={notes.length > 0 ? <span className="bg-slate-100 text-slate-500 rounded-full px-1.5 py-0.5 text-[12px]">{notes.length}</span> : undefined} />
          </div>
          {openSections.has("notes") && (
            <div>
              <div className="space-y-2 mb-2 mt-2">
                <textarea value={newNote} onChange={e => setNewNote(e.target.value)} rows={2}
                  placeholder="Add a note about this applicant…"
                  className="w-full text-xs border border-slate-200 rounded-lg px-2.5 py-2 outline-none focus:border-black resize-none" />
                {noteError && <p className="text-xs text-red-600">{noteError}</p>}
                <button type="button" onClick={handleAddNote} disabled={addingNote || !newNote.trim()}
                  className="px-3 py-1.5 text-xs font-medium bg-black text-white rounded-lg hover:bg-slate-800 disabled:opacity-50">
                  {addingNote ? "Adding…" : "Add note"}
                </button>
              </div>
              {loadingNotes && <p className="text-xs text-slate-400">Loading notes…</p>}
              {!loadingNotes && notes.length === 0 && <p className="text-xs text-slate-400">No notes yet.</p>}
              <div className="space-y-1.5">
                {notes.map(n => {
                  if (n.kind === "STATUS_CHANGE") {
                    return (
                      <p key={n.id} className="text-[13px] text-slate-400 italic px-0.5">
                        {n.note} — <span className="font-medium">{n.author_name}</span>, {new Date(n.created_at).toLocaleString()}
                      </p>
                    );
                  }
                  const isLong = n.note.length > NOTE_COLLAPSE_THRESHOLD;
                  const isExpanded = expandedNotes.has(n.id);
                  const displayText = isLong && !isExpanded ? n.note.slice(0, NOTE_COLLAPSE_THRESHOLD).trimEnd() + "…" : n.note;
                  return (
                    <div key={n.id} className="border border-slate-100 rounded-lg px-2.5 py-2">
                      <p className="text-xs text-slate-700 whitespace-pre-wrap">{displayText}</p>
                      {isLong && (
                        <button type="button" onClick={() => toggleNoteExpanded(n.id)}
                          className="text-[12px] font-medium text-violet-600 hover:text-violet-800 mt-1">
                          {isExpanded ? "Show less" : "Show more"}
                        </button>
                      )}
                      <p className="text-[12px] text-slate-400 mt-1">{n.author_name} · {new Date(n.created_at).toLocaleString()}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

const HIDDEN_KEY = "workflow_hidden_ids";

export default function WorkflowPage() {
  const { user } = useAuth();
  const [allRows, setAllRows] = useState<TenantRow[]>([]);
  const [allPersons, setAllPersons] = useState<TenantOut[]>([]);
  const [allUnits, setAllUnits] = useState<UnitDetailOut[]>([]);
  const [screeningTenantId, setScreeningTenantId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<"all" | "new" | "renew">("all");
  const [aiReviewTenant, setAiReviewTenant] = useState<TenantRow | null>(null);
  const [batchReviewTenants, setBatchReviewTenants] = useState<TenantRow[] | null>(null);
  const [removingTenant, setRemovingTenant] = useState<TenantRow | null>(null);
  const [moreInfoRow, setMoreInfoRow] = useState<TenantRow | null>(null);
  const [createLeaseRow, setCreateLeaseRow] = useState<TenantRow | null>(null);
  const [batchCreateLeaseRows, setBatchCreateLeaseRows] = useState<TenantRow[] | null>(null);
  const [sendSigRow, setSendSigRow] = useState<TenantRow | null>(null);
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
      setAllUnits(units);
      setAllPersons(persons);
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
        const isRenew = lease?.lease_type === "MONTH_TO_MONTH" || lease?.status === "RENEWED";
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
          employerRefAnalyzed: t.employer_ref_analyzed,
          landlordRefAnalyzed: t.landlord_ref_analyzed,
          employerRefSummary: t.employer_ref_summary ?? null,
          landlordRefSummary: t.landlord_ref_summary ?? null,
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
  const visible = allRows.filter(r => !hiddenIds.has(r.id) && r.screeningStatus !== "DECLINED" && (filter === "all" || r.kind === filter));
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

      {/* More info drawer */}
      {moreInfoRow && <MoreInfoDrawer row={moreInfoRow} onClose={() => setMoreInfoRow(null)} onSaved={load} />}

      {/* Create lease modal */}
      {createLeaseRow && (
        <CreateLeaseModal row={createLeaseRow} units={allUnits} onClose={() => setCreateLeaseRow(null)} onCreated={load} />
      )}

      {/* Batch create lease modal */}
      {batchCreateLeaseRows && (
        <BatchCreateLeaseModal rows={batchCreateLeaseRows} units={allUnits} onClose={() => setBatchCreateLeaseRows(null)} onCreated={load} />
      )}

      {/* Send for signature drawer */}
      {sendSigRow && (
        <SendForSignatureDrawer row={sendSigRow} onClose={() => setSendSigRow(null)} onSent={load} />
      )}

      {/* Screening report drawer */}
      {screeningTenantId && (() => {
        const person = allPersons.find(p => p.id === screeningTenantId);
        if (!person) return null;
        const row = allRows.find(r => r.id === screeningTenantId);
        const interestedUnit = row?.interestedUnitId ? allUnits.find(u => u.id === row.interestedUnitId) : null;
        const unitInfo = interestedUnit ? { label: `${interestedUnit.property_name} — Unit ${interestedUnit.unit_number}`, rent: interestedUnit.monthly_rent } : null;
        return (
          <WorkflowScreeningDrawer
            tenant={person}
            unit={unitInfo}
            criminalEnabled={user?.screening_criminal_record_enabled ?? false}
            rentalHistoryEnabled={user?.screening_rental_history_enabled ?? false}
            onClose={() => setScreeningTenantId(null)}
            onStatusChange={(id, status) => {
              setAllRows(prev => prev.map(r => r.id === id ? { ...r, screeningStatus: status } : r));
            }}
          />
        );
      })()}

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
                      ✨ Send reference check to tenants ({cards.length})
                    </button>
                  )}
                  {stage.key === "screening" && (
                    <CheckRefEmailsButton cards={cards} />
                  )}
                  {stage.key === "lease" && (
                    <>
                      {cards.some(r => !r.lease) && (
                        <button
                          onClick={() => setBatchCreateLeaseRows(cards.filter(r => !r.lease))}
                          className="mt-2 w-full px-2 py-1.5 text-[13px] font-medium border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 transition-colors"
                        >
                          📄 Create all lease agreements
                        </button>
                      )}
                      {cards.length > 0 && <CheckLeaseSignaturesButton cards={cards} onUpdated={load} />}
                    </>
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
                      onMoreInfo={setMoreInfoRow}
                      onStatusChange={(id, status) =>
                        setAllRows(prev => prev.map(r => r.id === id ? { ...r, screeningStatus: status } : r))
                      }
                      onCreateLease={setCreateLeaseRow}
                      onSendSig={setSendSigRow}
                      onOpenScreening={setScreeningTenantId}
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
