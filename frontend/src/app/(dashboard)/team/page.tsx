"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { can } from "@/lib/roles";
import { teamApi, vendorsApi, type TeamMemberOut, type VendorOut } from "@/lib/api";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ROLE_LABELS: Record<string, string> = { OWNER: "Property Owner", TENANT: "Tenant", VENDOR: "Vendor / Contractor" };
const ROLE_STYLES: Record<string, string> = { OWNER: "bg-violet-100 text-violet-700", TENANT: "bg-slate-100 text-slate-600", VENDOR: "bg-orange-100 text-orange-700" };

function initials(name: string) {
  return name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
}

const VENDOR_CATEGORIES = ["Plumbing", "Electrical", "HVAC", "Appliance", "Structural", "Painting", "Pest Control", "Cleaning", "Landscaping", "Other"];

const VENDOR_COUNTRIES = ["Canada", "USA"] as const;
type VendorCountry = typeof VENDOR_COUNTRIES[number];
const VENDOR_PROVINCES: Record<VendorCountry, string[]> = {
  Canada: ["AB","BC","MB","NB","NL","NS","NT","NU","ON","PE","QC","SK","YT"],
  USA: ["AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY"],
};

// ─── Confirm dialog ───────────────────────────────────────────────────────────

function ConfirmDialog({ message, onConfirm, onCancel }: { message: string; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
        <p className="text-sm text-slate-700 mb-6">{message}</p>
        <div className="flex gap-3">
          <button onClick={onCancel} className="flex-1 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">Cancel</button>
          <button onClick={onConfirm} className="flex-1 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium">Remove</button>
        </div>
      </div>
    </div>
  );
}

// ─── Edit member modal ────────────────────────────────────────────────────────

function EditMemberModal({ member, onClose, onSave }: { member: TeamMemberOut; onClose: () => void; onSave: (m: TeamMemberOut) => void }) {
  const isVendor = member.role === "VENDOR";
  const [form, setForm] = useState({
    full_name: member.full_name, phone: member.phone, business_name: member.business_name ?? "",
    street_address: member.street_address ?? "", city: member.city ?? "", postal_code: member.postal_code ?? "",
    country: member.country ?? "", province: member.province ?? "",
  });
  const [cats, setCats] = useState<string[]>(member.service_categories ?? []);
  const [isPublic, setIsPublic] = useState(member.is_public ?? false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  function set(k: string, v: string) { setForm(f => ({ ...f, [k]: v, ...(k === "country" ? { province: "" } : {}) })); }
  function toggleCat(c: string) { setCats(cs => cs.includes(c) ? cs.filter(x => x !== c) : [...cs, c]); }
  const provinceList = form.country ? VENDOR_PROVINCES[form.country as VendorCountry] ?? [] : [];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.full_name.trim()) { setError("Name is required."); return; }
    setSaving(true); setError("");
    try {
      const updated = await teamApi.update(member.member_id, {
        full_name: form.full_name.trim(),
        phone: form.phone.trim(),
        ...(isVendor ? {
          business_name: form.business_name,
          street_address: form.street_address,
          city: form.city,
          postal_code: form.postal_code,
          country: form.country,
          province: form.province,
          service_categories: cats,
          is_public: isPublic,
        } : {}),
      });
      onSave(updated);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save changes");
    } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="text-sm font-semibold text-slate-900">Edit team member</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-lg leading-none">✕</button>
        </div>
        <form onSubmit={submit} className="px-6 py-5 space-y-4">
          {error && <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Full name *</label>
            <input value={form.full_name} onChange={e => set("full_name", e.target.value)} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-black" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Email</label>
            <p className="text-sm text-slate-500 border border-slate-100 bg-slate-50 rounded-lg px-3 py-2">{member.email}</p>
            <p className="text-[11px] text-slate-400 mt-1">Email cannot be changed</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Phone</label>
            <input value={form.phone} onChange={e => set("phone", e.target.value)} placeholder="+15550001234" className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-black" />
          </div>
          {isVendor && (
            <>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Business name</label>
                <input value={form.business_name} onChange={e => set("business_name", e.target.value)} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-black" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-2">Address (optional)</label>
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <input value={form.street_address} onChange={e => set("street_address", e.target.value)} placeholder="Street address" className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-black" />
                  </div>
                  <input value={form.city} onChange={e => set("city", e.target.value)} placeholder="City" className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-black" />
                  <input value={form.postal_code} onChange={e => set("postal_code", e.target.value)} placeholder="Postal / ZIP code" className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-black" />
                  <select value={form.country} onChange={e => set("country", e.target.value)} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-black bg-white">
                    <option value="">— select country —</option>
                    {VENDOR_COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <select value={form.province} onChange={e => set("province", e.target.value)} disabled={!form.country}
                    className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-black bg-white disabled:opacity-50">
                    <option value="">— select province/state —</option>
                    {provinceList.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-2">Service categories</label>
                <div className="flex flex-wrap gap-1.5">
                  {VENDOR_CATEGORIES.map(c => (
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
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    {isPublic
                      ? "Public — other organizations can also add and share this vendor."
                      : "Private (default) — this vendor works exclusively for your organization."}
                  </p>
                </div>
              </label>
            </>
          )}
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

// ─── Create vendor modal ──────────────────────────────────────────────────────

function CreateVendorModal({ onClose, onSave }: { onClose: () => void; onSave: (v: VendorOut) => void }) {
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
  const provinceList = form.country ? VENDOR_PROVINCES[form.country as VendorCountry] ?? [] : [];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.full_name || !form.email) { setError("Name and email are required."); return; }
    setSaving(true); setError("");
    try {
      const v = await vendorsApi.create({ ...form, service_categories: cats, is_public: isPublic });
      onSave(v);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create vendor");
    } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="text-sm font-semibold text-slate-900">Create vendor</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-lg leading-none">✕</button>
        </div>
        <form onSubmit={submit} className="px-6 py-5 space-y-4">
          {error && <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Full name *</label>
            <input value={form.full_name} onChange={e => set("full_name", e.target.value)} placeholder="Taylor Brooks" className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-black" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Email *</label>
            <input type="email" value={form.email} onChange={e => set("email", e.target.value)} placeholder="taylor@company.com" className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-black" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Phone</label>
            <input value={form.phone} onChange={e => set("phone", e.target.value)} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-black" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Business name</label>
            <input value={form.business_name} onChange={e => set("business_name", e.target.value)} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-black" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-2">Address (optional)</label>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <input value={form.street_address} onChange={e => set("street_address", e.target.value)} placeholder="Street address" className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-black" />
              </div>
              <input value={form.city} onChange={e => set("city", e.target.value)} placeholder="City" className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-black" />
              <input value={form.postal_code} onChange={e => set("postal_code", e.target.value)} placeholder="Postal / ZIP code" className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-black" />
              <select value={form.country} onChange={e => set("country", e.target.value)} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-black bg-white">
                <option value="">— select country —</option>
                {VENDOR_COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <select value={form.province} onChange={e => set("province", e.target.value)} disabled={!form.country}
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-black bg-white disabled:opacity-50">
                <option value="">— select province/state —</option>
                {provinceList.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-2">Service categories</label>
            <div className="flex flex-wrap gap-1.5">
              {VENDOR_CATEGORIES.map(c => (
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
              <p className="text-[11px] text-slate-500 mt-0.5">
                {isPublic
                  ? "Public — other organizations can also add and share this vendor."
                  : "Private (default) — this vendor works exclusively for your organization."}
              </p>
            </div>
          </label>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50">Cancel</button>
            <button type="submit" disabled={saving} className="flex-1 px-4 py-2 bg-black text-white rounded-lg text-sm font-medium hover:bg-slate-800 disabled:opacity-50">
              {saving ? "Creating…" : "Create vendor"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type Modal =
  | { type: "none" }
  | { type: "createVendor" }
  | { type: "edit"; member: TeamMemberOut }
  | { type: "remove"; member: TeamMemberOut };

type VisibilityFilter = "ALL" | "PUBLIC" | "PRIVATE";

export default function TeamPage() {
  const { user } = useAuth();
  const perms = can(user?.role);
  const [team, setTeam] = useState<TeamMemberOut[]>([]);
  const [modal, setModal] = useState<Modal>({ type: "none" });
  const [visibility, setVisibility] = useState<VisibilityFilter>("ALL");

  useEffect(() => {
    teamApi.list().then(setTeam).catch(() => {});
  }, []);

  function handleVendorCreated(_v: VendorOut) {
    setModal({ type: "none" });
    teamApi.list().then(setTeam).catch(() => {});
  }

  async function handleRemove(m: TeamMemberOut) {
    try { await teamApi.remove(m.member_id); } catch { return; }
    setTeam(prev => prev.filter(x => x.member_id !== m.member_id));
    setModal({ type: "none" });
  }

  function handleEdited(updated: TeamMemberOut) {
    setTeam(prev => prev.map(x => x.member_id === updated.member_id ? updated : x));
    setModal({ type: "none" });
  }

  const filteredTeam = team
    .filter(m => {
      if (visibility === "ALL") return true;
      if (m.role !== "VENDOR") return false;
      return visibility === "PUBLIC" ? m.is_public === true : m.is_public === false;
    })
    .sort((a, b) => a.full_name.localeCompare(b.full_name));

  return (
    <div className="max-w-[960px] mx-auto px-6 py-6 space-y-6">
      {modal.type === "createVendor" && (
        <CreateVendorModal onClose={() => setModal({ type: "none" })} onSave={handleVendorCreated} />
      )}
      {modal.type === "edit" && (
        <EditMemberModal member={modal.member} onClose={() => setModal({ type: "none" })} onSave={handleEdited} />
      )}
      {modal.type === "remove" && (
        <ConfirmDialog
          message={`Remove ${modal.member.full_name} from the team? They will lose all access.`}
          onConfirm={() => handleRemove(modal.member)}
          onCancel={() => setModal({ type: "none" })}
        />
      )}

      <div className="flex items-end justify-between">
        <div>
          <p className="text-[11px] uppercase tracking-widest text-slate-400 font-medium">Operations</p>
          <h1 className="text-xl font-bold text-slate-900 mt-0.5">Team</h1>
        </div>
        {perms.inviteStaff && (
          <button
            onClick={() => setModal({ type: "createVendor" })}
            className="px-3 py-1.5 bg-black text-white text-xs font-medium rounded-lg hover:bg-slate-800 transition-colors"
          >
            + Create vendor
          </button>
        )}
      </div>

      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">{filteredTeam.length} member{filteredTeam.length !== 1 ? "s" : ""}</p>
        <div className="flex items-center gap-2">
          {(["ALL", "PUBLIC", "PRIVATE"] as const).map(v => (
            <button
              key={v}
              onClick={() => setVisibility(v)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${visibility === v ? "bg-black text-white" : "bg-white border border-slate-200 text-slate-600 hover:border-slate-300"}`}
            >
              {v === "ALL" ? "All" : v === "PUBLIC" ? "Public" : "Private"}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
        {filteredTeam.map((m) => {
          const isCurrentUser = m.user_id === user?.id;
          return (
            <div key={m.member_id} className="flex items-center gap-4 px-5 py-4">
              <div className="w-9 h-9 rounded-full bg-black text-white text-xs font-bold flex items-center justify-center shrink-0">
                {initials(m.full_name)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-slate-900">{m.full_name}</p>
                  {isCurrentUser && <span className="text-[10px] text-slate-400 font-medium">(you)</span>}
                </div>
                <p className="text-xs text-slate-500">{m.email}</p>
                {m.phone && <p className="text-xs text-slate-400">{m.phone}</p>}
              </div>
              <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full ${ROLE_STYLES[m.role]}`}>
                {ROLE_LABELS[m.role]}
              </span>
              {m.role === "VENDOR" && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded ${m.is_public ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                  {m.is_public ? "Public" : "Private"}
                </span>
              )}
              {perms.inviteStaff && (
                <button
                  onClick={() => setModal({ type: "edit", member: m })}
                  className="px-2.5 py-1 text-xs font-medium border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-600 transition-colors"
                >
                  Edit
                </button>
              )}
              {perms.removeMembers && !isCurrentUser && (
                <button
                  onClick={() => setModal({ type: "remove", member: m })}
                  className="p-1.5 text-red-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors"
                  title="Remove member"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              )}
            </div>
          );
        })}
        {filteredTeam.length === 0 && (
          <p className="text-sm text-slate-400 px-5 py-8 text-center">
            {team.length === 0 ? "No team members yet." : "No members match this filter."}
          </p>
        )}
      </div>
    </div>
  );
}
