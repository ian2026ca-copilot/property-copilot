"use client";

import React, { useState, useEffect, useRef, useCallback, forwardRef, useImperativeHandle } from "react";
import { useRouter } from "next/navigation";
import { propertiesApi, tenantsApi, imagesApi, campaignsApi, type PropertyOut, type UnitOut, type ImageOut, type TenantOut, type UnitTenantInfo } from "@/lib/api";
import { MOCK_MODE } from "@/lib/useApiData";
import { TagPicker, toggleTag, HOME_FEATURE_OPTIONS, NEIGHBORHOOD_FEATURE_OPTIONS } from "@/components/CampaignModal";

// ─── Mock data ────────────────────────────────────────────────────────────────

const MOCK_PROPERTIES: PropertyOut[] = [
  { id: "1", name: "Sunset Towers", address: "1420 Sunset Blvd", city: "Los Angeles", state: "CA", zip_code: "90028", property_type: "RESIDENTIAL", year_built: 1985, unit_count: 12, occupied_count: 11, cover_url: null },
  { id: "2", name: "Cedar Row", address: "88 Cedar St", city: "Austin", state: "TX", zip_code: "78701", property_type: "MIXED_USE", year_built: 2001, unit_count: 8, occupied_count: 8, cover_url: null },
  { id: "3", name: "Northside Commons", address: "310 N Oak Ave", city: "Chicago", state: "IL", zip_code: "60614", property_type: "RESIDENTIAL", year_built: 1972, unit_count: 6, occupied_count: 5, cover_url: null },
];

interface UnitRow {
  id: string;
  property_id: string;
  number: string;
  property: string;
  layout: string;
  sqft: number;
  rent: number;
  status: string;
  tenant: string | null;
  tenantUserId: string | null;
  tenantAvatarUrl: string | null;
  leaseId: string | null;
  leaseStart: string | null;
  leaseEnd: string | null;
  outstandingBalance: number;
  tenants: UnitTenantInfo[];
  contactMethods?: string[];
  contactPhones?: { number: string; extension?: string | null }[];
  contactEmails?: string[];
  securityDeposit?: string | null;
  utilitiesIncluded?: string[];
  furnishing?: string | null;
  leaseTerm?: string | null;
  smokingPolicy?: string | null;
  dogsPolicy?: string | null;
  catsPolicy?: string | null;
  petFee?: number | null;
  parkingAvailable?: boolean | null;
  propertyHeading?: string | null;
  hiddenNotes?: string | null;
  description?: string | null;
  homeFeatures?: string[];
  neighborhoodFeatures?: string[];
}

const MOCK_UNITS: UnitRow[] = [
  { id: "u1", property_id: "1", number: "101", property: "Sunset Towers", layout: "2 bed / 1 bath", sqft: 850, rent: 2400, status: "Occupied", tenant: "Emma Jones", tenantUserId: null, tenantAvatarUrl: null, leaseId: "l1", leaseStart: "2026-02-01", leaseEnd: "2027-01-31", outstandingBalance: 0, tenants: [] },
  { id: "u2", property_id: "1", number: "102", property: "Sunset Towers", layout: "1 bed / 1 bath", sqft: 620, rent: 1950, status: "Maintenance", tenant: null, tenantUserId: null, tenantAvatarUrl: null, leaseId: null, leaseStart: null, leaseEnd: null, outstandingBalance: 0, tenants: [] },
  { id: "u3", property_id: "1", number: "103", property: "Sunset Towers", layout: "2 bed / 2 bath", sqft: 1020, rent: 2750, status: "Occupied", tenant: "Marcus Lee", tenantUserId: null, tenantAvatarUrl: null, leaseId: "l2", leaseStart: "2025-09-01", leaseEnd: "2026-08-31", outstandingBalance: 2750, tenants: [] },
  { id: "u4", property_id: "1", number: "201", property: "Sunset Towers", layout: "Studio", sqft: 420, rent: 1600, status: "Vacant", tenant: null, tenantUserId: null, tenantAvatarUrl: null, leaseId: null, leaseStart: null, leaseEnd: null, outstandingBalance: 0, tenants: [] },
  { id: "u5", property_id: "2", number: "A1", property: "Cedar Row", layout: "3 bed / 2 bath", sqft: 1280, rent: 3100, status: "Occupied", tenant: "Sarah Kim", tenantUserId: null, tenantAvatarUrl: null, leaseId: "l3", leaseStart: "2025-06-01", leaseEnd: "2026-05-31", outstandingBalance: 6200, tenants: [] },
  { id: "u6", property_id: "2", number: "A2", property: "Cedar Row", layout: "2 bed / 1 bath", sqft: 900, rent: 2200, status: "Occupied", tenant: "David Chen", tenantUserId: null, tenantAvatarUrl: null, leaseId: "l4", leaseStart: "2025-11-01", leaseEnd: "2026-08-15", outstandingBalance: 0, tenants: [] },
  { id: "u7", property_id: "3", number: "B1", property: "Northside Commons", layout: "1 bed / 1 bath", sqft: 580, rent: 1800, status: "Vacant", tenant: null, tenantUserId: null, tenantAvatarUrl: null, leaseId: null, leaseStart: null, leaseEnd: null, outstandingBalance: 0, tenants: [] },
  { id: "u8", property_id: "3", number: "B2", property: "Northside Commons", layout: "2 bed / 2 bath", sqft: 960, rent: 2500, status: "Occupied", tenant: "Priya Nair", tenantUserId: null, tenantAvatarUrl: null, leaseId: "l5", leaseStart: "2026-01-01", leaseEnd: "2026-12-31", outstandingBalance: 0, tenants: [] },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<string, string> = {
  Occupied:    "bg-emerald-100 text-emerald-700",
  Vacant:      "bg-amber-100 text-amber-700",
  Maintenance: "bg-red-100 text-red-700",
  Reserved:    "bg-blue-100 text-blue-700",
  Notice:      "bg-orange-100 text-orange-700",
  Renovation:  "bg-purple-100 text-purple-700",
};

const TYPE_LABELS: Record<string, string> = {
  RESIDENTIAL: "Residential",
  COMMERCIAL: "Commercial",
  MIXED_USE: "Mixed-use",
  INDUSTRIAL: "Industrial",
  HOUSE: "House",
  TOWNHOUSE: "Townhouse",
  CONDO_UNIT: "Condo Unit",
  DUPLEX: "Duplex",
  TRIPLEX: "Triplex",
  FOURPLEX: "Fourplex",
  BASEMENT: "Basement",
};

function unitStatusLabel(s: string) {
  return {
    OCCUPIED: "Occupied",
    VACANT: "Vacant",
    MAINTENANCE: "Maintenance",
    RESERVED: "Reserved",
    NOTICE: "Notice",
    RENOVATION: "Renovation",
  }[s] ?? s;
}

function fromApiUnit(u: UnitOut, propertyName: string): UnitRow {
  return {
    id: u.id, property_id: u.property_id, number: u.unit_number, property: propertyName,
    layout: `${u.bedrooms} bed / ${u.bathrooms} bath`,
    sqft: u.square_feet ?? 0, rent: u.monthly_rent,
    status: unitStatusLabel(u.status),
    tenant: u.tenant_name ?? null,
    tenantUserId: u.tenant_user_id ?? null,
    tenantAvatarUrl: u.tenant_avatar_url ?? null,
    leaseId: u.lease_id ?? null,
    leaseStart: u.lease_start ?? null,
    leaseEnd: u.lease_end ?? null,
    outstandingBalance: u.outstanding_balance ?? 0,
    tenants: u.tenants ?? [],
    contactMethods: u.contact_methods ?? [],
    contactPhones: u.contact_phones ?? [],
    contactEmails: u.contact_emails ?? [],
    securityDeposit: u.security_deposit ?? null,
    utilitiesIncluded: u.utilities_included ?? [],
    furnishing: u.furnishing ?? null,
    leaseTerm: u.lease_term ?? null,
    smokingPolicy: u.smoking_policy ?? null,
    dogsPolicy: u.dogs_policy ?? null,
    catsPolicy: u.cats_policy ?? null,
    petFee: u.pet_fee ?? null,
    parkingAvailable: u.parking_available ?? null,
    propertyHeading: u.property_heading ?? null,
    hiddenNotes: u.hidden_notes ?? null,
    description: u.description ?? null,
    homeFeatures: u.home_features ?? [],
    neighborhoodFeatures: u.neighborhood_features ?? [],
  };
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function OccupancyBar({ occupied, total }: { occupied: number; total: number }) {
  const pct = total > 0 ? Math.round((occupied / total) * 100) : 0;
  return (
    <div className="mt-2">
      <div className="flex justify-between text-[11px] text-slate-500 mb-1">
        <span>{occupied}/{total} units</span>
        <span>{pct}%</span>
      </div>
      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div className="h-full bg-black rounded-full" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// ─── Image gallery modal ──────────────────────────────────────────────────────

function ImageGalleryModal({ title, images, onUpload, onDelete, onClose, uploading, onSetCover, coverId }: {
  title: string;
  images: ImageOut[];
  onUpload: (file: File) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
  uploading: boolean;
  onSetCover?: (id: string) => void;
  coverId?: string | null;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  function handleFiles(files: FileList | null) {
    if (!files) return;
    for (const f of Array.from(files)) onUpload(f);
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      {lightbox && (
        <div className="absolute inset-0 bg-black/90 z-10 flex items-center justify-center" onClick={() => setLightbox(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lightbox} alt="Preview" className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg" />
          <button onClick={() => setLightbox(null)} className="absolute top-4 right-4 text-white/80 hover:text-white text-2xl leading-none">✕</button>
        </div>
      )}
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
            <p className="text-xs text-slate-400 mt-0.5">{images.length} photo{images.length !== 1 ? "s" : ""} · JPEG, PNG, WebP up to 10 MB</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-lg leading-none">✕</button>
        </div>

        <div className="overflow-y-auto flex-1 p-5 space-y-4">
          {/* Drop zone */}
          <div
            className={`border-2 border-dashed rounded-xl p-6 text-center transition-colors cursor-pointer ${dragOver ? "border-black bg-slate-50" : "border-slate-200 hover:border-slate-400"}`}
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
          >
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple className="hidden" onChange={(e) => handleFiles(e.target.files)} />
            {uploading ? (
              <div className="flex items-center justify-center gap-2 text-slate-500 text-sm">
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/></svg>
                Uploading…
              </div>
            ) : (
              <>
                <svg className="w-8 h-8 text-slate-300 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <p className="text-sm text-slate-500">Drag photos here or <span className="text-black font-medium">browse</span></p>
                <p className="text-xs text-slate-400 mt-1">Multiple files supported</p>
              </>
            )}
          </div>

          {/* Grid */}
          {images.length > 0 && (
            <div className="grid grid-cols-3 gap-3">
              {images.map((img) => (
                <div key={img.id} className="relative group aspect-square rounded-lg overflow-hidden bg-slate-100">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={img.url}
                    alt={img.original_name}
                    className="w-full h-full object-cover cursor-zoom-in"
                    onClick={() => setLightbox(img.url)}
                  />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors" />
                  {/* Cover badge */}
                  {coverId === img.id && (
                    <div className="absolute top-1.5 left-1.5 bg-amber-400 text-black text-[9px] font-bold px-1.5 py-0.5 rounded-full">Cover</div>
                  )}
                  <div className="absolute top-1.5 right-1.5 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {onSetCover && coverId !== img.id && (
                      <button
                        onClick={() => onSetCover(img.id)}
                        className="w-6 h-6 rounded-full bg-amber-400 text-black flex items-center justify-center shadow-lg"
                        title="Set as cover"
                      >
                        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                        </svg>
                      </button>
                    )}
                    <button
                      onClick={() => onDelete(img.id)}
                      className="w-6 h-6 rounded-full bg-red-600 text-white flex items-center justify-center shadow-lg"
                      title="Delete photo"
                    >
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                  <p className="absolute bottom-0 inset-x-0 bg-black/50 text-white text-[10px] px-2 py-1 truncate opacity-0 group-hover:opacity-100 transition-opacity">{img.original_name}</p>
                </div>
              ))}
            </div>
          )}

          {images.length === 0 && !uploading && (
            <p className="text-center text-sm text-slate-400 py-4">No photos yet — add some above</p>
          )}
        </div>

        <div className="px-6 py-4 border-t border-slate-100 shrink-0">
          <button onClick={onClose} className="w-full py-2 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors">Done</button>
        </div>
      </div>
    </div>
  );
}

// ─── Property modal (add / edit) ──────────────────────────────────────────────

interface PropertyForm {
  name: string; address: string; city: string; state: string;
  zip_code: string; property_type: string; year_built: string;
}

const BLANK_PROP: PropertyForm = { name: "", address: "", city: "", state: "", zip_code: "", property_type: "HOUSE", year_built: "" };

function propertyToForm(p: PropertyOut): PropertyForm {
  return { name: p.name, address: p.address, city: p.city, state: p.state, zip_code: p.zip_code, property_type: p.property_type, year_built: p.year_built?.toString() ?? "" };
}

function PropertyModal({ initial, onClose, onSave }: {
  initial: PropertyOut | null;
  onClose: () => void;
  onSave: (p: PropertyOut) => void;
}) {
  const [form, setForm] = useState<PropertyForm>(initial ? propertyToForm(initial) : BLANK_PROP);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const set = (f: keyof PropertyForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((v) => ({ ...v, [f]: e.target.value }));

  async function handleSubmit() {
    if (!form.name || !form.address || !form.city || !form.state || !form.zip_code) {
      setError("Please fill in all required fields.");
      return;
    }
    setSaving(true);
    setError("");
    const payload = { ...form, year_built: form.year_built ? parseInt(form.year_built) : null };
    try {
      let saved: PropertyOut;
      if (MOCK_MODE) {
        saved = {
          id: initial?.id ?? `mock-${Date.now()}`,
          name: form.name, address: form.address, city: form.city,
          state: form.state, zip_code: form.zip_code,
          property_type: form.property_type,
          year_built: payload.year_built ?? null,
          unit_count: initial?.unit_count ?? 0,
          occupied_count: initial?.occupied_count ?? 0,
          cover_url: initial?.cover_url ?? null,
        };
      } else {
        saved = initial
          ? await propertiesApi.update(initial.id, payload)
          : await propertiesApi.create({ ...payload, year_built: payload.year_built ?? undefined } as Parameters<typeof propertiesApi.create>[0]);
      }
      onSave(saved);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="text-sm font-semibold text-slate-900">{initial ? "Edit property" : "Add property"}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-lg leading-none">✕</button>
        </div>
        <div className="px-6 py-5 space-y-4">
          {error && <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Property name *</label>
            <input value={form.name} onChange={set("name")} placeholder="Sunset Towers" className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-black" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Street address *</label>
            <input value={form.address} onChange={set("address")} placeholder="1420 Sunset Blvd" className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-black" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-1">
              <label className="block text-xs font-medium text-slate-700 mb-1">City *</label>
              <input value={form.city} onChange={set("city")} placeholder="Los Angeles" className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-black" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">State *</label>
              <input value={form.state} onChange={set("state")} placeholder="CA" maxLength={2} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-black" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">ZIP *</label>
              <input value={form.zip_code} onChange={set("zip_code")} placeholder="90028" className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-black" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Property type</label>
              <select value={form.property_type} onChange={set("property_type")} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-black bg-white">
                <option value="HOUSE">House</option>
                <option value="TOWNHOUSE">Townhouse</option>
                <option value="CONDO_UNIT">Condo Unit</option>
                <option value="DUPLEX">Duplex</option>
                <option value="TRIPLEX">Triplex</option>
                <option value="FOURPLEX">Fourplex</option>
                <option value="BASEMENT">Basement</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Year built</label>
              <input value={form.year_built} onChange={set("year_built")} placeholder="1985" className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-black" />
            </div>
          </div>
        </div>
        <div className="flex gap-3 px-6 py-4 border-t border-slate-100">
          <button onClick={onClose} className="flex-1 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors">Cancel</button>
          <button onClick={handleSubmit} disabled={saving} className="flex-1 py-2 text-sm bg-black text-white rounded-lg hover:bg-slate-800 transition-colors font-medium disabled:opacity-50">
            {saving ? "Saving…" : initial ? "Save changes" : "Add property"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Single-unit property modal (add property + its one unit together) ───────

interface SingleUnitForm {
  name: string; address: string; city: string; state: string; zip_code: string;
  property_type: string; year_built: string;
}

const BLANK_SINGLE_UNIT_PROP: SingleUnitForm = {
  name: "", address: "", city: "", state: "", zip_code: "", property_type: "HOUSE", year_built: "",
};

const UTILITY_OPTIONS_UNIT = ["Heat", "Electricity", "Water", "Cable", "Internet", "See Full Description"];

function SingleUnitPropertyModal({ onClose, onSaved, title = "Add single-unit property", multiUnit = false }: {
  onClose: () => void;
  onSaved: (property: PropertyOut, units: UnitRow[]) => void;
  title?: string;
  multiUnit?: boolean;
}) {
  const [form, setForm] = useState<SingleUnitForm>(BLANK_SINGLE_UNIT_PROP);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const set = (f: keyof SingleUnitForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((v) => ({ ...v, [f]: e.target.value }));

  const nextKeyRef = useRef(1);
  const [unitKeys, setUnitKeys] = useState<number[]>([0]);
  const unitBlockRefs = useRef<Map<number, UnitBlockHandle>>(new Map());

  const [contactMethods, setContactMethods] = useState<string[]>(["PHONE", "EMAIL"]);
  const toggleContactMethod = (m: string) =>
    setContactMethods((prev) => prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]);

  const [phones, setPhones] = useState<{ number: string; extension: string }[]>([{ number: "", extension: "" }]);
  const setPhone = (i: number, field: "number" | "extension", value: string) =>
    setPhones((prev) => prev.map((p, idx) => idx === i ? { ...p, [field]: value } : p));
  const addPhone = () => setPhones((prev) => [...prev, { number: "", extension: "" }]);
  const removePhone = (i: number) => setPhones((prev) => prev.filter((_, idx) => idx !== i));

  const [emails, setEmails] = useState<string[]>([""]);
  const setEmail = (i: number, value: string) => setEmails((prev) => prev.map((e, idx) => idx === i ? value : e));
  const addEmail = () => setEmails((prev) => [...prev, ""]);
  const removeEmail = (i: number) => setEmails((prev) => prev.filter((_, idx) => idx !== i));

  async function handleSubmit() {
    if (!form.name || !form.address || !form.city || !form.state || !form.zip_code) {
      setError("Please fill in all required property fields.");
      return;
    }
    if (contactMethods.length === 0) {
      setError("Select at least one contact method.");
      return;
    }
    const unitPayloads: UnitBlockPayload[] = [];
    for (const k of unitKeys) {
      const payload = unitBlockRefs.current.get(k)?.getPayload();
      if (!payload) {
        setError(unitKeys.length > 1 ? "Please fix the errors in the unit(s) below." : "Please fix the errors in the unit section below.");
        return;
      }
      unitPayloads.push(payload);
    }
    setSaving(true); setError("");
    const propertyPayload = {
      name: form.name, address: form.address, city: form.city, state: form.state, zip_code: form.zip_code,
      property_type: form.property_type, year_built: form.year_built ? parseInt(form.year_built) : null,
    };
    try {
      let savedProperty: PropertyOut;
      const savedUnits: UnitOut[] = [];
      if (MOCK_MODE) {
        savedProperty = {
          id: `mock-${Date.now()}`, name: form.name, address: form.address, city: form.city,
          state: form.state, zip_code: form.zip_code, property_type: form.property_type,
          year_built: propertyPayload.year_built, unit_count: unitPayloads.length, occupied_count: 0, cover_url: null,
        };
        unitPayloads.forEach((up, i) => {
          savedUnits.push({
            id: `mock-u-${Date.now()}-${i}`, property_id: savedProperty.id, unit_number: up.unit_number,
            bedrooms: up.bedrooms, bathrooms: up.bathrooms, square_feet: up.square_feet,
            monthly_rent: up.monthly_rent, status: up.status,
          });
        });
      } else {
        savedProperty = await propertiesApi.create({ ...propertyPayload, year_built: propertyPayload.year_built ?? undefined } as Parameters<typeof propertiesApi.create>[0]);
        for (const up of unitPayloads) {
          const { photos, ...unitBody } = up;
          const savedUnit = await propertiesApi.createUnit(savedProperty.id, { ...unitBody, status: unitBody.status as UnitOut["status"] });
          for (const file of photos) {
            await imagesApi.uploadUnit(savedProperty.id, savedUnit.id, file);
          }
          savedUnits.push(savedUnit);
        }
      }
      onSaved(savedProperty, savedUnits.map((u) => fromApiUnit(u, savedProperty.name)));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-lg leading-none">✕</button>
        </div>
        <div className="px-6 py-5 space-y-4">
          {error && <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Property name *</label>
            <input value={form.name} onChange={set("name")} placeholder="123 Maple St House" className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-black" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Street address *</label>
            <input value={form.address} onChange={set("address")} placeholder="123 Maple St" className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-black" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-1">
              <label className="block text-xs font-medium text-slate-700 mb-1">City *</label>
              <input value={form.city} onChange={set("city")} placeholder="Los Angeles" className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-black" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">State *</label>
              <input value={form.state} onChange={set("state")} placeholder="CA" maxLength={2} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-black" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">ZIP *</label>
              <input value={form.zip_code} onChange={set("zip_code")} placeholder="90028" className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-black" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Property type</label>
              <select value={form.property_type} onChange={set("property_type")} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-black bg-white">
                <option value="HOUSE">House</option>
                <option value="TOWNHOUSE">Townhouse</option>
                <option value="CONDO_UNIT">Condo Unit</option>
                <option value="DUPLEX">Duplex</option>
                <option value="TRIPLEX">Triplex</option>
                <option value="FOURPLEX">Fourplex</option>
                <option value="BASEMENT">Basement</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Year built</label>
              <input value={form.year_built} onChange={set("year_built")} placeholder="1985" className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-black" />
            </div>
          </div>

          <div className="border-t border-slate-100 pt-4">
            <div className="mb-3">
              <label className="block text-xs font-medium text-slate-700 mb-1.5">Select contact method *</label>
              <div className="flex items-center gap-4">
                {[["PHONE", "Phone"], ["TEXT", "Text"], ["EMAIL", "Email"]].map(([val, lbl]) => (
                  <label key={val} className="flex items-center gap-1.5 text-sm text-slate-700 cursor-pointer">
                    <input type="checkbox" checked={contactMethods.includes(val)} onChange={() => toggleContactMethod(val)} />
                    {lbl}
                  </label>
                ))}
              </div>
            </div>

            <div className="mb-3 space-y-2">
              <label className="block text-xs font-medium text-slate-700">Contact email</label>
              {emails.map((e, i) => (
                <div key={i} className="grid grid-cols-[1fr_auto] gap-2">
                  <input type="email" value={e} onChange={(ev) => setEmail(i, ev.target.value)} placeholder="you@example.com" className="text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-black" />
                  {emails.length > 1 && (
                    <button type="button" onClick={() => removeEmail(i)} className="text-slate-400 hover:text-red-600 text-sm px-1">✕</button>
                  )}
                </div>
              ))}
              <button type="button" onClick={addEmail} className="text-xs font-medium text-emerald-700 hover:text-emerald-800">+ add email</button>
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-medium text-slate-700">Phone</label>
              {phones.map((p, i) => (
                <div key={i} className="grid grid-cols-[2fr_1fr_auto] gap-2">
                  <input value={p.number} onChange={(e) => setPhone(i, "number", e.target.value)} placeholder="(403) 992-6238" className="text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-black" />
                  <input value={p.extension} onChange={(e) => setPhone(i, "extension", e.target.value)} placeholder="Ext." className="text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-black" />
                  {phones.length > 1 && (
                    <button type="button" onClick={() => removePhone(i)} className="text-slate-400 hover:text-red-600 text-sm px-1">✕</button>
                  )}
                </div>
              ))}
              <button type="button" onClick={addPhone} className="text-xs font-medium text-emerald-700 hover:text-emerald-800">+ add phone</button>
            </div>
          </div>

          <div className="border-t border-slate-100 pt-4">
            <p className="text-[11px] uppercase tracking-wider font-medium text-slate-400 mb-3">The unit{unitKeys.length > 1 ? "s" : ""}</p>

            {unitKeys.map((k, idx) => (
              <UnitBlock
                key={k}
                index={idx}
                ref={(el) => {
                  if (el) unitBlockRefs.current.set(k, el);
                  else unitBlockRefs.current.delete(k);
                }}
                label={unitKeys.length > 1 ? `Unit ${idx + 1}` : undefined}
                onRemove={unitKeys.length > 1 ? () => setUnitKeys((ks) => ks.filter((x) => x !== k)) : undefined}
                propertyType={form.property_type}
                address={form.address}
                city={form.city}
                state={form.state}
                contactMethods={contactMethods}
                phones={phones}
                emails={emails}
              />
            ))}

            {multiUnit && (
              <button type="button"
                onClick={() => setUnitKeys((ks) => [...ks, nextKeyRef.current++])}
                className="mt-4 w-full py-2 text-xs font-medium text-slate-600 border border-dashed border-slate-300 rounded-lg hover:border-black hover:text-black transition-colors">
                + Add another unit
              </button>
            )}
          </div>
        </div>
        <div className="flex gap-3 px-6 py-4 border-t border-slate-100">
          <button onClick={onClose} className="flex-1 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors">Cancel</button>
          <button onClick={handleSubmit} disabled={saving} className="flex-1 py-2 text-sm bg-black text-white rounded-lg hover:bg-slate-800 transition-colors font-medium disabled:opacity-50">
            {saving ? "Saving…" : "Add property"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Delete confirm dialog ────────────────────────────────────────────────────

function ConfirmDialog({ message, onConfirm, onCancel }: { message: string; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
        <p className="text-sm text-slate-700 mb-6">{message}</p>
        <div className="flex gap-3">
          <button onClick={onCancel} className="flex-1 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">Cancel</button>
          <button onClick={onConfirm} className="flex-1 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium">Delete</button>
        </div>
      </div>
    </div>
  );
}

// ─── Unit modal (add / edit) ──────────────────────────────────────────────────

interface UnitForm {
  unit_number: string; bedrooms: string; bathrooms: string;
  square_feet: string; monthly_rent: string; status: string;
  security_deposit: string; furnishing: string; lease_term: string;
  smoking_policy: string; dogs_policy: string; cats_policy: string; pet_fee: string;
  property_heading: string; hidden_notes: string; description: string;
}

const BLANK_UNIT: UnitForm = {
  unit_number: "", bedrooms: "1", bathrooms: "1", square_feet: "", monthly_rent: "", status: "VACANT",
  security_deposit: "1 Month Rent", furnishing: "Unfurnished", lease_term: "Long Term",
  smoking_policy: "Non-Smoking", dogs_policy: "Not Allowed", cats_policy: "Not Allowed", pet_fee: "",
  property_heading: "", hidden_notes: "", description: "",
};

function unitRowToForm(u: UnitRow): UnitForm {
  const statusBack: Record<string, string> = { Occupied: "OCCUPIED", Vacant: "VACANT", Maintenance: "MAINTENANCE", Reserved: "RESERVED", Notice: "NOTICE", Renovation: "RENOVATION" };
  const beds = u.layout.match(/(\d+) bed/)?.[1] ?? "1";
  const baths = u.layout.match(/([\d.]+) bath/)?.[1] ?? "1";
  return {
    unit_number: u.number, bedrooms: beds, bathrooms: baths, square_feet: u.sqft ? u.sqft.toString() : "", monthly_rent: u.rent.toString(), status: statusBack[u.status] ?? "VACANT",
    security_deposit: u.securityDeposit ?? "1 Month Rent",
    furnishing: u.furnishing ?? "Unfurnished",
    lease_term: u.leaseTerm ?? "Long Term",
    smoking_policy: u.smokingPolicy ?? "Non-Smoking",
    dogs_policy: u.dogsPolicy ?? "Not Allowed",
    cats_policy: u.catsPolicy ?? "Not Allowed",
    pet_fee: u.petFee != null ? String(u.petFee) : "",
    property_heading: u.propertyHeading ?? "",
    hidden_notes: u.hiddenNotes ?? "",
    description: u.description ?? "",
  };
}

function UnitModal({ propertyId, propertyName, initial, onClose, onSave }: {
  propertyId: string; propertyName: string;
  initial: UnitRow | null;
  onClose: () => void;
  onSave: (u: UnitRow) => void;
}) {
  const [form, setForm] = useState<UnitForm>(initial ? unitRowToForm(initial) : BLANK_UNIT);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const set = (f: keyof UnitForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((v) => ({ ...v, [f]: e.target.value }));

  const [contactMethods, setContactMethods] = useState<string[]>(initial?.contactMethods?.length ? initial.contactMethods : ["PHONE", "EMAIL"]);
  const toggleContactMethod = (m: string) =>
    setContactMethods((prev) => prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]);

  const [phones, setPhones] = useState<{ number: string; extension: string }[]>(
    initial?.contactPhones?.length ? initial.contactPhones.map((p) => ({ number: p.number, extension: p.extension ?? "" })) : [{ number: "", extension: "" }]
  );
  const setPhone = (i: number, field: "number" | "extension", value: string) =>
    setPhones((prev) => prev.map((p, idx) => idx === i ? { ...p, [field]: value } : p));
  const addPhone = () => setPhones((prev) => [...prev, { number: "", extension: "" }]);
  const removePhone = (i: number) => setPhones((prev) => prev.filter((_, idx) => idx !== i));

  const [emails, setEmails] = useState<string[]>(initial?.contactEmails?.length ? initial.contactEmails : [""]);
  const setEmail = (i: number, value: string) => setEmails((prev) => prev.map((e, idx) => idx === i ? value : e));
  const addEmail = () => setEmails((prev) => [...prev, ""]);
  const removeEmail = (i: number) => setEmails((prev) => prev.filter((_, idx) => idx !== i));

  const [utilities, setUtilities] = useState<string[]>(initial?.utilitiesIncluded ?? []);
  const toggleUtility = (u: string) =>
    setUtilities((prev) => prev.includes(u) ? prev.filter((x) => x !== u) : [...prev, u]);

  const [parkingAvailable, setParkingAvailable] = useState<boolean | null>(initial?.parkingAvailable ?? null);
  const [homeFeatures, setHomeFeatures] = useState<string[]>(initial?.homeFeatures ?? []);
  const [neighborhoodFeatures, setNeighborhoodFeatures] = useState<string[]>(initial?.neighborhoodFeatures ?? []);

  const [generatingDesc, setGeneratingDesc] = useState(false);
  const [descAiError, setDescAiError] = useState("");

  async function handleGenerateDescription() {
    setGeneratingDesc(true); setDescAiError("");
    try {
      const contextParts = [
        `Bedrooms: ${form.bedrooms}, Bathrooms: ${form.bathrooms}`,
        form.square_feet ? `Square feet: ${form.square_feet}` : null,
        form.furnishing ? `Furnishing: ${form.furnishing}` : null,
        form.lease_term ? `Lease term: ${form.lease_term}` : null,
        form.smoking_policy ? `Smoking policy: ${form.smoking_policy}` : null,
        `Pets: dogs ${form.dogs_policy.toLowerCase()}, cats ${form.cats_policy.toLowerCase()}`,
        parkingAvailable != null ? `Parking available: ${parkingAvailable ? "yes" : "no"}` : null,
        utilities.length ? `Utilities included: ${utilities.join(", ")}` : null,
        homeFeatures.length ? `Home features: ${homeFeatures.join(", ")}` : null,
        neighborhoodFeatures.length ? `Neighbourhood features: ${neighborhoodFeatures.join(", ")}` : null,
      ].filter(Boolean).join("\n");
      const result = await campaignsApi.aiGenerate({
        unit_id: initial ? initial.id : undefined,
        extra_instructions: contextParts,
        monthly_rent: form.monthly_rent ? Number(form.monthly_rent) : undefined,
      });
      setForm((v) => ({ ...v, description: result.description }));
    } catch (e: unknown) {
      setDescAiError(e instanceof Error ? e.message : "Failed to generate");
    } finally {
      setGeneratingDesc(false);
    }
  }

  // New-unit photo staging (uploaded after creation, since no unit id exists yet)
  const [photos, setPhotos] = useState<{ file: File; preview: string }[]>([]);
  const photoFileRef = useRef<HTMLInputElement>(null);
  const MAX_PHOTOS = 20;

  // Existing-unit photos (edit mode): fetched immediately, uploads/deletes apply live
  const [existingImages, setExistingImages] = useState<ImageOut[]>([]);
  const [loadingImages, setLoadingImages] = useState(!!initial);
  const [imgUploading, setImgUploading] = useState(false);
  const [imgDeleting, setImgDeleting] = useState<string | null>(null);
  const [imgError, setImgError] = useState("");
  const editPhotoRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!initial) return;
    let cancelled = false;
    imagesApi.listUnit(propertyId, initial.id)
      .then((imgs) => { if (!cancelled) setExistingImages(imgs); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoadingImages(false); });
    return () => { cancelled = true; };
  }, [initial, propertyId]);

  async function handleUploadExistingPhoto(file: File) {
    if (!initial) return;
    setImgUploading(true); setImgError("");
    try {
      const img = await imagesApi.uploadUnit(propertyId, initial.id, file);
      setExistingImages((imgs) => [...imgs, img]);
    } catch (e: unknown) {
      setImgError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setImgUploading(false);
    }
  }

  async function handleDeleteExistingPhoto(imageId: string) {
    if (!initial) return;
    setImgDeleting(imageId); setImgError("");
    try {
      await imagesApi.deleteUnit(propertyId, initial.id, imageId);
      setExistingImages((imgs) => imgs.filter((i) => i.id !== imageId));
    } catch (e: unknown) {
      setImgError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setImgDeleting(null);
    }
  }

  async function handleSubmit() {
    if (!form.unit_number || !form.monthly_rent) { setError("Unit number and rent are required."); return; }
    setSaving(true); setError("");
    const payload = {
      unit_number: form.unit_number,
      bedrooms: parseInt(form.bedrooms) || 1,
      bathrooms: parseFloat(form.bathrooms) || 1,
      square_feet: form.square_feet ? parseInt(form.square_feet) : null,
      monthly_rent: parseFloat(form.monthly_rent),
      status: form.status as UnitOut["status"],
      contact_methods: contactMethods,
      contact_phones: phones.filter((p) => p.number.trim()).map((p) => ({ number: p.number.trim(), extension: p.extension.trim() || null })),
      contact_emails: emails.filter((e) => e.trim()),
      security_deposit: form.security_deposit || null,
      utilities_included: utilities,
      furnishing: form.furnishing || null,
      lease_term: form.lease_term || null,
      smoking_policy: form.smoking_policy || null,
      dogs_policy: form.dogs_policy || null,
      cats_policy: form.cats_policy || null,
      pet_fee: form.pet_fee ? parseFloat(form.pet_fee) : null,
      parking_available: parkingAvailable,
      property_heading: form.property_heading || null,
      hidden_notes: form.hidden_notes || null,
      description: form.description || null,
      home_features: homeFeatures,
      neighborhood_features: neighborhoodFeatures,
    };
    try {
      let saved: UnitOut;
      if (MOCK_MODE) {
        saved = {
          id: initial?.id ?? `mock-u-${Date.now()}`,
          property_id: propertyId,
          unit_number: payload.unit_number,
          bedrooms: payload.bedrooms,
          bathrooms: payload.bathrooms,
          square_feet: payload.square_feet ?? null,
          monthly_rent: payload.monthly_rent,
          status: payload.status,
        };
      } else if (initial) {
        saved = await propertiesApi.updateUnit(propertyId, initial.id, payload);
      } else {
        saved = await propertiesApi.createUnit(propertyId, payload);
        for (const p of photos) {
          await imagesApi.uploadUnit(propertyId, saved.id, p.file);
        }
      }
      onSave(fromApiUnit(saved, propertyName));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="text-sm font-semibold text-slate-900">{initial ? "Edit unit" : `Add unit — ${propertyName}`}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-lg leading-none">✕</button>
        </div>
        <div className="px-6 py-5 space-y-4">
          {error && <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Unit number *</label>
              <input value={form.unit_number} onChange={set("unit_number")} placeholder="101" className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-black" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Status</label>
              <select value={form.status} onChange={set("status")} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-black bg-white">
                  <option value="OCCUPIED">Occupied</option>
                  <option value="VACANT">Vacant</option>
                  <option value="MAINTENANCE">Maintenance</option>
                  <option value="RESERVED">Reserved</option>
                  <option value="NOTICE">Notice</option>
                  <option value="RENOVATION">Renovation</option>
                </select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Bedrooms</label>
              <input type="number" min="0" value={form.bedrooms} onChange={set("bedrooms")} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-black" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Bathrooms</label>
              <input type="number" min="0" step="0.5" value={form.bathrooms} onChange={set("bathrooms")} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-black" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Sq ft</label>
              <input type="number" min="0" value={form.square_feet} onChange={set("square_feet")} placeholder="850" className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-black" />
            </div>
          </div>

          <div className="border-t border-slate-100 pt-4">
            <p className="text-[11px] uppercase tracking-wider font-medium text-slate-400 mb-3">Contact</p>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">Select contact method</label>
            <div className="flex items-center gap-4 mb-3">
              <label className="flex items-center gap-1.5 text-sm text-slate-700 cursor-pointer">
                <input type="checkbox" checked={contactMethods.includes("PHONE")} onChange={() => toggleContactMethod("PHONE")} />
                Phone
              </label>
              <label className="flex items-center gap-1.5 text-sm text-slate-700 cursor-pointer">
                <input type="checkbox" checked={contactMethods.includes("TEXT")} onChange={() => toggleContactMethod("TEXT")} />
                Text
              </label>
              <label className="flex items-center gap-1.5 text-sm text-slate-700 cursor-pointer">
                <input type="checkbox" checked={contactMethods.includes("EMAIL")} onChange={() => toggleContactMethod("EMAIL")} />
                Email
              </label>
            </div>

            <label className="block text-xs font-medium text-slate-700 mb-1">Contact email</label>
            {emails.map((e, i) => (
              <div key={i} className="flex items-center gap-2 mb-2">
                <input type="email" value={e} onChange={(ev) => setEmail(i, ev.target.value)} placeholder="you@example.com" className="flex-1 text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-black" />
                {emails.length > 1 && (
                  <button type="button" onClick={() => removeEmail(i)} className="text-slate-400 hover:text-red-600">✕</button>
                )}
              </div>
            ))}
            <button type="button" onClick={addEmail} className="text-xs text-emerald-600 hover:text-emerald-800 mb-3">+ add email</button>

            <label className="block text-xs font-medium text-slate-700 mb-1">Phone</label>
            {phones.map((p, i) => (
              <div key={i} className="flex items-center gap-2 mb-2">
                <input value={p.number} onChange={(e) => setPhone(i, "number", e.target.value)} placeholder="(403) 992-6238" className="flex-1 text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-black" />
                <input value={p.extension} onChange={(e) => setPhone(i, "extension", e.target.value)} placeholder="Ext." className="w-20 text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-black" />
                {phones.length > 1 && (
                  <button type="button" onClick={() => removePhone(i)} className="text-slate-400 hover:text-red-600">✕</button>
                )}
              </div>
            ))}
            <button type="button" onClick={addPhone} className="text-xs text-emerald-600 hover:text-emerald-800">+ add phone</button>
          </div>

          <div className="border-t border-slate-100 pt-4 grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Monthly rent *</label>
              <input type="number" min="0" value={form.monthly_rent} onChange={set("monthly_rent")} placeholder="2400" className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-black" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Security deposit</label>
              <select value={form.security_deposit} onChange={set("security_deposit")} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-black bg-white">
                <option value="1 Month Rent">1 Month Rent</option>
                <option value="1.5 Months Rent">1.5 Months Rent</option>
                <option value="2 Months Rent">2 Months Rent</option>
                <option value="Negotiable">Negotiable</option>
                <option value="None">None</option>
              </select>
            </div>
          </div>

          <div className="mt-2">
            <label className="block text-xs font-medium text-slate-700 mb-1.5">Utilities included</label>
            <div className="grid grid-cols-2 gap-y-1.5">
              {UTILITY_OPTIONS_UNIT.map((u) => (
                <label key={u} className="flex items-center gap-1.5 text-sm text-slate-700 cursor-pointer">
                  <input type="checkbox" checked={utilities.includes(u)} onChange={() => toggleUtility(u)} />
                  {u}
                </label>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 mt-2">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Furnishing</label>
              <select value={form.furnishing} onChange={set("furnishing")} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-black bg-white">
                <option value="Furnished">Furnished</option>
                <option value="Unfurnished">Unfurnished</option>
                <option value="Negotiable">Negotiable</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Lease term</label>
              <select value={form.lease_term} onChange={set("lease_term")} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-black bg-white">
                <option value="Long Term">Long Term</option>
                <option value="Short Term">Short Term</option>
                <option value="Negotiable">Negotiable</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Smoking</label>
            <select value={form.smoking_policy} onChange={set("smoking_policy")} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-black bg-white">
              <option value="Non-Smoking">Non-Smoking</option>
              <option value="Smoking Allowed">Smoking Allowed</option>
            </select>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Dogs</label>
              <select value={form.dogs_policy} onChange={set("dogs_policy")} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-black bg-white">
                <option value="Not Allowed">Not Allowed</option>
                <option value="Allowed">Allowed</option>
                <option value="Negotiable">Negotiable</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Cats</label>
              <select value={form.cats_policy} onChange={set("cats_policy")} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-black bg-white">
                <option value="Not Allowed">Not Allowed</option>
                <option value="Allowed">Allowed</option>
                <option value="Negotiable">Negotiable</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Pet fee</label>
              <input type="number" min="0" value={form.pet_fee} onChange={set("pet_fee")} placeholder="0" className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-black" />
            </div>
          </div>

          <div className="border-t border-slate-100 pt-4 mt-4">
            <label className="block text-xs font-medium text-slate-700 mb-1.5">Parking available</label>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-1.5 text-sm text-slate-700 cursor-pointer">
                <input type="radio" name="parking_available" checked={parkingAvailable === false} onChange={() => setParkingAvailable(false)} />
                No
              </label>
              <label className="flex items-center gap-1.5 text-sm text-slate-700 cursor-pointer">
                <input type="radio" name="parking_available" checked={parkingAvailable === true} onChange={() => setParkingAvailable(true)} />
                Yes
              </label>
            </div>
          </div>

          <div className="border-t border-slate-100 pt-4 mt-4">
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-medium text-slate-700">Property heading</label>
              <span className="text-[11px] text-slate-400">{form.property_heading.length}/80</span>
            </div>
            <input value={form.property_heading} onChange={(e) => setForm((v) => ({ ...v, property_heading: e.target.value.slice(0, 80) }))}
              placeholder="e.g. Cozy 1 Bedroom Downtown Condo" maxLength={80}
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-black" />
          </div>

          <div className="mt-4">
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Hidden notes <span className="text-slate-400 font-normal">(not visible to renters)</span>
            </label>
            <textarea value={form.hidden_notes} onChange={set("hidden_notes")} rows={2}
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-black resize-none" />
          </div>

          <div className="mt-4">
            <label className="block text-xs font-medium text-slate-700 mb-1">Full description</label>
            <p className="text-[11px] text-amber-600 mb-1">Please don&apos;t put email addresses in the description — it can lead to spam and scams.</p>
            <textarea value={form.description} onChange={set("description")} rows={5}
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-black resize-y" />
            {descAiError && <p className="text-[11px] text-red-600 mt-1">{descAiError}</p>}
            <button type="button" onClick={handleGenerateDescription} disabled={generatingDesc}
              className="mt-1.5 px-3 py-1.5 text-xs font-medium bg-violet-600 text-white rounded-lg hover:bg-violet-700 disabled:opacity-50">
              {generatingDesc ? "Generating…" : "✨ Generate with AI"}
            </button>
          </div>

          <div className="mt-4">
            <label className="block text-xs font-medium text-slate-700 mb-1.5">Home features</label>
            <TagPicker options={HOME_FEATURE_OPTIONS} selected={homeFeatures} onToggle={(v) => toggleTag(setHomeFeatures, v)} allowCustom customPlaceholder="+ Add Feature" />
          </div>

          <div className="mt-4">
            <label className="block text-xs font-medium text-slate-700 mb-1.5">Neighbourhood features</label>
            <TagPicker options={NEIGHBORHOOD_FEATURE_OPTIONS} selected={neighborhoodFeatures} onToggle={(v) => toggleTag(setNeighborhoodFeatures, v)} allowCustom customPlaceholder="+ Add Feature" />
          </div>

          {initial ? (
            <div className="mt-4 border-t border-slate-100 pt-4">
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                Photos <span className="text-slate-400 font-normal">({existingImages.length}/{MAX_PHOTOS})</span>
              </label>
              <div className="border border-dashed border-slate-200 rounded-lg p-3 space-y-3">
                {imgError && <p className="text-xs text-red-600 bg-red-50 px-2 py-1.5 rounded-lg">{imgError}</p>}
                {loadingImages ? (
                  <p className="text-xs text-slate-400">Loading…</p>
                ) : existingImages.length > 0 && (
                  <div className="grid grid-cols-4 gap-2">
                    {existingImages.map((img) => (
                      <div key={img.id} className="relative group aspect-square rounded-lg overflow-hidden border border-slate-200">
                        <img src={img.url} alt="" className="w-full h-full object-cover" />
                        <button type="button" disabled={imgDeleting === img.id}
                          onClick={() => handleDeleteExistingPhoto(img.id)}
                          className="absolute top-1 right-1 w-5 h-5 bg-black/60 text-white rounded-full text-xs opacity-0 group-hover:opacity-100 flex items-center justify-center hover:bg-red-600 transition-opacity disabled:opacity-50">
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                {existingImages.length < MAX_PHOTOS && (
                  <>
                    <button type="button" onClick={() => editPhotoRef.current?.click()} disabled={imgUploading}
                      className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-black disabled:opacity-50">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                      {imgUploading ? "Uploading…" : "Add photos"}
                    </button>
                    <input ref={editPhotoRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        e.target.value = "";
                        if (file) handleUploadExistingPhoto(file);
                      }} />
                  </>
                )}
              </div>
            </div>
          ) : (
            <div className="mt-4 border-t border-slate-100 pt-4">
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                Photos <span className="text-slate-400 font-normal">({photos.length}/{MAX_PHOTOS})</span>
              </label>
              <div className="border border-dashed border-slate-200 rounded-lg p-3 space-y-3">
                {photos.length > 0 && (
                  <div className="grid grid-cols-4 gap-2">
                    {photos.map((p, i) => (
                      <div key={i} className="relative group aspect-square rounded-lg overflow-hidden border border-slate-200">
                        <img src={p.preview} alt="" className="w-full h-full object-cover" />
                        <button type="button"
                          onClick={() => setPhotos((ps) => { URL.revokeObjectURL(ps[i].preview); return ps.filter((_, j) => j !== i); })}
                          className="absolute top-1 right-1 w-5 h-5 bg-black/60 text-white rounded-full text-xs opacity-0 group-hover:opacity-100 flex items-center justify-center hover:bg-red-600 transition-opacity">
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                {photos.length < MAX_PHOTOS && (
                  <>
                    <button type="button" onClick={() => photoFileRef.current?.click()}
                      className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-black">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                      Add photos {photos.length > 0 && `(${MAX_PHOTOS - photos.length} remaining)`}
                    </button>
                    <input ref={photoFileRef} type="file" multiple accept="image/jpeg,image/png,image/webp" className="hidden"
                      onChange={(e) => {
                        if (!e.target.files) return;
                        const incoming = Array.from(e.target.files).slice(0, MAX_PHOTOS - photos.length);
                        setPhotos((ps) => [...ps, ...incoming.map((f) => ({ file: f, preview: URL.createObjectURL(f) }))]);
                        e.target.value = "";
                      }} />
                  </>
                )}
              </div>
            </div>
          )}
        </div>
        <div className="flex gap-3 px-6 py-4 border-t border-slate-100">
          <button onClick={onClose} className="flex-1 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">Cancel</button>
          <button onClick={handleSubmit} disabled={saving} className="flex-1 py-2 text-sm bg-black text-white rounded-lg hover:bg-slate-800 font-medium disabled:opacity-50">
            {saving ? "Saving…" : initial ? "Save changes" : "Add unit"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Repeatable unit block (used inside the property-creation modals) ────────

interface UnitBlockPayload {
  unit_number: string; bedrooms: number; bathrooms: number; square_feet: number | null;
  monthly_rent: number; status: string;
  contact_methods: string[]; contact_phones: { number: string; extension: string | null }[]; contact_emails: string[];
  security_deposit: string | null; utilities_included: string[]; furnishing: string | null; lease_term: string | null;
  smoking_policy: string | null; dogs_policy: string | null; cats_policy: string | null; pet_fee: number | null;
  parking_available: boolean | null; property_heading: string; hidden_notes: string | null; description: string | null;
  home_features: string[]; neighborhood_features: string[]; photos: File[];
}

interface UnitBlockHandle {
  getPayload: () => UnitBlockPayload | null;
}

const UnitBlock = forwardRef<UnitBlockHandle, {
  index: number;
  label?: string;
  onRemove?: () => void;
  propertyType: string; address: string; city: string; state: string;
  contactMethods: string[];
  phones: { number: string; extension: string }[];
  emails: string[];
}>(function UnitBlock({ index, label, onRemove, propertyType, address, city, state, contactMethods, phones, emails }, ref) {
  const [form, setForm] = useState<UnitForm>(BLANK_UNIT);
  const set = (f: keyof UnitForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((v) => ({ ...v, [f]: e.target.value }));

  const [utilities, setUtilities] = useState<string[]>([]);
  const toggleUtility = (u: string) =>
    setUtilities((prev) => prev.includes(u) ? prev.filter((x) => x !== u) : [...prev, u]);

  const [parkingAvailable, setParkingAvailable] = useState<boolean | null>(null);
  const [homeFeatures, setHomeFeatures] = useState<string[]>([]);
  const [neighborhoodFeatures, setNeighborhoodFeatures] = useState<string[]>([]);

  const [photos, setPhotos] = useState<{ file: File; preview: string }[]>([]);
  const photoFileRef = useRef<HTMLInputElement>(null);
  const MAX_PHOTOS = 20;

  const [generatingDesc, setGeneratingDesc] = useState(false);
  const [descAiError, setDescAiError] = useState("");
  const [blockError, setBlockError] = useState("");

  async function handleGenerateDescription() {
    setGeneratingDesc(true); setDescAiError("");
    try {
      const contextParts = [
        `Property type: ${propertyType}`,
        address ? `Address: ${address}, ${city}, ${state}` : null,
        `Bedrooms: ${form.bedrooms}, Bathrooms: ${form.bathrooms}`,
        form.square_feet ? `Square feet: ${form.square_feet}` : null,
        form.furnishing ? `Furnishing: ${form.furnishing}` : null,
        form.lease_term ? `Lease term: ${form.lease_term}` : null,
        form.smoking_policy ? `Smoking policy: ${form.smoking_policy}` : null,
        `Pets: dogs ${form.dogs_policy.toLowerCase()}, cats ${form.cats_policy.toLowerCase()}`,
        parkingAvailable != null ? `Parking available: ${parkingAvailable ? "yes" : "no"}` : null,
        utilities.length ? `Utilities included: ${utilities.join(", ")}` : null,
        homeFeatures.length ? `Home features: ${homeFeatures.join(", ")}` : null,
        neighborhoodFeatures.length ? `Neighbourhood features: ${neighborhoodFeatures.join(", ")}` : null,
      ].filter(Boolean).join("\n");
      const result = await campaignsApi.aiGenerate({
        extra_instructions: contextParts,
        monthly_rent: form.monthly_rent ? Number(form.monthly_rent) : undefined,
      });
      setForm((v) => ({ ...v, description: result.description }));
    } catch (e: unknown) {
      setDescAiError(e instanceof Error ? e.message : "Failed to generate");
    } finally {
      setGeneratingDesc(false);
    }
  }

  useImperativeHandle(ref, () => ({
    getPayload: () => {
      if (!form.monthly_rent) { setBlockError("Monthly rent is required."); return null; }
      if (parkingAvailable === null) { setBlockError("Select whether parking is available."); return null; }
      if (!form.property_heading.trim()) { setBlockError("Property heading is required."); return null; }
      if (homeFeatures.length === 0) { setBlockError("Select at least one home feature."); return null; }
      setBlockError("");
      return {
        unit_number: form.unit_number || String(index + 1),
        bedrooms: parseInt(form.bedrooms) || 1,
        bathrooms: parseFloat(form.bathrooms) || 1,
        square_feet: form.square_feet ? parseInt(form.square_feet) : null,
        monthly_rent: parseFloat(form.monthly_rent),
        status: form.status,
        contact_methods: contactMethods,
        contact_phones: phones.filter((p) => p.number.trim()).map((p) => ({ number: p.number.trim(), extension: p.extension.trim() || null })),
        contact_emails: emails.filter((e) => e.trim()),
        security_deposit: form.security_deposit || null,
        utilities_included: utilities,
        furnishing: form.furnishing || null,
        lease_term: form.lease_term || null,
        smoking_policy: form.smoking_policy || null,
        dogs_policy: form.dogs_policy || null,
        cats_policy: form.cats_policy || null,
        pet_fee: form.pet_fee ? parseFloat(form.pet_fee) : null,
        parking_available: parkingAvailable,
        property_heading: form.property_heading.trim(),
        hidden_notes: form.hidden_notes || null,
        description: form.description || null,
        home_features: homeFeatures,
        neighborhood_features: neighborhoodFeatures,
        photos: photos.map((p) => p.file),
      };
    },
  }));

  return (
    <div className="border-t border-slate-100 pt-4 mt-4 first:mt-0 first:border-t-0 first:pt-0">
      {label && (
        <div className="flex items-center justify-between mb-3">
          <p className="text-[11px] uppercase tracking-wider font-medium text-slate-400">{label}</p>
          {onRemove && (
            <button type="button" onClick={onRemove} className="text-xs text-slate-400 hover:text-red-600">Remove unit ✕</button>
          )}
        </div>
      )}
      {blockError && <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2 mb-3">{blockError}</p>}

      <div className="grid grid-cols-2 gap-3 mb-3">
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">Monthly rent *</label>
          <input type="number" min="0" value={form.monthly_rent} onChange={set("monthly_rent")} placeholder="2400" className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-black" />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">Security deposit</label>
          <select value={form.security_deposit} onChange={set("security_deposit")} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-black bg-white">
            <option value="1 Month Rent">1 Month Rent</option>
            <option value="1.5 Months Rent">1.5 Months Rent</option>
            <option value="2 Months Rent">2 Months Rent</option>
            <option value="Negotiable">Negotiable</option>
            <option value="None">None</option>
          </select>
        </div>
      </div>

      <div className="mb-3">
        <label className="block text-xs font-medium text-slate-700 mb-1.5">Utilities included</label>
        <div className="grid grid-cols-2 gap-y-1.5">
          {UTILITY_OPTIONS_UNIT.map((u) => (
            <label key={u} className="flex items-center gap-1.5 text-sm text-slate-700 cursor-pointer">
              <input type="checkbox" checked={utilities.includes(u)} onChange={() => toggleUtility(u)} />
              {u}
            </label>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-3">
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">Bedrooms</label>
          <input type="number" min="0" value={form.bedrooms} onChange={set("bedrooms")} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-black" />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">Bathrooms</label>
          <input type="number" min="0" step="0.5" value={form.bathrooms} onChange={set("bathrooms")} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-black" />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">Sq ft</label>
          <input type="number" min="0" value={form.square_feet} onChange={set("square_feet")} placeholder="850" className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-black" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-3">
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">Furnishing</label>
          <select value={form.furnishing} onChange={set("furnishing")} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-black bg-white">
            <option value="Furnished">Furnished</option>
            <option value="Unfurnished">Unfurnished</option>
            <option value="Negotiable">Negotiable</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">Lease term</label>
          <select value={form.lease_term} onChange={set("lease_term")} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-black bg-white">
            <option value="Long Term">Long Term</option>
            <option value="Short Term">Short Term</option>
            <option value="Negotiable">Negotiable</option>
          </select>
        </div>
      </div>

      <div className="mb-3">
        <label className="block text-xs font-medium text-slate-700 mb-1">Smoking</label>
        <select value={form.smoking_policy} onChange={set("smoking_policy")} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-black bg-white">
          <option value="Non-Smoking">Non-Smoking</option>
          <option value="Smoking Allowed">Smoking Allowed</option>
        </select>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">Dogs</label>
          <select value={form.dogs_policy} onChange={set("dogs_policy")} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-black bg-white">
            <option value="Not Allowed">Not Allowed</option>
            <option value="Allowed">Allowed</option>
            <option value="Negotiable">Negotiable</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">Cats</label>
          <select value={form.cats_policy} onChange={set("cats_policy")} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-black bg-white">
            <option value="Not Allowed">Not Allowed</option>
            <option value="Allowed">Allowed</option>
            <option value="Negotiable">Negotiable</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">Pet fee</label>
          <input type="number" min="0" value={form.pet_fee} onChange={set("pet_fee")} placeholder="0" className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-black" />
        </div>
      </div>

      <div className="border-t border-slate-100 pt-4 mt-4">
        <label className="block text-xs font-medium text-slate-700 mb-1.5">Parking available *</label>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-1.5 text-sm text-slate-700 cursor-pointer">
            <input type="radio" name={`parking_available_${label ?? "single"}`} checked={parkingAvailable === false} onChange={() => setParkingAvailable(false)} />
            No
          </label>
          <label className="flex items-center gap-1.5 text-sm text-slate-700 cursor-pointer">
            <input type="radio" name={`parking_available_${label ?? "single"}`} checked={parkingAvailable === true} onChange={() => setParkingAvailable(true)} />
            Yes
          </label>
        </div>
      </div>

      <div className="border-t border-slate-100 pt-4 mt-4">
        <div className="flex items-center justify-between mb-1">
          <label className="block text-xs font-medium text-slate-700">Property heading *</label>
          <span className="text-[11px] text-slate-400">{form.property_heading.length}/80</span>
        </div>
        <input value={form.property_heading} onChange={(e) => setForm((v) => ({ ...v, property_heading: e.target.value.slice(0, 80) }))}
          placeholder="e.g. Cozy 1 Bedroom Downtown Condo" maxLength={80}
          className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-black" />
      </div>

      <div className="mt-4">
        <label className="block text-xs font-medium text-slate-700 mb-1">
          Hidden notes <span className="text-slate-400 font-normal">(not visible to renters)</span>
        </label>
        <textarea value={form.hidden_notes} onChange={set("hidden_notes")} rows={2}
          className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-black resize-none" />
      </div>

      <div className="mt-4">
        <label className="block text-xs font-medium text-slate-700 mb-1">Full description</label>
        <p className="text-[11px] text-amber-600 mb-1">Please don&apos;t put email addresses in the description — it can lead to spam and scams.</p>
        <textarea value={form.description} onChange={set("description")} rows={5}
          className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-black resize-y" />
        {descAiError && <p className="text-[11px] text-red-600 mt-1">{descAiError}</p>}
        <button type="button" onClick={handleGenerateDescription} disabled={generatingDesc}
          className="mt-1.5 px-3 py-1.5 text-xs font-medium bg-violet-600 text-white rounded-lg hover:bg-violet-700 disabled:opacity-50">
          {generatingDesc ? "Generating…" : "✨ Generate with AI"}
        </button>
      </div>

      <div className="mt-4">
        <label className="block text-xs font-medium text-slate-700 mb-1.5">Home features *</label>
        <TagPicker options={HOME_FEATURE_OPTIONS} selected={homeFeatures} onToggle={(v) => toggleTag(setHomeFeatures, v)} allowCustom customPlaceholder="+ Add Feature" />
      </div>

      <div className="mt-4">
        <label className="block text-xs font-medium text-slate-700 mb-1.5">Neighbourhood features</label>
        <TagPicker options={NEIGHBORHOOD_FEATURE_OPTIONS} selected={neighborhoodFeatures} onToggle={(v) => toggleTag(setNeighborhoodFeatures, v)} allowCustom customPlaceholder="+ Add Feature" />
      </div>

      <div className="mt-4 border-t border-slate-100 pt-4">
        <label className="block text-xs font-medium text-slate-700 mb-1.5">
          Photos <span className="text-slate-400 font-normal">({photos.length}/{MAX_PHOTOS})</span>
        </label>
        <div className="border border-dashed border-slate-200 rounded-lg p-3 space-y-3">
          {photos.length > 0 && (
            <div className="grid grid-cols-4 gap-2">
              {photos.map((p, i) => (
                <div key={i} className="relative group aspect-square rounded-lg overflow-hidden border border-slate-200">
                  <img src={p.preview} alt="" className="w-full h-full object-cover" />
                  <button type="button"
                    onClick={() => setPhotos((ps) => { URL.revokeObjectURL(ps[i].preview); return ps.filter((_, j) => j !== i); })}
                    className="absolute top-1 right-1 w-5 h-5 bg-black/60 text-white rounded-full text-xs opacity-0 group-hover:opacity-100 flex items-center justify-center hover:bg-red-600 transition-opacity">
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
          {photos.length < MAX_PHOTOS && (
            <>
              <button type="button" onClick={() => photoFileRef.current?.click()}
                className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-black">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Add photos {photos.length > 0 && `(${MAX_PHOTOS - photos.length} remaining)`}
              </button>
              <input ref={photoFileRef} type="file" multiple accept="image/jpeg,image/png,image/webp" className="hidden"
                onChange={(e) => {
                  if (!e.target.files) return;
                  const incoming = Array.from(e.target.files).slice(0, MAX_PHOTOS - photos.length);
                  setPhotos((ps) => [...ps, ...incoming.map((f) => ({ file: f, preview: URL.createObjectURL(f) }))]);
                  e.target.value = "";
                }} />
            </>
          )}
        </div>
      </div>
    </div>
  );
});

// ─── Tenant Detail Modal ──────────────────────────────────────────────────────

function TenantCard({ tenantUserId, tenantInfo, unitRent }: {
  tenantUserId: string | null;
  tenantInfo: UnitTenantInfo;
  unitRent: number;
}) {
  const [tenant, setTenant] = useState<TenantOut | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!tenantUserId) { setLoading(false); return; }
    tenantsApi.getPerson(tenantUserId)
      .then(t => setTenant(t))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [tenantUserId]);

  const initials = (tenantInfo.tenant_name ?? "?").split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
  const rows: [string, string | null | undefined][] = tenant ? [
    ["Email", tenant.email],
    ["Phone", tenant.phone || null],
    ["Date of birth", tenant.date_of_birth || null],
    ["Address", [tenant.street_address, tenant.city, tenant.province, tenant.postal_code, tenant.country].filter(Boolean).join(", ") || null],
  ] : [];

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-black text-white text-xs font-bold flex items-center justify-center shrink-0">
          {initials}
        </div>
        <div>
          <p className="text-sm font-semibold text-slate-900">{tenantInfo.tenant_name}</p>
          {loading && <p className="text-xs text-slate-400">Loading…</p>}
        </div>
      </div>

      {!loading && tenant && (
        <div className="space-y-1.5 pl-1">
          {rows.map(([label, value]) => value ? (
            <div key={label} className="flex gap-3">
              <span className="text-xs text-slate-400 w-24 shrink-0">{label}</span>
              <span className="text-xs text-slate-700 font-medium">{value}</span>
            </div>
          ) : null)}
        </div>
      )}

      <div className="pl-1 space-y-1.5 border-t border-slate-100 pt-2">
        <div className="flex gap-3">
          <span className="text-xs text-slate-400 w-24 shrink-0">Lease period</span>
          <span className="text-xs text-slate-700 font-medium">{tenantInfo.lease_start} → {tenantInfo.lease_end}</span>
        </div>
        <div className="flex gap-3">
          <span className="text-xs text-slate-400 w-24 shrink-0">Rent</span>
          <span className="text-xs text-slate-700 font-medium">${unitRent.toLocaleString()}/mo</span>
        </div>
        {tenantInfo.outstanding_balance > 0 && (
          <div className="flex gap-3">
            <span className="text-xs text-slate-400 w-24 shrink-0">Outstanding</span>
            <span className="text-xs text-red-600 font-medium">${tenantInfo.outstanding_balance.toLocaleString()}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function TenantDetailModal({ unit, onClose }: { unit: UnitRow; onClose: () => void }) {
  // Derive list of tenants to show — prefer the rich `tenants` array from backend,
  // fall back to the legacy single-tenant fields
  const tenantList: UnitTenantInfo[] = unit.tenants.length > 0
    ? unit.tenants
    : unit.tenantUserId
      ? [{
          tenant_user_id: unit.tenantUserId,
          tenant_name: unit.tenant,
          tenant_avatar_url: unit.tenantAvatarUrl,
          lease_id: unit.leaseId ?? "",
          lease_start: unit.leaseStart,
          lease_end: unit.leaseEnd,
          outstanding_balance: unit.outstandingBalance,
        }]
      : [];

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-xl overflow-hidden max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              {tenantList.length > 1 ? `${tenantList.length} tenants` : "Tenant detail"}
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">Unit {unit.number} · {unit.property}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
        </div>

        <div className="px-6 py-5 space-y-5 overflow-y-auto">
          {tenantList.length === 0 && <p className="text-xs text-slate-400">No tenant data available.</p>}
          {tenantList.map((t, i) => (
            <React.Fragment key={t.tenant_user_id}>
              {i > 0 && <div className="border-t border-slate-200" />}
              <TenantCard tenantUserId={t.tenant_user_id} tenantInfo={t} unitRent={unit.rent} />
            </React.Fragment>
          ))}
        </div>

        <div className="px-6 pb-5 shrink-0">
          <button onClick={onClose}
            className="w-full py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type ModalState =
  | { type: "none" }
  | { type: "addProperty" }
  | { type: "addSingleUnitProperty" }
  | { type: "editProperty"; property: PropertyOut }
  | { type: "deleteProperty"; property: PropertyOut }
  | { type: "addUnit"; propertyId: string; propertyName: string }
  | { type: "editUnit"; unit: UnitRow; propertyName: string }
  | { type: "deleteUnit"; unit: UnitRow }
  | { type: "endLease"; unit: UnitRow }
  | { type: "propertyImages"; property: PropertyOut }
  | { type: "unitImages"; unit: UnitRow }
  | { type: "tenantDetail"; unit: UnitRow };

export default function PropertiesPage() {
  const router = useRouter();
  const [filter, setFilter] = useState("all");
  const [selectedPropertyIds, setSelectedPropertyIds] = useState<Set<string>>(new Set());
  const [modal, setModal] = useState<ModalState>({ type: "none" });
  const [properties, setProperties] = useState<PropertyOut[]>(MOCK_PROPERTIES);
  const [units, setUnits] = useState<UnitRow[]>(MOCK_UNITS);
  const [galleryImages, setGalleryImages] = useState<ImageOut[]>([]);
  const [galleryUploading, setGalleryUploading] = useState(false);
  const [galleryCoverId, setGalleryCoverId] = useState<string | null>(null);
  const [expandedUnitId, setExpandedUnitId] = useState<string | null>(null);
  const [unitImages, setUnitImages] = useState<Record<string, ImageOut[]>>({});
  const [logoUploading, setLogoUploading] = useState<string | null>(null);
  const logoUploadPropId = useRef<string | null>(null);
  const logoFileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (MOCK_MODE) return;
    propertiesApi.list().then(async (props) => {
      setProperties(props);
      const allUnits: UnitRow[] = [];
      for (const p of props) {
        const us = await propertiesApi.listUnits(p.id);
        allUnits.push(...us.map((u) => fromApiUnit(u, p.name)));
      }
      setUnits(allUnits);
    }).catch(() => {});
  }, []);

  async function openPropertyGallery(p: PropertyOut) {
    setModal({ type: "propertyImages", property: p });
    setGalleryCoverId(p.cover_url ? (galleryImages.find(i => p.cover_url?.includes(i.filename))?.id ?? null) : null);
    const imgs = await imagesApi.listProperty(p.id).catch(() => []);
    setGalleryImages(imgs);
    // find which image is the cover from the fetched list
    if (p.cover_url) {
      const coverImg = imgs.find(i => p.cover_url!.endsWith(i.filename));
      setGalleryCoverId(coverImg?.id ?? null);
    } else {
      setGalleryCoverId(null);
    }
  }

  async function handleSetCover(propertyId: string, imageId: string) {
    const updated = await propertiesApi.setCover(propertyId, imageId).catch(() => null);
    if (updated) {
      setProperties(prev => prev.map(p => p.id === propertyId ? updated : p));
      setGalleryCoverId(imageId);
    }
  }

  async function openUnitGallery(u: UnitRow) {
    setModal({ type: "unitImages", unit: u });
    const imgs = await imagesApi.listUnit(u.property_id, u.id).catch(() => []);
    setGalleryImages(imgs);
  }

  async function handlePropertyImageUpload(propertyId: string, file: File) {
    setGalleryUploading(true);
    try {
      const img = await imagesApi.uploadProperty(propertyId, file);
      setGalleryImages((prev) => [...prev, img]);
    } catch { /* ignore */ } finally { setGalleryUploading(false); }
  }

  async function handlePropertyImageDelete(propertyId: string, imageId: string) {
    await imagesApi.deleteProperty(propertyId, imageId).catch(() => {});
    setGalleryImages((prev) => prev.filter((i) => i.id !== imageId));
    if (galleryCoverId === imageId) {
      setGalleryCoverId(null);
      setProperties(prev => prev.map(p => p.id === propertyId ? { ...p, cover_url: null } : p));
    }
  }

  async function handleUnitImageUpload(propertyId: string, unitId: string, file: File) {
    setGalleryUploading(true);
    try {
      const img = await imagesApi.uploadUnit(propertyId, unitId, file);
      setGalleryImages((prev) => [...prev, img]);
      setUnitImages((prev) => ({ ...prev, [unitId]: [...(prev[unitId] ?? []), img] }));
    } catch { /* ignore */ } finally { setGalleryUploading(false); }
  }

  async function handleUnitImageDelete(propertyId: string, unitId: string, imageId: string) {
    await imagesApi.deleteUnit(propertyId, unitId, imageId).catch(() => {});
    setGalleryImages((prev) => prev.filter((i) => i.id !== imageId));
    setUnitImages((prev) => ({ ...prev, [unitId]: (prev[unitId] ?? []).filter(i => i.id !== imageId) }));
  }

  const handleLogoFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const propId = logoUploadPropId.current;
    if (!file || !propId) return;
    e.target.value = "";
    setLogoUploading(propId);
    try {
      const img = await imagesApi.uploadProperty(propId, file);
      const updated = await propertiesApi.setCover(propId, img.id);
      setProperties(prev => prev.map(p => p.id === propId ? updated : p));
    } catch { /* ignore */ } finally {
      setLogoUploading(null);
    }
  }, []);

  function triggerLogoUpload(propId: string) {
    logoUploadPropId.current = propId;
    logoFileRef.current?.click();
  }

  async function toggleUnitExpand(u: UnitRow) {
    if (expandedUnitId === u.id) { setExpandedUnitId(null); return; }
    setExpandedUnitId(u.id);
    if (!unitImages[u.id]) {
      const imgs = await imagesApi.listUnit(u.property_id, u.id).catch(() => []);
      setUnitImages(prev => ({ ...prev, [u.id]: imgs }));
    }
  }

  function handlePropertySaved(p: PropertyOut) {
    setProperties((prev) => {
      const idx = prev.findIndex((x) => x.id === p.id);
      return idx >= 0 ? prev.map((x) => x.id === p.id ? p : x) : [...prev, p];
    });
    setModal({ type: "none" });
  }

  function handleSingleUnitPropertySaved(p: PropertyOut, units: UnitRow[]) {
    setProperties((prev) => [...prev, { ...p, unit_count: units.length }]);
    setUnits((prev) => [...prev, ...units]);
    setSelectedPropertyIds(new Set([p.id]));
    setModal({ type: "none" });
  }

  async function handlePropertyDelete(p: PropertyOut) {
    if (!MOCK_MODE) {
      try { await propertiesApi.delete(p.id); } catch (e: unknown) { setModal({ type: "none" }); return; }
    }
    setProperties((prev) => prev.filter((x) => x.id !== p.id));
    setUnits((prev) => prev.filter((u) => u.property_id !== p.id));
    setModal({ type: "none" });
  }

  function handleUnitSaved(u: UnitRow) {
    let isNew = false;
    setUnits((prev) => {
      const idx = prev.findIndex((x) => x.id === u.id);
      if (idx < 0) { isNew = true; return [...prev, u]; }
      return prev.map((x) => x.id === u.id ? u : x);
    });
    if (isNew) {
      setProperties((prev) => prev.map((p) =>
        p.id === u.property_id ? { ...p, unit_count: p.unit_count + 1 } : p
      ));
      setSelectedPropertyIds(new Set([u.property_id]));
    }
    setModal({ type: "none" });
  }

  async function handleUnitDelete(u: UnitRow) {
    if (!MOCK_MODE) {
      try { await propertiesApi.deleteUnit(u.property_id, u.id); } catch { return; }
    }
    setUnits((prev) => prev.filter((x) => x.id !== u.id));
    setProperties((prev) => prev.map((p) =>
      p.id === u.property_id ? { ...p, unit_count: Math.max(0, p.unit_count - 1) } : p
    ));
    setModal({ type: "none" });
  }

  async function handleEndLease(u: UnitRow) {
    if (!MOCK_MODE && u.leaseId) {
      try { await tenantsApi.delete(u.leaseId); } catch { setModal({ type: "none" }); return; }
    }
    setUnits((prev) => prev.map((x) =>
      x.id === u.id ? { ...x, status: "Vacant", tenant: null, tenantUserId: null, tenantAvatarUrl: null, leaseId: null, leaseStart: null, leaseEnd: null, outstandingBalance: 0 } : x
    ));
    setProperties((prev) => prev.map((p) =>
      p.id === u.property_id ? { ...p, occupied_count: Math.max(0, p.occupied_count - 1) } : p
    ));
    setModal({ type: "none" });
  }

  const propertyUnits = units.filter(u => selectedPropertyIds.has(u.property_id));
  const filtered = filter === "all" ? propertyUnits : propertyUnits.filter((u) => u.status === filter);

  return (
    <div className="max-w-[1280px] mx-auto px-6 py-6 space-y-6">
      {/* Hidden logo file input */}
      <input ref={logoFileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleLogoFileChange} />

      {/* Modals */}
      {(modal.type === "addProperty") && (
        <SingleUnitPropertyModal title="Add property" multiUnit onClose={() => setModal({ type: "none" })} onSaved={handleSingleUnitPropertySaved} />
      )}
      {(modal.type === "editProperty") && (
        <PropertyModal initial={modal.property} onClose={() => setModal({ type: "none" })} onSave={handlePropertySaved} />
      )}
      {(modal.type === "addSingleUnitProperty") && (
        <SingleUnitPropertyModal onClose={() => setModal({ type: "none" })} onSaved={handleSingleUnitPropertySaved} />
      )}
      {(modal.type === "deleteProperty") && (
        <ConfirmDialog
          message={`Delete "${modal.property.name}"? All units will also be removed. This cannot be undone.`}
          onConfirm={() => handlePropertyDelete(modal.property)}
          onCancel={() => setModal({ type: "none" })}
        />
      )}
      {(modal.type === "addUnit") && (
        <UnitModal propertyId={modal.propertyId} propertyName={modal.propertyName} initial={null}
          onClose={() => setModal({ type: "none" })} onSave={handleUnitSaved} />
      )}
      {(modal.type === "editUnit") && (
        <UnitModal propertyId={modal.unit.property_id} propertyName={modal.propertyName} initial={modal.unit}
          onClose={() => setModal({ type: "none" })} onSave={handleUnitSaved} />
      )}
      {(modal.type === "deleteUnit") && (
        <ConfirmDialog
          message={`Delete unit ${modal.unit.number} at ${modal.unit.property}? This cannot be undone.`}
          onConfirm={() => handleUnitDelete(modal.unit)}
          onCancel={() => setModal({ type: "none" })}
        />
      )}
      {(modal.type === "endLease") && (
        <ConfirmDialog
          message={`End the lease for ${modal.unit.tenant} in unit ${modal.unit.number}? The unit will be marked Vacant. Outstanding balance of $${modal.unit.outstandingBalance.toLocaleString()} will remain in payment records.`}
          onConfirm={() => handleEndLease(modal.unit)}
          onCancel={() => setModal({ type: "none" })}
        />
      )}
      {(modal.type === "propertyImages") && (
        <ImageGalleryModal
          title={`Photos — ${modal.property.name}`}
          images={galleryImages}
          uploading={galleryUploading}
          onUpload={(f) => handlePropertyImageUpload(modal.property.id, f)}
          onDelete={(id) => handlePropertyImageDelete(modal.property.id, id)}
          onClose={() => setModal({ type: "none" })}
          onSetCover={(id) => handleSetCover(modal.property.id, id)}
          coverId={galleryCoverId}
        />
      )}
      {(modal.type === "unitImages") && (
        <ImageGalleryModal
          title={`Photos — Unit ${modal.unit.number} · ${modal.unit.property}`}
          images={galleryImages}
          uploading={galleryUploading}
          onUpload={(f) => handleUnitImageUpload(modal.unit.property_id, modal.unit.id, f)}
          onDelete={(id) => handleUnitImageDelete(modal.unit.property_id, modal.unit.id, id)}
          onClose={() => setModal({ type: "none" })}
        />
      )}
      {(modal.type === "tenantDetail") && (
        <TenantDetailModal unit={modal.unit} onClose={() => setModal({ type: "none" })} />
      )}

      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <p className="text-[11px] uppercase tracking-widest text-slate-400 font-medium">Assets</p>
          <h1 className="text-xl font-bold text-slate-900 mt-0.5">Properties and units</h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setModal({ type: "addSingleUnitProperty" })}
            className="px-3 py-1.5 border border-slate-200 text-slate-700 text-xs font-medium rounded-lg hover:bg-slate-50 transition-colors"
          >
            + Add property (single unit)
          </button>
          <button
            onClick={() => setModal({ type: "addProperty" })}
            className="px-3 py-1.5 bg-black text-white text-xs font-medium rounded-lg hover:bg-slate-800 transition-colors"
          >
            + Add property
          </button>
        </div>
      </div>

      {/* Property cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {properties.map((p) => (
          <div key={p.id} onClick={(e) => {
              setSelectedPropertyIds(prev => {
                const next = new Set(prev);
                if (e.ctrlKey || e.metaKey) {
                  next.has(p.id) ? next.delete(p.id) : next.add(p.id);
                } else {
                  if (next.size === 1 && next.has(p.id)) { next.clear(); } else { next.clear(); next.add(p.id); }
                }
                return next;
              });
            }} className={`bg-white rounded-xl border overflow-hidden hover:shadow-md transition-shadow group cursor-pointer ${selectedPropertyIds.has(p.id) ? "border-black ring-2 ring-black" : "border-slate-200"}`}>
            {/* Slim accent header with action buttons */}
            <div className="h-10 bg-slate-100 flex items-center justify-end px-2 gap-1 relative">
              <span className="absolute left-3 text-[10px] font-medium text-slate-400 uppercase tracking-wider">
                {TYPE_LABELS[p.property_type] ?? p.property_type}
              </span>
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => openPropertyGallery(p)}
                  title="Photos"
                  className="p-1.5 bg-white rounded-lg shadow text-slate-600 hover:bg-slate-50 border border-slate-200"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </button>
                <button
                  onClick={() => setModal({ type: "addUnit", propertyId: p.id, propertyName: p.name })}
                  title="Add unit"
                  className="p-1.5 bg-white rounded-lg shadow text-xs text-slate-600 hover:bg-slate-50 border border-slate-200"
                >+ Unit</button>
                <button
                  onClick={() => setModal({ type: "editProperty", property: p })}
                  title="Edit property"
                  className="p-1.5 bg-white rounded-lg shadow text-slate-600 hover:bg-slate-50 border border-slate-200"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </button>
                <button
                  onClick={() => setModal({ type: "deleteProperty", property: p })}
                  title="Delete property"
                  className="p-1.5 bg-white rounded-lg shadow text-red-500 hover:bg-red-50 border border-slate-200"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Card body with round logo */}
            <div className="p-4 flex items-start gap-3">
              {/* Circular logo — click to replace */}
              <button
                onClick={() => triggerLogoUpload(p.id)}
                title="Change logo"
                className="shrink-0 relative w-14 h-14 rounded-full border-2 border-white ring-2 ring-slate-200 overflow-hidden bg-slate-100 hover:ring-black transition-all focus:outline-none"
              >
                {logoUploading === p.id ? (
                  <div className="w-full h-full flex items-center justify-center bg-slate-100">
                    <svg className="w-5 h-5 animate-spin text-slate-400" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                    </svg>
                  </div>
                ) : p.cover_url ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.cover_url} alt={p.name} className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-black/0 hover:bg-black/40 transition-colors flex items-center justify-center">
                      <svg className="w-4 h-4 text-white opacity-0 group-hover/logo:opacity-100" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                    </div>
                  </>
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center group/logo">
                    <span className="text-xl group-hover/logo:hidden">🏢</span>
                    <svg className="w-5 h-5 text-slate-400 hidden group-hover/logo:block" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    <span className="text-[9px] text-slate-400 hidden group-hover/logo:block mt-0.5">Upload</span>
                  </div>
                )}
              </button>

              {/* Property info */}
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-semibold text-slate-900 truncate">{p.name}</h3>
                <p className="text-xs text-slate-500 mt-0.5 truncate">{p.address}, {p.city}, {p.state} {p.zip_code}</p>
                {p.year_built && <p className="text-xs text-slate-400 mt-0.5">Built {p.year_built}</p>}
                <OccupancyBar occupied={p.occupied_count} total={p.unit_count} />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Unit inventory */}
      <div className="bg-white rounded-xl border border-slate-200">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h3 className="text-sm font-semibold text-slate-900">
            Unit inventory
            {selectedPropertyIds.size === 1 && (
              <span className="ml-2 text-xs font-normal text-slate-400">· {properties.find(p => selectedPropertyIds.has(p.id))?.name}</span>
            )}
            {selectedPropertyIds.size > 1 && (
              <span className="ml-2 text-xs font-normal text-slate-400">· {selectedPropertyIds.size} properties</span>
            )}
          </h3>
          <div className="flex items-center gap-2">
            {(() => {
              const selProp = selectedPropertyIds.size === 1 ? properties.find(p => selectedPropertyIds.has(p.id)) ?? null : null;
              const disabled = !selProp;
              return (
                <button
                  disabled={disabled}
                  title={disabled ? "Select a property first" : `Add unit to ${selProp!.name}`}
                  onClick={(e) => { e.stopPropagation(); selProp && setModal({ type: "addUnit", propertyId: selProp.id, propertyName: selProp.name }); }}
                  className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${disabled ? "bg-slate-100 text-slate-400 cursor-not-allowed" : "bg-black text-white hover:bg-slate-800"}`}
                >
                  + Unit
                </button>
              );
            })()}
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="text-xs border border-slate-200 rounded-lg px-3 py-1.5 bg-white outline-none focus:border-black"
            >
            <option value="all">All status</option>
            <option value="Occupied">Occupied</option>
            <option value="Vacant">Vacant</option>
            <option value="Maintenance">Maintenance</option>
            <option value="Reserved">Reserved</option>
            <option value="Notice">Notice</option>
            <option value="Renovation">Renovation</option>
          </select>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="text-left text-[11px] font-medium text-slate-400 uppercase tracking-wider px-5 py-3">Unit</th>
                <th className="text-left text-[11px] font-medium text-slate-400 uppercase tracking-wider px-3 py-3">Property</th>
                <th className="text-left text-[11px] font-medium text-slate-400 uppercase tracking-wider px-3 py-3">Layout</th>
                <th className="text-left text-[11px] font-medium text-slate-400 uppercase tracking-wider px-3 py-3">Rent</th>
                <th className="text-left text-[11px] font-medium text-slate-400 uppercase tracking-wider px-3 py-3">Status</th>
                <th className="text-left text-[11px] font-medium text-slate-400 uppercase tracking-wider px-3 py-3">Tenant</th>
                <th className="text-left text-[11px] font-medium text-slate-400 uppercase tracking-wider px-3 py-3">Lease period</th>
                <th className="text-left text-[11px] font-medium text-slate-400 uppercase tracking-wider px-3 py-3">Outstanding</th>
                <th className="px-3 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filtered.map((u) => {
                const isExpanded = expandedUnitId === u.id;
                const imgs = unitImages[u.id] ?? [];
                return (
                  <React.Fragment key={u.id}>
                    <tr
                      className="hover:bg-slate-50 transition-colors group cursor-pointer"
                      onClick={() => toggleUnitExpand(u)}
                    >
                      <td className="px-5 py-3 font-semibold text-slate-900">
                        <div className="flex items-center gap-1.5">
                          <svg className={`w-3 h-3 text-slate-400 transition-transform shrink-0 ${isExpanded ? "rotate-90" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                          {u.number}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-slate-600 text-xs">{u.property}</td>
                      <td className="px-3 py-3 text-slate-500 text-xs">{u.layout}</td>
                      <td className="px-3 py-3 font-medium text-slate-900 text-xs">${u.rent.toLocaleString()}</td>
                      <td className="px-3 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${STATUS_STYLES[u.status] ?? ""}`}>
                          {u.status}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        {u.tenants.length > 0 ? (
                          <button
                            onClick={() => setModal({ type: "tenantDetail", unit: u })}
                            className="flex flex-col gap-1 text-left group"
                          >
                            {u.tenants.map((t, i) => {
                              const initials = (t.tenant_name ?? "?").split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
                              return (
                                <div key={t.tenant_user_id} className="flex items-center gap-1.5">
                                  {t.tenant_avatar_url ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img src={t.tenant_avatar_url} alt={t.tenant_name ?? ""} className="w-6 h-6 rounded-full object-cover border border-slate-200 shrink-0" />
                                  ) : (
                                    <div className="w-6 h-6 rounded-full bg-black text-white text-[9px] font-bold flex items-center justify-center shrink-0">
                                      {initials}
                                    </div>
                                  )}
                                  <span className="text-xs text-blue-600 font-medium group-hover:underline">{t.tenant_name}</span>
                                </div>
                              );
                            })}
                          </button>
                        ) : u.tenant ? (
                          <button
                            onClick={() => setModal({ type: "tenantDetail", unit: u })}
                            className="flex items-center gap-1.5 hover:underline text-left"
                          >
                            {u.tenantAvatarUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={u.tenantAvatarUrl} alt={u.tenant} className="w-6 h-6 rounded-full object-cover border border-slate-200 shrink-0" />
                            ) : (
                              <div className="w-6 h-6 rounded-full bg-black text-white text-[9px] font-bold flex items-center justify-center shrink-0">
                                {u.tenant.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase()}
                              </div>
                            )}
                            <span className="text-xs text-blue-600 font-medium">{u.tenant}</span>
                          </button>
                        ) : (
                          <span className="text-xs text-slate-300">—</span>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        {u.leaseStart && u.leaseEnd ? (() => {
                          const days = Math.round((new Date(u.leaseEnd).getTime() - Date.now()) / 86400000);
                          return (
                            <div>
                              <p className="text-[11px] text-slate-500">{u.leaseStart} →</p>
                              <p className={`text-[11px] font-medium ${days < 60 ? "text-red-500" : days < 90 ? "text-amber-500" : "text-slate-500"}`}>{u.leaseEnd}</p>
                            </div>
                          );
                        })() : <span className="text-slate-300 text-xs">—</span>}
                      </td>
                      <td className="px-3 py-3">
                        {u.outstandingBalance > 0 ? (
                          <span className="text-xs font-semibold text-red-600">${u.outstandingBalance.toLocaleString()}</span>
                        ) : (
                          <span className="text-xs text-slate-300">—</span>
                        )}
                      </td>
                      <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity justify-end">
                          {/* View payments */}
                          <button
                            onClick={() => router.push("/payments")}
                            className="p-1 text-slate-400 hover:text-slate-700 rounded"
                            title="View payments"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                            </svg>
                          </button>
                          {/* Add lease (only when vacant) */}
                          {!u.leaseId && (
                            <button
                              onClick={() => router.push("/tenants")}
                              className="p-1 text-emerald-500 hover:text-emerald-700 rounded"
                              title="Add tenant / lease"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                              </svg>
                            </button>
                          )}
                          {/* End lease (only when occupied) */}
                          {u.leaseId && (
                            <button
                              onClick={() => setModal({ type: "endLease", unit: u })}
                              className="p-1 text-amber-500 hover:text-amber-700 rounded"
                              title="End lease"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                              </svg>
                            </button>
                          )}
                          {/* Edit unit */}
                          <button
                            onClick={() => setModal({ type: "editUnit", unit: u, propertyName: u.property })}
                            className="p-1 text-slate-400 hover:text-slate-700 rounded"
                            title="Edit unit"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </button>
                          {/* Delete unit */}
                          <button
                            onClick={() => setModal({ type: "deleteUnit", unit: u })}
                            className="p-1 text-red-400 hover:text-red-600 rounded"
                            title="Delete unit"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr className="bg-slate-50 border-b border-slate-100">
                        <td colSpan={9} className="px-5 py-4">
                          <div className="flex items-center justify-between mb-3">
                            <p className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
                              Photos · Unit {u.number}
                            </p>
                            <button
                              onClick={(e) => { e.stopPropagation(); openUnitGallery(u); }}
                              className="text-xs text-slate-500 hover:text-black border border-slate-200 rounded-lg px-2.5 py-1 transition-colors flex items-center gap-1"
                            >
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                              </svg>
                              Manage photos
                            </button>
                          </div>
                          {imgs.length === 0 ? (
                            <p className="text-xs text-slate-400 italic">No photos yet — click "Manage photos" to add some.</p>
                          ) : (
                            <div className="flex gap-2 overflow-x-auto pb-1">
                              {imgs.map(img => (
                                <div key={img.id} className="shrink-0 w-28 h-20 rounded-lg overflow-hidden bg-slate-200">
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img src={img.url} alt={img.original_name} className="w-full h-full object-cover" />
                                </div>
                              ))}
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="px-5 py-3 border-t border-slate-100 flex items-center justify-between">
          <p className="text-xs text-slate-400">{filtered.length} units</p>
          <div className="flex gap-4 text-xs text-slate-500">
            <span><span className="font-semibold text-slate-900">{units.filter(u => u.status === "Occupied").length}</span> occupied</span>
            <span><span className="font-semibold text-amber-600">{units.filter(u => u.status === "Vacant").length}</span> vacant</span>
            <span><span className="font-semibold text-red-600">{units.filter(u => u.status === "Maintenance").length}</span> maintenance</span>
          </div>
        </div>
      </div>
    </div>
  );
}
