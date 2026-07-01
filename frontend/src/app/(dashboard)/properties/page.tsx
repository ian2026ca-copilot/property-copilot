"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { propertiesApi, tenantsApi, imagesApi, type PropertyOut, type UnitOut, type ImageOut } from "@/lib/api";
import { MOCK_MODE } from "@/lib/useApiData";

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
}

const MOCK_UNITS: UnitRow[] = [
  { id: "u1", property_id: "1", number: "101", property: "Sunset Towers", layout: "2 bed / 1 bath", sqft: 850, rent: 2400, status: "Occupied", tenant: "Emma Jones", tenantUserId: null, tenantAvatarUrl: null, leaseId: "l1", leaseStart: "2026-02-01", leaseEnd: "2027-01-31", outstandingBalance: 0 },
  { id: "u2", property_id: "1", number: "102", property: "Sunset Towers", layout: "1 bed / 1 bath", sqft: 620, rent: 1950, status: "Maintenance", tenant: null, tenantUserId: null, tenantAvatarUrl: null, leaseId: null, leaseStart: null, leaseEnd: null, outstandingBalance: 0 },
  { id: "u3", property_id: "1", number: "103", property: "Sunset Towers", layout: "2 bed / 2 bath", sqft: 1020, rent: 2750, status: "Occupied", tenant: "Marcus Lee", tenantUserId: null, tenantAvatarUrl: null, leaseId: "l2", leaseStart: "2025-09-01", leaseEnd: "2026-08-31", outstandingBalance: 2750 },
  { id: "u4", property_id: "1", number: "201", property: "Sunset Towers", layout: "Studio", sqft: 420, rent: 1600, status: "Vacant", tenant: null, tenantUserId: null, tenantAvatarUrl: null, leaseId: null, leaseStart: null, leaseEnd: null, outstandingBalance: 0 },
  { id: "u5", property_id: "2", number: "A1", property: "Cedar Row", layout: "3 bed / 2 bath", sqft: 1280, rent: 3100, status: "Occupied", tenant: "Sarah Kim", tenantUserId: null, tenantAvatarUrl: null, leaseId: "l3", leaseStart: "2025-06-01", leaseEnd: "2026-05-31", outstandingBalance: 6200 },
  { id: "u6", property_id: "2", number: "A2", property: "Cedar Row", layout: "2 bed / 1 bath", sqft: 900, rent: 2200, status: "Occupied", tenant: "David Chen", tenantUserId: null, tenantAvatarUrl: null, leaseId: "l4", leaseStart: "2025-11-01", leaseEnd: "2026-08-15", outstandingBalance: 0 },
  { id: "u7", property_id: "3", number: "B1", property: "Northside Commons", layout: "1 bed / 1 bath", sqft: 580, rent: 1800, status: "Vacant", tenant: null, tenantUserId: null, tenantAvatarUrl: null, leaseId: null, leaseStart: null, leaseEnd: null, outstandingBalance: 0 },
  { id: "u8", property_id: "3", number: "B2", property: "Northside Commons", layout: "2 bed / 2 bath", sqft: 960, rent: 2500, status: "Occupied", tenant: "Priya Nair", tenantUserId: null, tenantAvatarUrl: null, leaseId: "l5", leaseStart: "2026-01-01", leaseEnd: "2026-12-31", outstandingBalance: 0 },
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

const BLANK_PROP: PropertyForm = { name: "", address: "", city: "", state: "", zip_code: "", property_type: "RESIDENTIAL", year_built: "" };

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
                <option value="RESIDENTIAL">Residential</option>
                <option value="COMMERCIAL">Commercial</option>
                <option value="MIXED_USE">Mixed-use</option>
                <option value="INDUSTRIAL">Industrial</option>
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
}

const BLANK_UNIT: UnitForm = { unit_number: "", bedrooms: "1", bathrooms: "1", square_feet: "", monthly_rent: "", status: "VACANT" };

function unitRowToForm(u: UnitRow): UnitForm {
  const statusBack: Record<string, string> = { Occupied: "OCCUPIED", Vacant: "VACANT", Maintenance: "MAINTENANCE", Reserved: "RESERVED", Notice: "NOTICE", Renovation: "RENOVATION" };
  const beds = u.layout.match(/(\d+) bed/)?.[1] ?? "1";
  const baths = u.layout.match(/([\d.]+) bath/)?.[1] ?? "1";
  return { unit_number: u.number, bedrooms: beds, bathrooms: baths, square_feet: u.sqft ? u.sqft.toString() : "", monthly_rent: u.rent.toString(), status: statusBack[u.status] ?? "VACANT" };
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
  const set = (f: keyof UnitForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((v) => ({ ...v, [f]: e.target.value }));

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
      }
      onSave(fromApiUnit(saved, propertyName));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
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
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Monthly rent *</label>
            <input type="number" min="0" value={form.monthly_rent} onChange={set("monthly_rent")} placeholder="2400" className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-black" />
          </div>
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

// ─── Page ─────────────────────────────────────────────────────────────────────

type ModalState =
  | { type: "none" }
  | { type: "addProperty" }
  | { type: "editProperty"; property: PropertyOut }
  | { type: "deleteProperty"; property: PropertyOut }
  | { type: "addUnit"; propertyId: string; propertyName: string }
  | { type: "editUnit"; unit: UnitRow; propertyName: string }
  | { type: "deleteUnit"; unit: UnitRow }
  | { type: "endLease"; unit: UnitRow }
  | { type: "propertyImages"; property: PropertyOut }
  | { type: "unitImages"; unit: UnitRow };

export default function PropertiesPage() {
  const router = useRouter();
  const [filter, setFilter] = useState("all");
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

  const filtered = filter === "all" ? units : units.filter((u) => u.status === filter);

  return (
    <div className="max-w-[1280px] mx-auto px-6 py-6 space-y-6">
      {/* Hidden logo file input */}
      <input ref={logoFileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleLogoFileChange} />

      {/* Modals */}
      {(modal.type === "addProperty") && (
        <PropertyModal initial={null} onClose={() => setModal({ type: "none" })} onSave={handlePropertySaved} />
      )}
      {(modal.type === "editProperty") && (
        <PropertyModal initial={modal.property} onClose={() => setModal({ type: "none" })} onSave={handlePropertySaved} />
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

      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <p className="text-[11px] uppercase tracking-widest text-slate-400 font-medium">Assets</p>
          <h1 className="text-xl font-bold text-slate-900 mt-0.5">Properties and units</h1>
        </div>
        <button
          onClick={() => setModal({ type: "addProperty" })}
          className="px-3 py-1.5 bg-black text-white text-xs font-medium rounded-lg hover:bg-slate-800 transition-colors"
        >
          + Add property
        </button>
      </div>

      {/* Property cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {properties.map((p) => (
          <div key={p.id} className="bg-white rounded-xl border border-slate-200 overflow-hidden hover:shadow-md transition-shadow group">
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
          <h3 className="text-sm font-semibold text-slate-900">Unit inventory</h3>
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
                        {u.tenant ? (
                          <div className="flex items-center gap-1.5">
                            {u.tenantAvatarUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={u.tenantAvatarUrl} alt={u.tenant} className="w-6 h-6 rounded-full object-cover border border-slate-200 shrink-0" />
                            ) : (
                              <div className="w-6 h-6 rounded-full bg-black text-white text-[9px] font-bold flex items-center justify-center shrink-0">
                                {u.tenant.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase()}
                              </div>
                            )}
                            <span className="text-xs text-slate-700 font-medium">{u.tenant}</span>
                          </div>
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
