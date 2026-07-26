"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { profileApi, campaignsApi, type MarketingSiteOut } from "@/lib/api";
import { MOCK_MODE } from "@/lib/useApiData";

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

// ─── Profile tab ──────────────────────────────────────────────────────────────

function ProfileTab() {
  const { user, refresh } = useAuth();
  const [form, setForm] = useState({ full_name: user?.full_name ?? "", phone: "" });
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");
  const [linkCopied, setLinkCopied] = useState(false);

  const signupLink = user?.org_slug && typeof window !== "undefined"
    ? `${window.location.origin}/join/${user.org_slug}`
    : "";

  function copySignupLink() {
    if (!signupLink) return;
    navigator.clipboard.writeText(signupLink).then(() => {
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    });
  }

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

      {user?.role === "OWNER" && (
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <h3 className="text-sm font-semibold text-slate-900 mb-1">Tenant &amp; vendor sign-up page</h3>
          <p className="text-[11px] text-slate-400 mb-3">
            Share this link so tenants and vendors can create their own account under {user?.org_name}.
          </p>
          <div className="flex items-center gap-2">
            <input
              readOnly
              value={signupLink}
              onFocus={(e) => e.target.select()}
              className="flex-1 text-sm border border-slate-200 rounded-lg px-3 py-2 bg-slate-50 text-slate-600 outline-none"
            />
            <button
              type="button"
              onClick={copySignupLink}
              className="px-3 py-2 text-sm bg-black text-white rounded-lg hover:bg-slate-800 font-medium transition-colors shrink-0"
            >
              {linkCopied ? "Copied!" : "Copy"}
            </button>
          </div>
        </div>
      )}
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

export default function SettingsPage() {
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<"profile" | "roles" | "marketing">("profile");

  useEffect(() => {
    const t = searchParams.get("tab");
    if (t === "roles" || t === "marketing" || t === "profile") setTab(t);
  }, [searchParams]);

  return (
    <div className="max-w-[960px] mx-auto px-6 py-6 space-y-6">
      {/* Header */}
      <div>
        <p className="text-[11px] uppercase tracking-widest text-slate-400 font-medium">Account</p>
        <h1 className="text-xl font-bold text-slate-900 mt-0.5">Settings</h1>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-200">
        {(["profile", "roles", "marketing"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium capitalize transition-colors border-b-2 -mb-px ${
              tab === t ? "border-black text-slate-900" : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            {t === "profile" ? "My profile" : t === "roles" ? "Role guide" : "Marketing"}
          </button>
        ))}
      </div>

      {/* Profile tab */}
      {tab === "profile" && <ProfileTab />}

      {/* Marketing tab */}
      {tab === "marketing" && <MarketingTab />}

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
