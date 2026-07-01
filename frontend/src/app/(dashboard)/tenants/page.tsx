"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { tenantsApi, leasesApi, type TenantOut, type LeaseOut, type TenantDocumentOut } from "@/lib/api";
import { MOCK_MODE } from "@/lib/useApiData";

// ─── Types ────────────────────────────────────────────────────────────────────

interface PersonRow extends TenantOut {
  leases: LeaseOut[];
  currentLease: LeaseOut | null;
}

// ─── Address data ─────────────────────────────────────────────────────────────

const COUNTRIES = ["Canada", "USA"] as const;
type Country = typeof COUNTRIES[number];

const PROVINCES: Record<Country, string[]> = {
  Canada: ["AB","BC","MB","NB","NL","NS","NT","NU","ON","PE","QC","SK","YT"],
  USA: ["AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY"],
};

// ─── Mock data ────────────────────────────────────────────────────────────────

const MOCK_PERSONS: PersonRow[] = [
  {
    id: "tu1", first_name: "Emma", last_name: "Jones", full_name: "Emma Jones",
    email: "emma.jones@email.com", phone: "(310) 555-0192", date_of_birth: null,
    avatar_url: null, documents: [],
    street_address: null, city: null, province: null, postal_code: null, country: null,
    leases: [{
      id: "l1", unit_id: "u1", tenant_user_id: "tu1", start_date: "2026-02-01",
      end_date: "2027-01-31", monthly_rent: 2400, security_deposit: 2400,
      status: "ACTIVE", lease_type: "FIXED", document_url: null,
      notes: null, tenant: null, unit_number: "101", property_name: "Sunset Towers",
    }],
    currentLease: {
      id: "l1", unit_id: "u1", tenant_user_id: "tu1", start_date: "2026-02-01",
      end_date: "2027-01-31", monthly_rent: 2400, security_deposit: 2400,
      status: "ACTIVE", lease_type: "FIXED", document_url: null,
      notes: null, tenant: null, unit_number: "101", property_name: "Sunset Towers",
    },
  },
  {
    id: "tu2", first_name: "Marcus", last_name: "Lee", full_name: "Marcus Lee",
    email: "marcus.lee@email.com", phone: "(310) 555-0841", date_of_birth: null,
    avatar_url: null, documents: [],
    street_address: null, city: null, province: null, postal_code: null, country: null,
    leases: [{
      id: "l2", unit_id: "u3", tenant_user_id: "tu2", start_date: "2025-09-01",
      end_date: "2026-08-31", monthly_rent: 2750, security_deposit: 2750,
      status: "EXPIRED", lease_type: "FIXED", document_url: null,
      notes: null, tenant: null, unit_number: "103", property_name: "Sunset Towers",
    }],
    currentLease: null,
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<string, string> = {
  ACTIVE: "bg-emerald-100 text-emerald-700",
  PENDING: "bg-blue-100 text-blue-700",
  EXPIRED: "bg-slate-100 text-slate-500",
  TERMINATED: "bg-red-100 text-red-600",
};

const STATUS_LABEL: Record<string, string> = {
  ACTIVE: "Active", PENDING: "Pending", EXPIRED: "Expired", TERMINATED: "Terminated",
};

function Avatar({ name, url, size = 8 }: { name: string; url?: string | null; size?: number }) {
  const initials = name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
  if (url) return <img src={url} alt={name} className={`w-${size} h-${size} rounded-full object-cover shrink-0`} />;
  return (
    <div className={`w-${size} h-${size} rounded-full bg-slate-200 flex items-center justify-center text-xs font-bold text-slate-600 shrink-0`}>
      {initials}
    </div>
  );
}

function fmt$(n: number) { return `$${n.toLocaleString()}`; }

function daysUntil(dateStr: string) {
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000);
}

// ─── Add Tenant Modal (person-only) ──────────────────────────────────────────

interface AddPersonModalProps {
  onClose: () => void;
  onSave: (person: TenantOut) => void;
}

function AddPersonModal({ onClose, onSave }: AddPersonModalProps) {
  const [form, setForm] = useState({
    first_name: "", last_name: "", email: "", phone: "", date_of_birth: "",
    street_address: "", city: "", province: "", postal_code: "", country: "" as Country | "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function set(k: string, v: string) {
    setForm(f => {
      const next = { ...f, [k]: v };
      if (k === "country") next.province = "";
      return next;
    });
  }

  const provinceList = form.country ? PROVINCES[form.country as Country] ?? [] : [];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.first_name || !form.last_name || !form.email) {
      setError("First name, last name, and email are required.");
      return;
    }
    setSaving(true);
    try {
      const person = await tenantsApi.createPerson({
        first_name: form.first_name,
        last_name: form.last_name,
        email: form.email,
        phone: form.phone,
        date_of_birth: form.date_of_birth || null,
        street_address: form.street_address || null,
        city: form.city || null,
        province: form.province || null,
        postal_code: form.postal_code || null,
        country: form.country || null,
      });
      onSave(person);
    } catch (err: any) {
      setError(err.message ?? "Failed to create tenant");
    } finally {
      setSaving(false);
    }
  }

  const input = "w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black";

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="text-base font-semibold text-slate-900">Add tenant</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
        </div>
        <form onSubmit={submit} className="px-6 py-5 space-y-4">
          {error && <p className="text-red-600 text-sm bg-red-50 px-3 py-2 rounded-lg">{error}</p>}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">First name *</label>
              <input value={form.first_name} onChange={e => set("first_name", e.target.value)} className={input} />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Last name *</label>
              <input value={form.last_name} onChange={e => set("last_name", e.target.value)} className={input} />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Email *</label>
            <input type="email" value={form.email} onChange={e => set("email", e.target.value)} className={input} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Phone</label>
              <input value={form.phone} onChange={e => set("phone", e.target.value)} placeholder="(555) 000-0000" className={input} />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Date of birth</label>
              <input type="date" value={form.date_of_birth} onChange={e => set("date_of_birth", e.target.value)} className={input} />
            </div>
          </div>

          {/* Address section */}
          <div className="pt-1 border-t border-slate-100">
            <p className="text-[11px] uppercase tracking-wider font-medium text-slate-400 mb-3">Address (optional)</p>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Street address</label>
                <input value={form.street_address} onChange={e => set("street_address", e.target.value)}
                  placeholder="123 Main St" className={input} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">City</label>
                  <input value={form.city} onChange={e => set("city", e.target.value)} className={input} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Postal / ZIP code</label>
                  <input value={form.postal_code} onChange={e => set("postal_code", e.target.value)} className={input} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Country</label>
                  <select value={form.country} onChange={e => set("country", e.target.value)} className={input}>
                    <option value="">— select —</option>
                    {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Province / State</label>
                  <select value={form.province} onChange={e => set("province", e.target.value)}
                    disabled={!form.country} className={`${input} disabled:opacity-50`}>
                    <option value="">— select —</option>
                    {provinceList.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
              </div>
            </div>
          </div>

          <p className="text-xs text-slate-400">After saving, you can create a lease from the tenant row.</p>

          <div className="pt-2 flex gap-3">
            <button type="button" onClick={onClose}
              className="flex-1 px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50">
              Cancel
            </button>
            <button type="submit" disabled={saving}
              className="flex-1 px-4 py-2 bg-black text-white rounded-lg text-sm font-medium hover:bg-slate-800 disabled:opacity-50">
              {saving ? "Adding…" : "Add tenant"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Edit Tenant Modal ────────────────────────────────────────────────────────

interface EditPersonModalProps {
  person: TenantOut;
  onClose: () => void;
  onSave: (person: TenantOut) => void;
}

function EditPersonModal({ person, onClose, onSave }: EditPersonModalProps) {
  const [form, setForm] = useState({
    first_name: person.first_name ?? "",
    last_name: person.last_name ?? "",
    phone: person.phone ?? "",
    date_of_birth: person.date_of_birth ?? "",
    street_address: person.street_address ?? "",
    city: person.city ?? "",
    province: person.province ?? "",
    postal_code: person.postal_code ?? "",
    country: (person.country ?? "") as Country | "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function set(k: string, v: string) {
    setForm(f => {
      const next = { ...f, [k]: v };
      if (k === "country") next.province = "";
      return next;
    });
  }

  const provinceList = form.country ? PROVINCES[form.country as Country] ?? [] : [];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const updated = await tenantsApi.updatePerson(person.id, {
        first_name: form.first_name,
        last_name: form.last_name,
        phone: form.phone || null,
        date_of_birth: form.date_of_birth || null,
        street_address: form.street_address || null,
        city: form.city || null,
        province: form.province || null,
        postal_code: form.postal_code || null,
        country: form.country || null,
      });
      onSave(updated);
    } catch (err: any) {
      setError(err.message ?? "Failed to update");
    } finally {
      setSaving(false);
    }
  }

  const input = "w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black";

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="text-base font-semibold text-slate-900">Edit tenant</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
        </div>
        <form onSubmit={submit} className="px-6 py-5 space-y-4">
          {error && <p className="text-red-600 text-sm bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">First name</label>
              <input value={form.first_name} onChange={e => set("first_name", e.target.value)} className={input} />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Last name</label>
              <input value={form.last_name} onChange={e => set("last_name", e.target.value)} className={input} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Phone</label>
              <input value={form.phone} onChange={e => set("phone", e.target.value)} className={input} />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Date of birth</label>
              <input type="date" value={form.date_of_birth} onChange={e => set("date_of_birth", e.target.value)} className={input} />
            </div>
          </div>

          {/* Address section */}
          <div className="pt-1 border-t border-slate-100">
            <p className="text-[11px] uppercase tracking-wider font-medium text-slate-400 mb-3">Address</p>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Street address</label>
                <input value={form.street_address} onChange={e => set("street_address", e.target.value)}
                  placeholder="123 Main St" className={input} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">City</label>
                  <input value={form.city} onChange={e => set("city", e.target.value)} className={input} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Postal / ZIP code</label>
                  <input value={form.postal_code} onChange={e => set("postal_code", e.target.value)} className={input} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Country</label>
                  <select value={form.country} onChange={e => set("country", e.target.value)} className={input}>
                    <option value="">— select —</option>
                    {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Province / State</label>
                  <select value={form.province} onChange={e => set("province", e.target.value)}
                    disabled={!form.country} className={`${input} disabled:opacity-50`}>
                    <option value="">— select —</option>
                    {provinceList.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
              </div>
            </div>
          </div>

          <div className="pt-2 flex gap-3">
            <button type="button" onClick={onClose}
              className="flex-1 px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50">
              Cancel
            </button>
            <button type="submit" disabled={saving}
              className="flex-1 px-4 py-2 bg-black text-white rounded-lg text-sm font-medium hover:bg-slate-800 disabled:opacity-50">
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Edit Lease Modal (inline in tenants page) ───────────────────────────────

interface EditLeaseModalProps {
  lease: LeaseOut;
  onClose: () => void;
  onSave: (lease: LeaseOut) => void;
}

function EditLeaseModal({ lease, onClose, onSave }: EditLeaseModalProps) {
  const [form, setForm] = useState({
    start_date: lease.start_date,
    end_date: lease.end_date,
    monthly_rent: String(lease.monthly_rent),
    security_deposit: String(lease.security_deposit),
    lease_type: lease.lease_type ?? "FIXED",
    status: lease.status,
    notes: lease.notes ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const ref = React.useRef<HTMLInputElement>(null);

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

  async function handleDocUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setSaving(true);
    try {
      const updated = await leasesApi.uploadDocument(lease.id, file);
      onSave(updated);
    } catch (err: any) {
      setError(err.message ?? "Upload failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="text-base font-semibold text-slate-900">Edit lease agreement</h2>
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

          {/* Document upload */}
          <div className="border border-dashed border-slate-200 rounded-lg px-4 py-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-slate-600">Lease document</p>
                {lease.document_url
                  ? <a href={lease.document_url} target="_blank" rel="noopener noreferrer"
                      className="text-xs text-blue-600 hover:underline">Current: view PDF ↗</a>
                  : <p className="text-xs text-slate-400">No document uploaded</p>
                }
              </div>
              <button type="button" onClick={() => ref.current?.click()}
                className="text-xs px-3 py-1.5 border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-600">
                {lease.document_url ? "Replace" : "Upload PDF"}
              </button>
            </div>
            <input ref={ref} type="file" accept="application/pdf,image/jpeg,image/png" className="hidden" onChange={handleDocUpload} />
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

// ─── Create Lease Modal (inline in tenants page) ──────────────────────────────

interface CreateLeaseForTenantProps {
  person: TenantOut;
  onClose: () => void;
  onSave: (lease: LeaseOut) => void;
}

function CreateLeaseForTenantModal({ person, onClose, onSave }: CreateLeaseForTenantProps) {
  const [units, setUnits] = useState<import("@/lib/api").UnitOut[]>([]);
  const [form, setForm] = useState({
    unit_id: "",
    start_date: "",
    end_date: "",
    monthly_rent: "",
    security_deposit: "",
    lease_type: "FIXED",
    notes: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    tenantsApi.availableUnits().then(setUnits).catch(() => {});
  }, []);

  function set(k: string, v: string) { setForm(f => ({ ...f, [k]: v })); }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.unit_id || !form.start_date || !form.end_date || !form.monthly_rent) {
      setError("Unit, dates, and rent are required.");
      return;
    }
    setSaving(true);
    try {
      const lease = await leasesApi.create({
        tenant_user_id: person.id,
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
          <h2 className="text-base font-semibold text-slate-900">Create lease agreement</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
        </div>
        <form onSubmit={submit} className="px-6 py-5 space-y-4">
          {error && <p className="text-red-600 text-sm bg-red-50 px-3 py-2 rounded-lg">{error}</p>}

          <div className="bg-slate-50 rounded-lg px-4 py-3 flex items-center gap-3">
            <Avatar name={person.full_name} url={person.avatar_url} size={8} />
            <div>
              <p className="text-sm font-medium text-slate-900">{person.full_name}</p>
              <p className="text-xs text-slate-400">{person.email}</p>
            </div>
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

// ─── Expanded row — lease history ─────────────────────────────────────────────

function LeaseHistoryRow({
  person,
  onEditLease,
  onCreateLease,
}: {
  person: PersonRow;
  onEditLease: (lease: LeaseOut) => void;
  onCreateLease: (person: PersonRow) => void;
}) {
  if (person.leases.length === 0) {
    return (
      <tr>
        <td colSpan={7} className="px-6 py-3 bg-slate-50 border-b border-slate-100">
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-400">No leases yet.</p>
            <button onClick={() => onCreateLease(person)}
              className="text-xs text-black font-medium hover:underline">+ Create lease agreement →</button>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr>
      <td colSpan={7} className="px-6 py-0 bg-slate-50 border-b border-slate-100">
        <div className="py-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[11px] uppercase tracking-wider font-medium text-slate-400">Lease history ({person.leases.length})</p>
            <button onClick={() => onCreateLease(person)}
              className="text-xs text-black font-medium hover:underline">+ Create lease agreement →</button>
          </div>
          <div className="space-y-1.5">
            {person.leases.map(l => {
              const days = daysUntil(l.end_date);
              const expiring = l.status === "ACTIVE" && days <= 90 && days > 0;
              return (
                <div key={l.id} className="flex items-center gap-3 bg-white border border-slate-100 rounded-lg px-3 py-2 text-xs group/lease hover:border-slate-200 transition-colors">
                  <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium shrink-0 ${STATUS_STYLES[l.status] ?? ""}`}>
                    {STATUS_LABEL[l.status] ?? l.status}
                  </span>
                  <span className="font-medium text-slate-700">{l.property_name} — Unit {l.unit_number}</span>
                  <span className="text-slate-400">{l.start_date} → <span className={expiring ? "text-amber-600 font-medium" : ""}>{l.end_date}</span></span>
                  <span className="text-slate-500">{fmt$(l.monthly_rent)}/mo</span>
                  <span className="text-slate-400 text-[10px] capitalize">{l.lease_type === "MONTH_TO_MONTH" ? "M-to-M" : "Fixed"}</span>
                  <div className="ml-auto flex items-center gap-2">
                    {l.document_url && (
                      <a href={l.document_url} target="_blank" rel="noopener noreferrer"
                        className="text-blue-600 hover:underline text-[10px]">PDF</a>
                    )}
                    <button
                      onClick={() => onEditLease(l)}
                      className="opacity-0 group-hover/lease:opacity-100 transition-opacity text-[10px] px-2 py-1 border border-slate-200 rounded-md hover:bg-slate-50 text-slate-600 font-medium">
                      Edit
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </td>
    </tr>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function TenantsPage() {
  const router = useRouter();
  const [persons, setPersons] = useState<PersonRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  type Modal =
    | { type: "addPerson" }
    | { type: "editPerson"; person: TenantOut }
    | { type: "editLease"; lease: LeaseOut }
    | { type: "createLease"; person: PersonRow };

  const [modal, setModal] = useState<Modal | null>(null);

  const load = useCallback(async () => {
    if (MOCK_MODE) { setPersons(MOCK_PERSONS); setLoading(false); return; }
    try {
      const [ps, ls] = await Promise.all([
        tenantsApi.listPersons(),
        leasesApi.list(),
      ]);
      // Group leases by tenant
      const leasesByTenant: Record<string, LeaseOut[]> = {};
      ls.forEach(l => {
        if (!leasesByTenant[l.tenant_user_id]) leasesByTenant[l.tenant_user_id] = [];
        leasesByTenant[l.tenant_user_id].push(l);
      });

      const rows: PersonRow[] = ps.map(p => {
        const pLeases = (leasesByTenant[p.id] ?? []).sort(
          (a, b) => b.start_date.localeCompare(a.start_date)
        );
        const current = pLeases.find(l => l.status === "ACTIVE" || l.status === "PENDING") ?? null;
        return { ...p, leases: pLeases, currentLease: current };
      });
      setPersons(rows);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = persons.filter(p => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      p.full_name.toLowerCase().includes(q) ||
      p.email.toLowerCase().includes(q) ||
      p.currentLease?.unit_number?.toLowerCase().includes(q) ||
      p.currentLease?.property_name?.toLowerCase().includes(q) ||
      false
    );
  });

  function toggleExpand(id: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function handlePersonSaved(person: TenantOut) {
    setPersons(prev => {
      const idx = prev.findIndex(p => p.id === person.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], ...person };
        return next;
      }
      return [{ ...person, leases: [], currentLease: null }, ...prev];
    });
    setModal(null);
  }

  function handleLeaseSaved(lease: LeaseOut) {
    setPersons(prev => prev.map(p => {
      if (p.id !== lease.tenant_user_id) return p;
      const leases = p.leases.some(l => l.id === lease.id)
        ? p.leases.map(l => l.id === lease.id ? lease : l)
        : [lease, ...p.leases];
      const current = leases.find(l => l.status === "ACTIVE" || l.status === "PENDING") ?? null;
      return { ...p, leases, currentLease: current };
    }));
    setModal(null);
  }

  // Summaries
  const activeCount = persons.filter(p => p.currentLease?.status === "ACTIVE").length;
  const noLeaseCount = persons.filter(p => !p.currentLease).length;
  const expiring = persons.filter(p => {
    if (!p.currentLease || p.currentLease.status !== "ACTIVE") return false;
    return daysUntil(p.currentLease.end_date) <= 90;
  }).length;

  return (
    <div className="max-w-[1280px] mx-auto px-6 py-6 space-y-5">
      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <p className="text-[11px] uppercase tracking-widest text-slate-400 font-medium">People</p>
          <h1 className="text-xl font-bold text-slate-900 mt-0.5">Tenants</h1>
        </div>
        <button onClick={() => setModal({ type: "addPerson" })}
          className="px-4 py-2 bg-black text-white text-sm font-medium rounded-xl hover:bg-slate-800 transition-colors">
          + Add tenant
        </button>
      </div>

      {/* Summary pills */}
      {!loading && (
        <div className="flex flex-wrap gap-2">
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 rounded-full text-xs text-slate-600">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            {activeCount} active
          </span>
          {noLeaseCount > 0 && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 rounded-full text-xs text-slate-600">
              <span className="w-2 h-2 rounded-full bg-slate-300" />
              {noLeaseCount} without lease
            </span>
          )}
          {expiring > 0 && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 border border-amber-200 rounded-full text-xs text-amber-700">
              <span className="w-2 h-2 rounded-full bg-amber-400" />
              {expiring} expiring in 90 days
            </span>
          )}
          <div className="ml-auto">
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search name, email, unit…"
              className="border border-slate-200 rounded-xl px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-black w-56" />
          </div>
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100">
              <th className="w-8 px-4 py-3" />
              {["Tenant", "Contact", "Current lease", "Rent", "Lease history", ""].map(h => (
                <th key={h} className="text-left text-[11px] font-medium text-slate-400 uppercase tracking-wider px-4 py-3">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-sm text-slate-400">Loading tenants…</td></tr>
            )}
            {!loading && filtered.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-12 text-center text-slate-400 text-sm">
                {search ? "No tenants match your search." : "No tenants yet. Click '+ Add tenant' to get started."}
              </td></tr>
            )}
            {filtered.map(p => {
              const isExpanded = expanded.has(p.id);
              const cl = p.currentLease;
              const days = cl ? daysUntil(cl.end_date) : null;

              return (
                <React.Fragment key={p.id}>
                  <tr className="border-b border-slate-50 hover:bg-slate-50 transition-colors group">
                    {/* Expand toggle */}
                    <td className="px-4 py-3">
                      <button onClick={() => toggleExpand(p.id)}
                        className="w-5 h-5 rounded flex items-center justify-center text-slate-400 hover:text-slate-900 hover:bg-slate-100 transition-colors">
                        <svg className={`w-3.5 h-3.5 transition-transform ${isExpanded ? "rotate-90" : ""}`}
                          fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </button>
                    </td>

                    {/* Tenant */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <Avatar name={p.full_name} url={p.avatar_url} size={8} />
                        <div>
                          <p className="text-xs font-semibold text-slate-900">{p.full_name}</p>
                          <p className="text-[11px] text-slate-400">{p.date_of_birth ? `DOB ${p.date_of_birth}` : "—"}</p>
                        </div>
                      </div>
                    </td>

                    {/* Contact */}
                    <td className="px-4 py-3">
                      <p className="text-xs text-slate-700">{p.email}</p>
                      <p className="text-[11px] text-slate-400">{p.phone || "—"}</p>
                      {(p.city || p.province || p.country) && (
                        <p className="text-[11px] text-slate-400 mt-0.5 truncate max-w-[180px]">
                          {[p.street_address, p.city, p.province, p.postal_code, p.country].filter(Boolean).join(", ")}
                        </p>
                      )}
                    </td>

                    {/* Current lease */}
                    <td className="px-4 py-3">
                      {cl ? (
                        <div>
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium ${STATUS_STYLES[cl.status] ?? ""}`}>
                              {STATUS_LABEL[cl.status] ?? cl.status}
                            </span>
                          </div>
                          <p className="text-xs font-medium text-slate-900">{cl.property_name} — Unit {cl.unit_number}</p>
                          <p className={`text-[11px] ${days !== null && days <= 30 ? "text-red-500 font-medium" : days !== null && days <= 90 ? "text-amber-600" : "text-slate-400"}`}>
                            {cl.end_date}{days !== null && days > 0 ? ` (${days}d left)` : days !== null && days <= 0 ? " (expired)" : ""}
                          </p>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400 italic">No active lease</span>
                      )}
                    </td>

                    {/* Rent */}
                    <td className="px-4 py-3">
                      {cl ? <span className="text-xs font-medium text-slate-700">{fmt$(cl.monthly_rent)}/mo</span>
                        : <span className="text-slate-300">—</span>}
                    </td>

                    {/* Lease count */}
                    <td className="px-4 py-3">
                      <span className="text-xs text-slate-500">{p.leases.length} total</span>
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => setModal({ type: "editPerson", person: p })}
                          title="Edit person" className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-slate-900 transition-colors">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                        <button onClick={() => setModal({ type: "createLease", person: p })}
                          title="Create lease" className="p-1.5 rounded-lg hover:bg-emerald-50 text-slate-500 hover:text-emerald-700 transition-colors">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                        </button>
                        <button onClick={() => router.push(`/payments?tenant=${p.id}`)}
                          title="View payments" className="p-1.5 rounded-lg hover:bg-blue-50 text-slate-500 hover:text-blue-600 transition-colors">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>

                  {isExpanded && (
                    <LeaseHistoryRow
                      person={p}
                      onEditLease={lease => setModal({ type: "editLease", lease })}
                      onCreateLease={person => setModal({ type: "createLease", person })}
                    />
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Modals */}
      {modal?.type === "addPerson" && (
        <AddPersonModal onClose={() => setModal(null)} onSave={handlePersonSaved} />
      )}
      {modal?.type === "editPerson" && (
        <EditPersonModal person={modal.person} onClose={() => setModal(null)} onSave={handlePersonSaved} />
      )}
      {modal?.type === "editLease" && (
        <EditLeaseModal lease={modal.lease} onClose={() => setModal(null)} onSave={handleLeaseSaved} />
      )}
      {modal?.type === "createLease" && (
        <CreateLeaseForTenantModal
          person={modal.person}
          onClose={() => setModal(null)}
          onSave={handleLeaseSaved}
        />
      )}
    </div>
  );
}
