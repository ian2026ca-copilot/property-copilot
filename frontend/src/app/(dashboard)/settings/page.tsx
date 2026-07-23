"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { teamApi, profileApi, campaignsApi, vendorsApi, type TeamMemberOut, type MarketingSiteOut, type VendorOut } from "@/lib/api";
import { can, hasMinRole } from "@/lib/roles";
import { MOCK_MODE } from "@/lib/useApiData";

// ─── Mock data ────────────────────────────────────────────────────────────────

const MOCK_TEAM: TeamMemberOut[] = [
  { member_id: "m1", user_id: "u1", full_name: "Jordan Ellis", email: "jordan@propertyco.com", phone: "", role: "OWNER" },
  { member_id: "m2", user_id: "u2", full_name: "Alex Morgan", email: "alex@propertyco.com", phone: "", role: "OWNER" },
  { member_id: "m3", user_id: "u3", full_name: "Taylor Brooks", email: "taylor@propertyco.com", phone: "", role: "OWNER" },
  { member_id: "m4", user_id: "u4", full_name: "Casey Liu", email: "casey@propertyco.com", phone: "", role: "OWNER" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ROLE_LABELS: Record<string, string> = {
  OWNER:   "Property Owner",
  TENANT:  "Tenant",
  VENDOR:  "Vendor / Contractor",
};

const ROLE_STYLES: Record<string, string> = {
  OWNER:   "bg-violet-100 text-violet-700",
  TENANT:  "bg-slate-100 text-slate-600",
  VENDOR:  "bg-orange-100 text-orange-700",
};

const ROLE_DESCRIPTIONS: Record<string, string> = {
  OWNER:   "Full access — can delete properties, manage team roles, and all operations",
  TENANT:  "Portal access only — sees their own lease, payments, and maintenance requests",
  VENDOR:  "Assigned maintenance portal — receives jobs, updates status, uploads photos, and manages availability",
};

function initials(name: string) {
  return name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
}

// ─── Invite modal ─────────────────────────────────────────────────────────────

function InviteModal({ onClose, onSave }: { onClose: () => void; onSave: (m: TeamMemberOut) => void }) {
  const [form, setForm] = useState({ full_name: "", email: "", role: "OWNER" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const set = (f: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(v => ({ ...v, [f]: e.target.value }));

  async function handleSubmit() {
    if (!form.full_name || !form.email) { setError("Name and email are required."); return; }
    setSaving(true); setError("");
    try {
      const saved = await teamApi.invite(form as { full_name: string; email: string; role: string });
      onSave(saved);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Invite failed");
    } finally { setSaving(false); }
  }

  // Mock mode: fake the save
  async function handleMockSubmit() {
    if (!form.full_name || !form.email) { setError("Name and email are required."); return; }
    onSave({
      member_id: `mock-${Date.now()}`,
      user_id: `mock-u-${Date.now()}`,
      full_name: form.full_name,
      email: form.email,
      phone: "",
      role: form.role as TeamMemberOut["role"],
    });
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="text-sm font-semibold text-slate-900">Invite team member</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-lg leading-none">✕</button>
        </div>
        <div className="px-6 py-5 space-y-4">
          {error && <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Full name *</label>
            <input value={form.full_name} onChange={set("full_name")} placeholder="Taylor Brooks" className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-black" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Email *</label>
            <input type="email" value={form.email} onChange={set("email")} placeholder="taylor@company.com" className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-black" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Role</label>
            <select value={form.role} onChange={set("role")} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-black bg-white">
              <option value="OWNER">Property Owner</option>
              <option value="VENDOR">Vendor / Contractor</option>
            </select>
            <p className="text-[11px] text-slate-400 mt-1">{ROLE_DESCRIPTIONS[form.role]}</p>
            {form.role === "VENDOR" && (
              <p className="text-[11px] text-slate-400 mt-1">
                Registered as a private vendor — works exclusively for your organization. Manage business details or make them public from the Vendors page.
              </p>
            )}
          </div>
        </div>
        <div className="flex gap-3 px-6 py-4 border-t border-slate-100">
          <button onClick={onClose} className="flex-1 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">Cancel</button>
          <button
            onClick={MOCK_MODE ? handleMockSubmit : handleSubmit}
            disabled={saving}
            className="flex-1 py-2 text-sm bg-black text-white rounded-lg hover:bg-slate-800 font-medium disabled:opacity-50"
          >
            {saving ? "Inviting…" : "Send invite"}
          </button>
        </div>
      </div>
    </div>
  );
}

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

// ─── Create vendor modal ──────────────────────────────────────────────────────

const VENDOR_CATEGORIES = ["Plumbing", "Electrical", "HVAC", "Appliance", "Structural", "Painting", "Pest Control", "Cleaning", "Landscaping", "Other"];

function CreateVendorModal({ onClose, onSave }: { onClose: () => void; onSave: (v: VendorOut) => void }) {
  const [form, setForm] = useState({ full_name: "", email: "", phone: "", business_name: "" });
  const [cats, setCats] = useState<string[]>([]);
  const [isPublic, setIsPublic] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  function set(k: string, v: string) { setForm(f => ({ ...f, [k]: v })); }
  function toggleCat(c: string) { setCats(cs => cs.includes(c) ? cs.filter(x => x !== c) : [...cs, c]); }

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

// ─── Profile tab ──────────────────────────────────────────────────────────────

function ProfileTab() {
  const { user, refresh } = useAuth();
  const [form, setForm] = useState({ full_name: user?.full_name ?? "", phone: "" });
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (MOCK_MODE) return;
    profileApi.me().then((me) => setForm({ full_name: me.full_name, phone: me.phone })).catch(() => {});
  }, []);

  const E164_RE = /^\+[1-9]\d{7,14}$/;

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (form.phone && !E164_RE.test(form.phone.trim())) {
      setError("Phone must be in E.164 format, e.g. +15550001234"); return;
    }
    setSaving(true); setError(""); setSuccess(false);
    try {
      await profileApi.update({ full_name: form.full_name, phone: form.phone || undefined });
      await refresh();
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally { setSaving(false); }
  }

  return (
    <div className="max-w-lg space-y-6">
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <h3 className="text-sm font-semibold text-slate-900 mb-5">Personal information</h3>
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Email</label>
            <p className="text-sm text-slate-500 border border-slate-100 bg-slate-50 rounded-lg px-3 py-2">{user?.email}</p>
            <p className="text-[11px] text-slate-400 mt-1">Email cannot be changed</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Full name</label>
            <input
              value={form.full_name}
              onChange={(e) => setForm(v => ({ ...v, full_name: e.target.value }))}
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-black"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Phone number</label>
            <input
              type="tel"
              value={form.phone}
              onChange={(e) => setForm(v => ({ ...v, phone: e.target.value }))}
              placeholder="+15550001234"
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-black"
            />
            <p className="text-[11px] text-slate-400 mt-1">International format, e.g. +15550001234</p>
          </div>
          {error && <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
          {success && <p className="text-xs text-emerald-600 bg-emerald-50 rounded-lg px-3 py-2">Profile updated successfully</p>}
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 text-sm bg-black text-white rounded-lg hover:bg-slate-800 font-medium disabled:opacity-50 transition-colors"
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
        </form>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <h3 className="text-sm font-semibold text-slate-900 mb-1">Organization</h3>
        <p className="text-sm text-slate-500">{user?.org_name}</p>
        <p className="text-[11px] text-slate-400 mt-1">Role: {user?.role}</p>
      </div>
    </div>
  );
}

// ─── Marketing / Facebook Settings Tab ────────────────────────────────────────

function MarketingTab() {
  const [sites, setSites] = useState<MarketingSiteOut[]>([]);
  const [loadingSites, setLoadingSites] = useState(true);
  const [siteForm, setSiteForm] = useState({ name: "", url: "" });
  const [addingSite, setAddingSite] = useState(false);
  const [siteError, setSiteError] = useState("");
  const [removingSiteId, setRemovingSiteId] = useState<string | null>(null);
  const [editingSiteId, setEditingSiteId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ name: "", url: "" });
  const [savingEditId, setSavingEditId] = useState<string | null>(null);

  useEffect(() => {
    campaignsApi.listMarketingSites()
      .then(setSites)
      .catch(() => {})
      .finally(() => setLoadingSites(false));
  }, []);

  async function handleAddSite(e: React.FormEvent) {
    e.preventDefault();
    if (!siteForm.name.trim() || !siteForm.url.trim()) return;
    setAddingSite(true); setSiteError("");
    try {
      const site = await campaignsApi.addMarketingSite({ name: siteForm.name.trim(), url: siteForm.url.trim() });
      setSites(s => [...s, site]);
      setSiteForm({ name: "", url: "" });
    } catch (e: unknown) {
      setSiteError(e instanceof Error ? e.message : "Failed to add site");
    } finally { setAddingSite(false); }
  }

  async function handleRemoveSite(id: string) {
    setRemovingSiteId(id); setSiteError("");
    try {
      await campaignsApi.removeMarketingSite(id);
      setSites(s => s.filter(site => site.id !== id));
    } catch (e: unknown) {
      setSiteError(e instanceof Error ? e.message : "Failed to remove site");
    } finally { setRemovingSiteId(null); }
  }

  function startEditSite(site: MarketingSiteOut) {
    setEditingSiteId(site.id);
    setEditForm({ name: site.name, url: site.url });
    setSiteError("");
  }

  async function handleSaveEditSite(id: string) {
    if (!editForm.name.trim() || !editForm.url.trim()) return;
    setSavingEditId(id); setSiteError("");
    try {
      const updated = await campaignsApi.updateMarketingSite(id, { name: editForm.name.trim(), url: editForm.url.trim() });
      setSites(s => s.map(site => site.id === id ? updated : site));
      setEditingSiteId(null);
    } catch (e: unknown) {
      setSiteError(e instanceof Error ? e.message : "Failed to save changes");
    } finally { setSavingEditId(null); }
  }

  const inp = "w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-black";

  return (
    <div className="max-w-lg space-y-6">
      <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-5">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Posting Websites</h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Every site available in the "Post" dropdown on your campaigns. Edit or remove any of them, or add more below.
          </p>
        </div>

        <ul className="space-y-2">
          {sites.map(site => (
            <li key={site.id} className="border border-slate-100 rounded-lg px-3 py-2">
              {editingSiteId === site.id ? (
                <div className="flex items-end gap-2">
                  <div className="flex-1">
                    <label className="block text-[11px] font-medium text-slate-500 mb-0.5">Site name</label>
                    <input value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} className={inp} />
                  </div>
                  <div className="flex-1">
                    <label className="block text-[11px] font-medium text-slate-500 mb-0.5">URL</label>
                    <input value={editForm.url} onChange={e => setEditForm(f => ({ ...f, url: e.target.value }))} className={inp} />
                  </div>
                  <button type="button" onClick={() => handleSaveEditSite(site.id)}
                    disabled={savingEditId === site.id || !editForm.name.trim() || !editForm.url.trim()}
                    className="shrink-0 px-3 py-2 text-xs bg-black text-white rounded-lg hover:bg-slate-800 disabled:opacity-50">
                    {savingEditId === site.id ? "Saving…" : "Save"}
                  </button>
                  <button type="button" onClick={() => setEditingSiteId(null)} disabled={savingEditId === site.id}
                    className="shrink-0 px-3 py-2 text-xs text-slate-500 hover:text-slate-700 disabled:opacity-50">
                    Cancel
                  </button>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-900 truncate">{site.name}</p>
                    <a href={site.url} target="_blank" rel="noopener noreferrer" className="text-xs text-slate-400 hover:text-blue-600 hover:underline truncate block">
                      {site.url}
                    </a>
                  </div>
                  <div className="shrink-0 flex items-center gap-3">
                    <button type="button" onClick={() => startEditSite(site)} className="text-xs text-slate-500 hover:text-black">
                      Edit
                    </button>
                    <button type="button" onClick={() => handleRemoveSite(site.id)} disabled={removingSiteId === site.id}
                      className="text-xs text-red-500 hover:text-red-700 disabled:opacity-50">
                      {removingSiteId === site.id ? "Removing…" : "Remove"}
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
        {loadingSites && <p className="text-xs text-slate-400">Loading…</p>}

        <form onSubmit={handleAddSite} className="flex items-end gap-2">
          <div className="flex-1">
            <label className="block text-xs font-medium text-slate-700 mb-1">Site name</label>
            <input value={siteForm.name} onChange={e => setSiteForm(f => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Craigslist" className={inp} />
          </div>
          <div className="flex-1">
            <label className="block text-xs font-medium text-slate-700 mb-1">URL</label>
            <input value={siteForm.url} onChange={e => setSiteForm(f => ({ ...f, url: e.target.value }))}
              placeholder="e.g. craigslist.org/post" className={inp} />
          </div>
          <button type="submit" disabled={addingSite || !siteForm.name.trim() || !siteForm.url.trim()}
            className="px-4 py-2 text-sm bg-black text-white rounded-lg hover:bg-slate-800 font-medium disabled:opacity-50 shrink-0">
            {addingSite ? "Adding…" : "Add site"}
          </button>
        </form>
        {siteError && <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{siteError}</p>}
      </div>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

type Modal =
  | { type: "none" }
  | { type: "invite" }
  | { type: "createVendor" }
  | { type: "remove"; member: TeamMemberOut };

export default function SettingsPage() {
  const { user } = useAuth();
  const perms = can(user?.role);
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<"profile" | "team" | "roles" | "marketing">("profile");
  const [team, setTeam] = useState<TeamMemberOut[]>(MOCK_TEAM);
  const [modal, setModal] = useState<Modal>({ type: "none" });

  useEffect(() => {
    const t = searchParams.get("tab");
    if (t === "team" || t === "roles" || t === "marketing" || t === "profile") setTab(t);
  }, [searchParams]);

  useEffect(() => {
    if (MOCK_MODE) return;
    teamApi.list().then(setTeam).catch(() => {});
  }, []);

  function handleInvited(m: TeamMemberOut) {
    setTeam(prev => [...prev, m]);
    setModal({ type: "none" });
  }

  function handleVendorCreated(_v: VendorOut) {
    setModal({ type: "none" });
    if (!MOCK_MODE) teamApi.list().then(setTeam).catch(() => {});
  }

  async function handleRemove(m: TeamMemberOut) {
    if (!MOCK_MODE) {
      try { await teamApi.remove(m.member_id); } catch { return; }
    }
    setTeam(prev => prev.filter(x => x.member_id !== m.member_id));
    setModal({ type: "none" });
  }

  return (
    <div className="max-w-[960px] mx-auto px-6 py-6 space-y-6">
      {modal.type === "invite" && (
        <InviteModal onClose={() => setModal({ type: "none" })} onSave={handleInvited} />
      )}
      {modal.type === "createVendor" && (
        <CreateVendorModal onClose={() => setModal({ type: "none" })} onSave={handleVendorCreated} />
      )}
      {modal.type === "remove" && (
        <ConfirmDialog
          message={`Remove ${modal.member.full_name} from the team? They will lose all access.`}
          onConfirm={() => handleRemove(modal.member)}
          onCancel={() => setModal({ type: "none" })}
        />
      )}

      {/* Header */}
      <div>
        <p className="text-[11px] uppercase tracking-widest text-slate-400 font-medium">Account</p>
        <h1 className="text-xl font-bold text-slate-900 mt-0.5">Settings</h1>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-200">
        {(["profile", "team", "roles", "marketing"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium capitalize transition-colors border-b-2 -mb-px ${
              tab === t ? "border-black text-slate-900" : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            {t === "profile" ? "My profile" : t === "team" ? "Team members" : t === "roles" ? "Role guide" : "Marketing"}
          </button>
        ))}
      </div>

      {/* Profile tab */}
      {tab === "profile" && <ProfileTab />}

      {/* Marketing tab */}
      {tab === "marketing" && <MarketingTab />}

      {/* Team tab */}
      {tab === "team" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-500">{team.length} member{team.length !== 1 ? "s" : ""}</p>
            {perms.inviteStaff && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setModal({ type: "createVendor" })}
                  className="px-3 py-1.5 border border-slate-200 text-slate-600 text-xs font-medium rounded-lg hover:bg-slate-50 transition-colors"
                >
                  + Create vendor
                </button>
                <button
                  onClick={() => setModal({ type: "invite" })}
                  className="px-3 py-1.5 bg-black text-white text-xs font-medium rounded-lg hover:bg-slate-800 transition-colors"
                >
                  + Invite member
                </button>
              </div>
            )}
          </div>

          <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
            {team.map((m) => {
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
          </div>
        </div>
      )}

      {/* Role guide tab */}
      {tab === "roles" && (
        <div className="space-y-3">
          {(["OWNER", "TENANT", "VENDOR"] as const).map((r) => (
            <div key={r} className="bg-white rounded-xl border border-slate-200 p-5">
              <div className="flex items-center gap-3 mb-3">
                <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full ${ROLE_STYLES[r]}`}>
                  {ROLE_LABELS[r]}
                </span>
              </div>
              <p className="text-sm text-slate-600 mb-4">{ROLE_DESCRIPTIONS[r]}</p>
              <div className="grid grid-cols-2 gap-2">
                {PERMISSION_MATRIX[r].map(({ label, allowed }) => (
                  <div key={label} className="flex items-center gap-2 text-xs">
                    <span className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 ${allowed ? "bg-emerald-100 text-emerald-600" : "bg-slate-100 text-slate-400"}`}>
                      {allowed ? "✓" : "✕"}
                    </span>
                    <span className={allowed ? "text-slate-700" : "text-slate-400"}>{label}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const PERMISSION_MATRIX: Record<string, { label: string; allowed: boolean }[]> = {
  OWNER: [
    { label: "Create / edit properties", allowed: true },
    { label: "Delete properties", allowed: true },
    { label: "Add / edit tenants", allowed: true },
    { label: "Terminate leases", allowed: true },
    { label: "Manage payments", allowed: true },
    { label: "Assign maintenance", allowed: true },
    { label: "Invite team members", allowed: true },
    { label: "Remove team members", allowed: true },
    { label: "View all data", allowed: true },
  ],
  TENANT: [
    { label: "Create / edit properties", allowed: false },
    { label: "Delete properties", allowed: false },
    { label: "Add / edit tenants", allowed: false },
    { label: "Terminate leases", allowed: false },
    { label: "Manage payments", allowed: false },
    { label: "Assign maintenance", allowed: false },
    { label: "Invite team members", allowed: false },
    { label: "Remove team members", allowed: false },
    { label: "View own lease / portal", allowed: true },
  ],
  VENDOR: [
    { label: "View assigned maintenance jobs", allowed: true },
    { label: "Update job status", allowed: true },
    { label: "Upload completion photos", allowed: true },
    { label: "Manage own availability", allowed: true },
    { label: "View tenant contact info", allowed: true },
    { label: "Access property / payment data", allowed: false },
    { label: "Assign or manage maintenance", allowed: false },
    { label: "Invite or manage team members", allowed: false },
    { label: "View organisation-wide data", allowed: false },
    { label: "Access dashboard or reports", allowed: false },
  ],
};
