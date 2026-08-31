"use client";

import React, { useState, useEffect, useCallback } from "react";
import { vendorsApi, type VendorOut, type VendorAvailabilityOut } from "@/lib/api";

const CATEGORIES = ["Plumbing","Electrical","HVAC","Appliance","Structural","Painting","Pest Control","Cleaning","Landscaping","Other"];

const COUNTRIES = ["Canada", "USA"] as const;
type Country = typeof COUNTRIES[number];
const PROVINCES: Record<Country, string[]> = {
  Canada: ["AB","BC","MB","NB","NL","NS","NT","NU","ON","PE","QC","SK","YT"],
  USA: ["AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY"],
};

const inp = "w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black";

function fmtDate(s: string) {
  return new Date(s + "T00:00:00").toLocaleDateString("en-CA", { weekday: "short", month: "short", day: "numeric" });
}

// ─── Invite Modal ─────────────────────────────────────────────────────────────

function InviteModal({ onClose, onSave }: { onClose: () => void; onSave: (v: VendorOut) => void }) {
  const [form, setForm] = useState({
    full_name: "", email: "", phone: "", business_name: "",
    street_address: "", city: "", postal_code: "", country: "", province: "",
  });
  const [cats, setCats] = useState<string[]>([]);
  const [isPublic, setIsPublic] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  function set(k: string, v: string) { setForm(f => ({ ...f, [k]: v, ...(k === "country" ? { province: "" } : {}) })); }
  function toggleCat(c: string) { setCats(cs => cs.includes(c) ? cs.filter(x => x !== c) : [...cs, c]); }
  const provinceList = form.country ? PROVINCES[form.country as Country] ?? [] : [];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.full_name || !form.email) { setError("Name and email required."); return; }
    setSaving(true);
    try {
      const v = await vendorsApi.create({ ...form, service_categories: cats, is_public: isPublic });
      onSave(v);
    } catch (err: any) { setError(err.message ?? "Failed"); } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="text-base font-semibold">Invite vendor</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl">×</button>
        </div>
        <form onSubmit={submit} className="px-6 py-5 space-y-4">
          {error && <p className="text-red-600 text-sm bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="block text-xs font-medium text-slate-500 mb-1">Full name *</label>
              <input value={form.full_name} onChange={e => set("full_name", e.target.value)} className={inp} />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Email *</label>
              <input type="email" value={form.email} onChange={e => set("email", e.target.value)} className={inp} />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Phone</label>
              <input value={form.phone} onChange={e => set("phone", e.target.value)} className={inp} />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-slate-500 mb-1">Business name</label>
              <input value={form.business_name} onChange={e => set("business_name", e.target.value)} className={inp} />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-2">Address (optional)</label>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <input value={form.street_address} onChange={e => set("street_address", e.target.value)} placeholder="Street address" className={inp} />
              </div>
              <input value={form.city} onChange={e => set("city", e.target.value)} placeholder="City" className={inp} />
              <input value={form.postal_code} onChange={e => set("postal_code", e.target.value)} placeholder="Postal / ZIP code" className={inp} />
              <div>
                <select value={form.country} onChange={e => set("country", e.target.value)} className={inp}>
                  <option value="">— select country —</option>
                  {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <select value={form.province} onChange={e => set("province", e.target.value)} disabled={!form.country} className={`${inp} disabled:opacity-50`}>
                  <option value="">— select province/state —</option>
                  {provinceList.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-2">Service categories</label>
            <div className="flex flex-wrap gap-1.5">
              {CATEGORIES.map(c => (
                <button key={c} type="button" onClick={() => toggleCat(c)}
                  className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${cats.includes(c) ? "bg-black text-white border-black" : "border-slate-200 text-slate-600 hover:border-slate-400"}`}>
                  {c}
                </button>
              ))}
            </div>
          </div>
          <label className="flex items-start gap-2.5 p-3 rounded-xl border border-slate-200 cursor-pointer hover:bg-slate-50">
            <input type="checkbox" className="mt-0.5" checked={isPublic} onChange={e => setIsPublic(e.target.checked)} />
            <div>
              <p className="text-sm font-medium text-slate-900">Make this vendor public</p>
              <p className="text-[13px] text-slate-500 mt-0.5">
                {isPublic
                  ? "Public — other organizations can also add and share this vendor."
                  : "Private (default) — this vendor works exclusively for your organization."}
              </p>
            </div>
          </label>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50">Cancel</button>
            <button type="submit" disabled={saving} className="flex-1 px-4 py-2 bg-black text-white rounded-lg text-sm font-medium hover:bg-slate-800 disabled:opacity-50">
              {saving ? "Inviting…" : "Send invite"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Availability Panel ───────────────────────────────────────────────────────

function AvailabilityPanel({ vendor, onClose }: { vendor: VendorOut; onClose: () => void }) {
  const [slots, setSlots] = useState<VendorAvailabilityOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ date: "", start_time: "", end_time: "" });
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try { setSlots(await vendorsApi.listAvailability(vendor.id)); } finally { setLoading(false); }
  }, [vendor.id]);

  useEffect(() => { load(); }, [load]);

  async function addSlot(e: React.FormEvent) {
    e.preventDefault();
    if (!form.date || !form.start_time || !form.end_time) { setError("All fields required."); return; }
    setAdding(true);
    try {
      await vendorsApi.addAvailability(vendor.id, form);
      setForm({ date: "", start_time: "", end_time: "" });
      setError("");
      await load();
    } catch (err: any) { setError(err.message ?? "Failed"); } finally { setAdding(false); }
  }

  async function removeSlot(slotId: string) {
    await vendorsApi.deleteAvailability(vendor.id, slotId);
    setSlots(ss => ss.filter(s => s.id !== slotId));
  }

  const byDate: Record<string, VendorAvailabilityOut[]> = {};
  slots.forEach(s => { (byDate[s.date] = byDate[s.date] ?? []).push(s); });

  return (
    <div className="fixed inset-0 z-40" onClick={onClose}>
      <div className="absolute inset-y-0 right-0 w-full max-w-md bg-white shadow-2xl flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
          <div>
            <h2 className="text-base font-semibold">{vendor.business_name || vendor.full_name}</h2>
            <p className="text-xs text-slate-400">Availability slots</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl">×</button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* Add slot form */}
          <form onSubmit={addSlot} className="bg-slate-50 rounded-xl p-4 space-y-3">
            <p className="text-xs font-medium text-slate-600">Add availability slot</p>
            {error && <p className="text-red-600 text-xs">{error}</p>}
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-3">
                <label className="block text-[13px] text-slate-400 mb-1">Date</label>
                <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} className={inp} />
              </div>
              <div className="col-span-1">
                <label className="block text-[13px] text-slate-400 mb-1">Start</label>
                <input type="time" value={form.start_time} onChange={e => setForm(f => ({ ...f, start_time: e.target.value }))} className={inp} />
              </div>
              <div className="col-span-1">
                <label className="block text-[13px] text-slate-400 mb-1">End</label>
                <input type="time" value={form.end_time} onChange={e => setForm(f => ({ ...f, end_time: e.target.value }))} className={inp} />
              </div>
              <div className="col-span-1 flex items-end">
                <button type="submit" disabled={adding} className="w-full px-3 py-2 bg-black text-white text-xs font-medium rounded-lg hover:bg-slate-800 disabled:opacity-50">
                  {adding ? "…" : "Add"}
                </button>
              </div>
            </div>
          </form>

          {/* Slots list */}
          {loading ? <p className="text-sm text-slate-400 text-center py-6">Loading…</p>
            : Object.keys(byDate).length === 0
              ? <p className="text-sm text-slate-400 italic text-center py-6">No slots added yet.</p>
              : <div className="space-y-4">
                {Object.entries(byDate).sort(([a], [b]) => a.localeCompare(b)).map(([date, daySlots]) => (
                  <div key={date}>
                    <p className="text-xs font-medium text-slate-500 mb-2">{fmtDate(date)}</p>
                    <div className="space-y-1.5">
                      {daySlots.map(slot => (
                        <div key={slot.id} className="flex items-center justify-between bg-slate-50 rounded-lg px-3 py-2">
                          <span className="text-sm text-slate-700">{slot.start_time.slice(0, 5)} – {slot.end_time.slice(0, 5)}</span>
                          <button onClick={() => removeSlot(slot.id)} className="text-xs text-slate-400 hover:text-red-500">Remove</button>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
          }
        </div>
      </div>
    </div>
  );
}

// ─── Edit Vendor Modal ────────────────────────────────────────────────────────

function EditVendorModal({ vendor, onClose, onSave }: { vendor: VendorOut; onClose: () => void; onSave: (v: VendorOut) => void }) {
  const [form, setForm] = useState({
    business_name: vendor.business_name, phone: vendor.phone,
    street_address: vendor.street_address ?? "", city: vendor.city ?? "",
    postal_code: vendor.postal_code ?? "", country: vendor.country ?? "", province: vendor.province ?? "",
  });
  const [cats, setCats] = useState<string[]>(vendor.service_categories);
  const [isPublic, setIsPublic] = useState(vendor.is_public);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  function set(k: string, v: string) { setForm(f => ({ ...f, [k]: v, ...(k === "country" ? { province: "" } : {}) })); }
  function toggleCat(c: string) { setCats(cs => cs.includes(c) ? cs.filter(x => x !== c) : [...cs, c]); }
  const provinceList = form.country ? PROVINCES[form.country as Country] ?? [] : [];

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setSaving(true);
    try {
      const v = await vendorsApi.update(vendor.id, { ...form, service_categories: cats, is_public: isPublic });
      onSave(v);
    } catch (err: any) { setError(err.message ?? "Failed"); } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="text-base font-semibold">Edit vendor</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl">×</button>
        </div>
        <form onSubmit={submit} className="px-6 py-5 space-y-4">
          {error && <p className="text-red-600 text-sm bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
          <div><label className="block text-xs font-medium text-slate-500 mb-1">Business name</label>
            <input value={form.business_name} onChange={e => setForm(f => ({ ...f, business_name: e.target.value }))} className={inp} />
          </div>
          <div><label className="block text-xs font-medium text-slate-500 mb-1">Phone</label>
            <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} className={inp} />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-2">Address</label>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <input value={form.street_address} onChange={e => set("street_address", e.target.value)} placeholder="Street address" className={inp} />
              </div>
              <input value={form.city} onChange={e => set("city", e.target.value)} placeholder="City" className={inp} />
              <input value={form.postal_code} onChange={e => set("postal_code", e.target.value)} placeholder="Postal / ZIP code" className={inp} />
              <div>
                <select value={form.country} onChange={e => set("country", e.target.value)} className={inp}>
                  <option value="">— select country —</option>
                  {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <select value={form.province} onChange={e => set("province", e.target.value)} disabled={!form.country} className={`${inp} disabled:opacity-50`}>
                  <option value="">— select province/state —</option>
                  {provinceList.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-2">Service categories</label>
            <div className="flex flex-wrap gap-1.5">
              {CATEGORIES.map(c => (
                <button key={c} type="button" onClick={() => toggleCat(c)}
                  className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${cats.includes(c) ? "bg-black text-white border-black" : "border-slate-200 text-slate-600 hover:border-slate-400"}`}>
                  {c}
                </button>
              ))}
            </div>
          </div>
          <label className="flex items-start gap-2.5 p-3 rounded-xl border border-slate-200 cursor-pointer hover:bg-slate-50">
            <input type="checkbox" className="mt-0.5" checked={isPublic} onChange={e => setIsPublic(e.target.checked)} />
            <div>
              <p className="text-sm font-medium text-slate-900">Make this vendor public</p>
              <p className="text-[13px] text-slate-500 mt-0.5">
                {isPublic
                  ? "Public — other organizations can also add and share this vendor."
                  : "Private — this vendor works exclusively for your organization."}
              </p>
            </div>
          </label>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50">Cancel</button>
            <button type="submit" disabled={saving} className="flex-1 px-4 py-2 bg-black text-white rounded-lg text-sm font-medium hover:bg-slate-800 disabled:opacity-50">
              {saving ? "Saving…" : "Save changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function VendorsPage() {
  const [vendors, setVendors] = useState<VendorOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);
  const [editing, setEditing] = useState<VendorOut | null>(null);
  const [avail, setAvail] = useState<VendorOut | null>(null);
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    try { setVendors(await vendorsApi.list()); } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function removeVendor(id: string) {
    if (!confirm("Remove this vendor from your organization?")) return;
    await vendorsApi.remove(id);
    setVendors(vs => vs.filter(v => v.id !== id));
  }

  const filtered = vendors.filter(v => {
    if (!search) return true;
    const q = search.toLowerCase();
    return v.full_name.toLowerCase().includes(q) || v.email.toLowerCase().includes(q) || v.business_name?.toLowerCase().includes(q) || v.service_categories.some(c => c.toLowerCase().includes(q));
  });

  return (
    <div className="max-w-[1280px] mx-auto px-6 py-6 space-y-5">
      <div className="flex items-end justify-between">
        <div>
          <p className="text-[13px] uppercase tracking-widest text-slate-400 font-medium">Operations</p>
          <h1 className="text-xl font-bold text-slate-900 mt-0.5">Vendors</h1>
        </div>
        <button onClick={() => setShowInvite(true)} className="px-4 py-2 bg-black text-white text-sm font-medium rounded-xl hover:bg-slate-800">+ Invite vendor</button>
      </div>

      <div className="flex items-center gap-3">
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search vendors…"
          className="border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black w-72" />
        <p className="text-sm text-slate-400">{vendors.length} vendor{vendors.length !== 1 ? "s" : ""}</p>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100">
              {["Vendor", "Email", "Phone", "Services", ""].map(h => (
                <th key={h} className="text-left text-[13px] font-medium text-slate-400 uppercase tracking-wider px-4 py-3">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {loading && <tr><td colSpan={5} className="px-4 py-8 text-center text-sm text-slate-400">Loading…</td></tr>}
            {!loading && filtered.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-12 text-center text-slate-400 text-sm">
                {search ? "No vendors match." : "No vendors yet. Invite one to get started."}
              </td></tr>
            )}
            {filtered.map(v => (
              <tr key={v.id} className="hover:bg-slate-50 transition-colors group">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-xs font-semibold text-slate-500 shrink-0">
                      {v.full_name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <p className="text-xs font-medium text-slate-900">{v.full_name}</p>
                        <span className={`text-[12px] px-1.5 py-0.5 rounded ${v.is_public ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                          {v.is_public ? "Public" : "Private"}
                        </span>
                      </div>
                      {v.business_name && <p className="text-[13px] text-slate-400">{v.business_name}</p>}
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-xs text-slate-600">{v.email}</td>
                <td className="px-4 py-3 text-xs text-slate-600">{v.phone || "—"}</td>
                <td className="px-4 py-3">
                  {v.service_categories.length === 0
                    ? <span className="text-xs text-slate-400 italic">None</span>
                    : <div className="flex flex-wrap gap-1">
                      {v.service_categories.slice(0, 3).map(c => (
                        <span key={c} className="px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded text-[12px]">{c}</span>
                      ))}
                      {v.service_categories.length > 3 && <span className="text-[12px] text-slate-400">+{v.service_categories.length - 3}</span>}
                    </div>}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => setAvail(v)} title="Manage availability"
                      className="p-1.5 rounded-lg hover:bg-blue-50 text-slate-500 hover:text-blue-600">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                    </button>
                    <button onClick={() => setEditing(v)} title="Edit"
                      className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-slate-700">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                    </button>
                    <button onClick={() => removeVendor(v.id)} title="Remove"
                      className="p-1.5 rounded-lg hover:bg-red-50 text-slate-500 hover:text-red-600">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showInvite && <InviteModal onClose={() => setShowInvite(false)} onSave={v => { setVendors(vs => [v, ...vs]); setShowInvite(false); }} />}
      {editing && <EditVendorModal vendor={editing} onClose={() => setEditing(null)} onSave={v => { setVendors(vs => vs.map(x => x.id === v.id ? v : x)); setEditing(null); }} />}
      {avail && <AvailabilityPanel vendor={avail} onClose={() => setAvail(null)} />}
    </div>
  );
}
