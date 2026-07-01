"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { leasesApi, tenantsApi, type LeaseOut, type UnitOut, type TenantOut } from "@/lib/api";
import { MOCK_MODE } from "@/lib/useApiData";

// ─── Types ─────────────────────────────────────────────────────────────────────

type LeaseStatus = "ACTIVE" | "PENDING" | "EXPIRED" | "TERMINATED";
type LeaseType = "FIXED" | "MONTH_TO_MONTH";

interface LeaseRow extends LeaseOut {
  _daysUntilExpiry: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<string, string> = {
  ACTIVE: "bg-emerald-100 text-emerald-700",
  PENDING: "bg-blue-100 text-blue-700",
  EXPIRED: "bg-slate-100 text-slate-500",
  TERMINATED: "bg-red-100 text-red-600",
};

const STATUS_LABEL: Record<string, string> = {
  ACTIVE: "Active",
  PENDING: "Pending",
  EXPIRED: "Expired",
  TERMINATED: "Terminated",
};

function fmt$(n: number) {
  return `$${n.toLocaleString()}`;
}

function daysUntil(dateStr: string): number {
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000);
}

function fromApi(l: LeaseOut): LeaseRow {
  return { ...l, _daysUntilExpiry: daysUntil(l.end_date) };
}

function Avatar({ name, url, size = 7 }: { name: string; url?: string | null; size?: number }) {
  const initials = name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
  if (url) return <img src={url} alt={name} className={`w-${size} h-${size} rounded-full object-cover`} />;
  return (
    <div className={`w-${size} h-${size} rounded-full bg-slate-200 flex items-center justify-center text-xs font-semibold text-slate-600`}>
      {initials}
    </div>
  );
}

// ─── Modals ────────────────────────────────────────────────────────────────────

interface CreateLeaseModalProps {
  units: UnitOut[];
  persons: TenantOut[];
  presetTenantId?: string;
  presetUnitId?: string;
  onClose: () => void;
  onSave: (lease: LeaseOut) => void;
}

function CreateLeaseModal({ units, persons, presetTenantId, presetUnitId, onClose, onSave }: CreateLeaseModalProps) {
  const [form, setForm] = useState({
    tenant_user_id: presetTenantId ?? "",
    unit_id: presetUnitId ?? "",
    start_date: "",
    end_date: "",
    monthly_rent: "",
    security_deposit: "",
    lease_type: "FIXED" as LeaseType,
    notes: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function set(k: string, v: string) { setForm(f => ({ ...f, [k]: v })); }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.tenant_user_id || !form.unit_id || !form.start_date || !form.end_date || !form.monthly_rent) {
      setError("Tenant, unit, dates, and rent are required.");
      return;
    }
    setSaving(true);
    try {
      const lease = await leasesApi.create({
        tenant_user_id: form.tenant_user_id,
        unit_id: form.unit_id,
        start_date: form.start_date,
        end_date: form.end_date,
        monthly_rent: parseFloat(form.monthly_rent),
        security_deposit: parseFloat(form.security_deposit || "0"),
        lease_type: form.lease_type,
        notes: form.notes || null,
      });
      onSave(lease);
    } catch (err: any) {
      setError(err.message ?? "Failed to create lease");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="text-base font-semibold text-slate-900">Create lease</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
        </div>
        <form onSubmit={submit} className="px-6 py-5 space-y-4">
          {error && <p className="text-red-600 text-sm bg-red-50 px-3 py-2 rounded-lg">{error}</p>}

          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Tenant *</label>
            {persons.length === 0 ? (
              <div className="border border-dashed border-slate-200 rounded-lg px-3 py-3 text-xs text-slate-400 text-center">
                No tenants found.{" "}
                <a href="/tenants" className="text-black font-medium hover:underline">Add a tenant first →</a>
              </div>
            ) : (
              <select value={form.tenant_user_id} onChange={e => set("tenant_user_id", e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black">
                <option value="">— select tenant —</option>
                {persons.map(p => <option key={p.id} value={p.id}>{p.full_name} ({p.email})</option>)}
              </select>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Unit *</label>
            <select value={form.unit_id} onChange={e => {
              const u = units.find(u => u.id === e.target.value);
              set("unit_id", e.target.value);
              if (u && !form.monthly_rent) set("monthly_rent", String(u.monthly_rent));
            }} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black">
              <option value="">— select unit —</option>
              {units.map(u => (
                <option key={u.id} value={u.id}>
                  {u.property_name} — Unit {u.unit_number} ({u.status}) · ${u.monthly_rent}/mo
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Lease type</label>
            <select value={form.lease_type} onChange={e => set("lease_type", e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black">
              <option value="FIXED">Fixed term</option>
              <option value="MONTH_TO_MONTH">Month-to-month</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Start date *</label>
              <input type="date" value={form.start_date} onChange={e => set("start_date", e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">End date *</label>
              <input type="date" value={form.end_date} onChange={e => set("end_date", e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Monthly rent *</label>
              <input type="number" min="0" step="0.01" value={form.monthly_rent} onChange={e => set("monthly_rent", e.target.value)}
                placeholder="2000"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Security deposit</label>
              <input type="number" min="0" step="0.01" value={form.security_deposit} onChange={e => set("security_deposit", e.target.value)}
                placeholder="2000"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Notes</label>
            <textarea value={form.notes} onChange={e => set("notes", e.target.value)} rows={2}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black resize-none" />
          </div>

          <div className="pt-2 flex gap-3">
            <button type="button" onClick={onClose}
              className="flex-1 px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50">
              Cancel
            </button>
            <button type="submit" disabled={saving}
              className="flex-1 px-4 py-2 bg-black text-white rounded-lg text-sm font-medium hover:bg-slate-800 disabled:opacity-50">
              {saving ? "Creating…" : "Create lease"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

interface EditLeaseModalProps {
  lease: LeaseRow;
  onClose: () => void;
  onSave: (lease: LeaseOut) => void;
}

function EditLeaseModal({ lease, onClose, onSave }: EditLeaseModalProps) {
  const [form, setForm] = useState({
    start_date: lease.start_date,
    end_date: lease.end_date,
    monthly_rent: String(lease.monthly_rent),
    security_deposit: String(lease.security_deposit),
    lease_type: (lease.lease_type ?? "FIXED") as LeaseType,
    status: lease.status as LeaseStatus,
    notes: lease.notes ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function set(k: string, v: string) { setForm(f => ({ ...f, [k]: v })); }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const updated = await leasesApi.update(lease.id, {
        start_date: form.start_date,
        end_date: form.end_date,
        monthly_rent: parseFloat(form.monthly_rent),
        security_deposit: parseFloat(form.security_deposit),
        lease_type: form.lease_type,
        status: form.status,
        notes: form.notes || null,
      });
      onSave(updated);
    } catch (err: any) {
      setError(err.message ?? "Failed to update lease");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="text-base font-semibold text-slate-900">Edit lease</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
        </div>
        <form onSubmit={submit} className="px-6 py-5 space-y-4">
          {error && <p className="text-red-600 text-sm bg-red-50 px-3 py-2 rounded-lg">{error}</p>}

          <div className="bg-slate-50 rounded-lg px-4 py-3 text-sm text-slate-600">
            <span className="font-medium text-slate-900">{lease.tenant?.full_name}</span>
            {" · "}{lease.property_name} — Unit {lease.unit_number}
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Lease type</label>
            <select value={form.lease_type} onChange={e => set("lease_type", e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black">
              <option value="FIXED">Fixed term</option>
              <option value="MONTH_TO_MONTH">Month-to-month</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Start date</label>
              <input type="date" value={form.start_date} onChange={e => set("start_date", e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">End date</label>
              <input type="date" value={form.end_date} onChange={e => set("end_date", e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Monthly rent</label>
              <input type="number" min="0" step="0.01" value={form.monthly_rent} onChange={e => set("monthly_rent", e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Security deposit</label>
              <input type="number" min="0" step="0.01" value={form.security_deposit} onChange={e => set("security_deposit", e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Status override</label>
            <select value={form.status} onChange={e => set("status", e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black">
              <option value="ACTIVE">Active</option>
              <option value="PENDING">Pending</option>
              <option value="EXPIRED">Expired</option>
              <option value="TERMINATED">Terminated</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Notes</label>
            <textarea value={form.notes} onChange={e => set("notes", e.target.value)} rows={2}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black resize-none" />
          </div>

          <div className="pt-2 flex gap-3">
            <button type="button" onClick={onClose}
              className="flex-1 px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50">
              Cancel
            </button>
            <button type="submit" disabled={saving}
              className="flex-1 px-4 py-2 bg-black text-white rounded-lg text-sm font-medium hover:bg-slate-800 disabled:opacity-50">
              {saving ? "Saving…" : "Save changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

interface RenewModalProps {
  lease: LeaseRow;
  onClose: () => void;
  onSave: (lease: LeaseOut) => void;
}

function RenewModal({ lease, onClose, onSave }: RenewModalProps) {
  const [form, setForm] = useState({
    start_date: lease.end_date,
    end_date: "",
    monthly_rent: String(lease.monthly_rent),
    lease_type: (lease.lease_type ?? "FIXED") as LeaseType,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function set(k: string, v: string) { setForm(f => ({ ...f, [k]: v })); }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.start_date || !form.end_date) { setError("Both dates are required."); return; }
    setSaving(true);
    try {
      const renewed = await leasesApi.renew(lease.id, {
        start_date: form.start_date,
        end_date: form.end_date,
        monthly_rent: parseFloat(form.monthly_rent),
        lease_type: form.lease_type,
      });
      onSave(renewed);
    } catch (err: any) {
      setError(err.message ?? "Failed to renew lease");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="text-base font-semibold text-slate-900">Renew lease</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
        </div>
        <form onSubmit={submit} className="px-6 py-5 space-y-4">
          {error && <p className="text-red-600 text-sm bg-red-50 px-3 py-2 rounded-lg">{error}</p>}

          <p className="text-sm text-slate-600">
            Renewing for <span className="font-medium text-slate-900">{lease.tenant?.full_name}</span> in Unit {lease.unit_number}.
            The current lease (ending {lease.end_date}) will be terminated and a new one created.
          </p>

          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Lease type</label>
            <select value={form.lease_type} onChange={e => set("lease_type", e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black">
              <option value="FIXED">Fixed term</option>
              <option value="MONTH_TO_MONTH">Month-to-month</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">New start date</label>
              <input type="date" value={form.start_date} onChange={e => set("start_date", e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">New end date</label>
              <input type="date" value={form.end_date} onChange={e => set("end_date", e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Monthly rent</label>
            <input type="number" min="0" step="0.01" value={form.monthly_rent} onChange={e => set("monthly_rent", e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black" />
          </div>

          <div className="pt-2 flex gap-3">
            <button type="button" onClick={onClose}
              className="flex-1 px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50">
              Cancel
            </button>
            <button type="submit" disabled={saving}
              className="flex-1 px-4 py-2 bg-black text-white rounded-lg text-sm font-medium hover:bg-slate-800 disabled:opacity-50">
              {saving ? "Renewing…" : "Renew lease"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

interface TerminateDialogProps {
  lease: LeaseRow;
  onClose: () => void;
  onConfirm: () => void;
  loading: boolean;
}

function TerminateDialog({ lease, onClose, onConfirm, loading }: TerminateDialogProps) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-xl p-6 space-y-4">
        <h3 className="text-base font-semibold text-slate-900">Terminate lease?</h3>
        <p className="text-sm text-slate-600">
          This will terminate the lease for <span className="font-medium">{lease.tenant?.full_name}</span> in Unit {lease.unit_number} ({lease.property_name}).
          The unit will be marked vacant. This cannot be undone.
        </p>
        <div className="flex gap-3 pt-1">
          <button onClick={onClose} className="flex-1 px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50">
            Cancel
          </button>
          <button onClick={onConfirm} disabled={loading}
            className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50">
            {loading ? "Terminating…" : "Terminate"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Document upload ──────────────────────────────────────────────────────────

interface DocUploadProps {
  lease: LeaseRow;
  onUploaded: (lease: LeaseOut) => void;
}

function DocUploadCell({ lease, onUploaded }: DocUploadProps) {
  const ref = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const updated = await leasesApi.uploadDocument(lease.id, file);
      onUploaded(updated);
    } catch { /* silent */ } finally {
      setUploading(false);
    }
  }

  if (lease.document_url) {
    return (
      <div className="flex items-center gap-1.5">
        <a href={lease.document_url} target="_blank" rel="noopener noreferrer"
          className="text-xs text-blue-600 hover:underline flex items-center gap-1">
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
          </svg>
          PDF
        </a>
        <button onClick={() => ref.current?.click()} title="Replace" className="text-slate-400 hover:text-slate-600 text-xs">↻</button>
        <input ref={ref} type="file" accept="application/pdf,image/jpeg,image/png" className="hidden" onChange={handleFile} />
      </div>
    );
  }

  return (
    <>
      <button onClick={() => ref.current?.click()} disabled={uploading}
        className="text-xs text-slate-400 hover:text-black flex items-center gap-1 transition-colors">
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
        </svg>
        {uploading ? "Uploading…" : "Upload"}
      </button>
      <input ref={ref} type="file" accept="application/pdf,image/jpeg,image/png" className="hidden" onChange={handleFile} />
    </>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────────

const ALL_STATUSES: LeaseStatus[] = ["ACTIVE", "PENDING", "EXPIRED", "TERMINATED"];

export default function LeasesPage() {
  const searchParams = useSearchParams();
  const presetTenantId = searchParams.get("tenant") ?? undefined;

  const [leases, setLeases] = useState<LeaseRow[]>([]);
  const [units, setUnits] = useState<UnitOut[]>([]);
  const [persons, setPersons] = useState<TenantOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<LeaseStatus | "ALL">("ALL");

  type Modal =
    | { type: "create" }
    | { type: "edit"; lease: LeaseRow }
    | { type: "renew"; lease: LeaseRow }
    | { type: "terminate"; lease: LeaseRow };

  const [modal, setModal] = useState<Modal | null>(presetTenantId ? { type: "create" } : null);
  const [terminateLoading, setTerminateLoading] = useState(false);

  const load = useCallback(async () => {
    if (MOCK_MODE) { setLoading(false); return; }
    try {
      const [ls, us, ps] = await Promise.all([
        leasesApi.list(),
        tenantsApi.availableUnits(),
        tenantsApi.listPersons(),
      ]);
      setLeases(ls.map(fromApi));
      setUnits(us);
      setPersons(ps);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Filtering
  const filtered = leases.filter(l => {
    if (statusFilter !== "ALL" && l.status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        l.tenant?.full_name.toLowerCase().includes(q) ||
        l.unit_number?.toLowerCase().includes(q) ||
        l.property_name?.toLowerCase().includes(q) ||
        false
      );
    }
    return true;
  });

  const counts: Record<string, number> = { ALL: leases.length };
  ALL_STATUSES.forEach(s => { counts[s] = leases.filter(l => l.status === s).length; });

  function handleSave(lease: LeaseOut) {
    const row = fromApi(lease);
    setLeases(prev => {
      const idx = prev.findIndex(l => l.id === lease.id);
      if (idx >= 0) { const next = [...prev]; next[idx] = row; return next; }
      return [row, ...prev];
    });
    setModal(null);
    load(); // refresh to get accurate status
  }

  async function handleTerminate() {
    if (modal?.type !== "terminate") return;
    setTerminateLoading(true);
    try {
      await leasesApi.terminate(modal.lease.id);
      setLeases(prev => prev.map(l => l.id === modal.lease.id ? { ...l, status: "TERMINATED" } : l));
      setModal(null);
    } finally {
      setTerminateLoading(false);
    }
  }

  return (
    <div className="max-w-[1280px] mx-auto px-6 py-6 space-y-5">
      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <p className="text-[11px] uppercase tracking-widest text-slate-400 font-medium">Lease management</p>
          <h1 className="text-xl font-bold text-slate-900 mt-0.5">Leases</h1>
        </div>
        <button onClick={() => setModal({ type: "create" })}
          className="px-4 py-2 bg-black text-white text-sm font-medium rounded-xl hover:bg-slate-800 transition-colors">
          + New lease
        </button>
      </div>

      {/* Status tabs + search */}
      <div className="flex flex-wrap items-center gap-2">
        {(["ALL", ...ALL_STATUSES] as const).map(s => (
          <button key={s} onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              statusFilter === s ? "bg-black text-white" : "bg-white border border-slate-200 text-slate-600 hover:border-slate-300"
            }`}>
            {s === "ALL" ? "All" : STATUS_LABEL[s]} {counts[s] > 0 && <span className="ml-0.5 opacity-60">({counts[s]})</span>}
          </button>
        ))}
        <div className="ml-auto">
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search tenant, unit, property…"
            className="border border-slate-200 rounded-xl px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-black w-64" />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100">
                {["Tenant", "Unit / Property", "Type", "Period", "Rent", "Deposit", "Status", "Document", ""].map(h => (
                  <th key={h} className="text-left text-[11px] font-medium text-slate-400 uppercase tracking-wider px-4 py-3">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {loading && (
                <tr><td colSpan={9} className="px-4 py-8 text-center text-sm text-slate-400">Loading leases…</td></tr>
              )}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={9} className="px-4 py-12 text-center text-slate-400 text-sm">
                  {search || statusFilter !== "ALL" ? "No leases match your filter." : "No leases yet. Create one to get started."}
                </td></tr>
              )}
              {filtered.map(l => {
                const expiring = l.status === "ACTIVE" && l._daysUntilExpiry <= 90 && l._daysUntilExpiry > 0;
                const expired = l._daysUntilExpiry < 0 && l.status !== "TERMINATED";
                return (
                  <tr key={l.id} className="hover:bg-slate-50 transition-colors group">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <Avatar name={l.tenant?.full_name ?? "?"} url={l.tenant?.avatar_url} size={7} />
                        <div>
                          <p className="text-xs font-semibold text-slate-900">{l.tenant?.full_name ?? "—"}</p>
                          <p className="text-[11px] text-slate-400">{l.tenant?.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-xs font-medium text-slate-900">Unit {l.unit_number}</p>
                      <p className="text-[11px] text-slate-400">{l.property_name}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs text-slate-500">
                        {l.lease_type === "MONTH_TO_MONTH" ? "M-to-M" : "Fixed"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-xs text-slate-700">{l.start_date} →</p>
                      <p className={`text-xs font-medium ${expiring ? "text-amber-600" : expired ? "text-red-500" : "text-slate-700"}`}>
                        {l.end_date}
                        {expiring && <span className="ml-1 text-[10px]">({l._daysUntilExpiry}d)</span>}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-700 font-medium">{fmt$(l.monthly_rent)}</td>
                    <td className="px-4 py-3 text-xs text-slate-500">{fmt$(l.security_deposit)}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${STATUS_STYLES[l.status] ?? "bg-slate-100 text-slate-500"}`}>
                        {STATUS_LABEL[l.status] ?? l.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <DocUploadCell lease={l} onUploaded={updated => handleSave(updated)} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => setModal({ type: "edit", lease: l })}
                          title="Edit" className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-slate-900 transition-colors">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                        {l.status === "ACTIVE" && (
                          <button onClick={() => setModal({ type: "renew", lease: l })}
                            title="Renew" className="p-1.5 rounded-lg hover:bg-emerald-50 text-slate-500 hover:text-emerald-700 transition-colors">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                            </svg>
                          </button>
                        )}
                        {(l.status === "ACTIVE" || l.status === "PENDING") && (
                          <button onClick={() => setModal({ type: "terminate", lease: l })}
                            title="Terminate" className="p-1.5 rounded-lg hover:bg-red-50 text-slate-500 hover:text-red-600 transition-colors">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        )}
                        <button
                          title="Send for signature (coming soon)"
                          className="p-1.5 rounded-lg hover:bg-blue-50 text-slate-300 cursor-not-allowed transition-colors"
                          disabled>
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modals */}
      {modal?.type === "create" && (
        <CreateLeaseModal
          units={units}
          persons={persons}
          presetTenantId={presetTenantId}
          onClose={() => setModal(null)}
          onSave={handleSave}
        />
      )}
      {modal?.type === "edit" && (
        <EditLeaseModal lease={modal.lease} onClose={() => setModal(null)} onSave={handleSave} />
      )}
      {modal?.type === "renew" && (
        <RenewModal lease={modal.lease} onClose={() => setModal(null)} onSave={lease => { handleSave(lease); load(); }} />
      )}
      {modal?.type === "terminate" && (
        <TerminateDialog lease={modal.lease} onClose={() => setModal(null)} onConfirm={handleTerminate} loading={terminateLoading} />
      )}
    </div>
  );
}
