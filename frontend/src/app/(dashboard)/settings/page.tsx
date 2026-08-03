"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { profileApi, campaignsApi, leasesApi, type MarketingSiteOut, type DocuSignConfigOut } from "@/lib/api";
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

  const [orgName, setOrgName] = useState(user?.org_name ?? "");
  const [savingOrg, setSavingOrg] = useState(false);
  const [orgSuccess, setOrgSuccess] = useState(false);
  const [orgError, setOrgError] = useState("");

  useEffect(() => {
    setOrgName(user?.org_name ?? "");
  }, [user?.org_name]);

  async function handleSaveOrg(e: React.FormEvent) {
    e.preventDefault();
    if (!orgName.trim()) { setOrgError("Company name is required"); return; }
    setSavingOrg(true); setOrgError(""); setOrgSuccess(false);
    try {
      await profileApi.updateOrg({ name: orgName.trim() });
      await refresh();
      setOrgSuccess(true);
      setTimeout(() => setOrgSuccess(false), 3000);
    } catch (e: unknown) {
      setOrgError(e instanceof Error ? e.message : "Save failed");
    } finally { setSavingOrg(false); }
  }

  const [slug, setSlug] = useState(user?.org_slug ?? "");
  const [savingSlug, setSavingSlug] = useState(false);
  const [slugSuccess, setSlugSuccess] = useState(false);
  const [slugError, setSlugError] = useState("");
  const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

  useEffect(() => {
    setSlug(user?.org_slug ?? "");
  }, [user?.org_slug]);

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const signupLink = user?.org_slug ? `${origin}/join/${user.org_slug}` : "";

  function copySignupLink() {
    if (!signupLink) return;
    navigator.clipboard.writeText(signupLink).then(() => {
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    });
  }

  async function handleSaveSlug(e: React.FormEvent) {
    e.preventDefault();
    const cleaned = slug.trim().toLowerCase();
    if (!SLUG_RE.test(cleaned)) {
      setSlugError("Only lowercase letters, numbers, and hyphens are allowed.");
      return;
    }
    setSavingSlug(true); setSlugError(""); setSlugSuccess(false);
    try {
      await profileApi.updateOrg({ slug: cleaned });
      await refresh();
      setSlugSuccess(true);
      setTimeout(() => setSlugSuccess(false), 3000);
    } catch (e: unknown) {
      setSlugError(e instanceof Error ? e.message : "Save failed");
    } finally { setSavingSlug(false); }
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
        <h3 className="text-sm font-semibold text-slate-900 mb-5">Company</h3>
        {user?.role === "OWNER" ? (
          <form onSubmit={handleSaveOrg} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Company name</label>
              <input
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-black"
                required
              />
            </div>
            {orgError && <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{orgError}</p>}
            {orgSuccess && <p className="text-xs text-emerald-600 bg-emerald-50 rounded-lg px-3 py-2">Company name updated successfully</p>}
            <button
              type="submit"
              disabled={savingOrg}
              className="px-4 py-2 text-sm bg-black text-white rounded-lg hover:bg-slate-800 font-medium disabled:opacity-50 transition-colors"
            >
              {savingOrg ? "Saving…" : "Save changes"}
            </button>
          </form>
        ) : (
          <p className="text-sm text-slate-500">{user?.org_name}</p>
        )}
        <p className="text-[11px] text-slate-400 mt-3">Role: {user?.role}</p>
      </div>

      {user?.role === "OWNER" && (
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <h3 className="text-sm font-semibold text-slate-900 mb-1">Tenant &amp; vendor sign-up page</h3>
          <p className="text-[11px] text-slate-400 mb-3">
            Share this link so tenants and vendors can create their own account under {user?.org_name}.
          </p>
          <div className="flex items-center gap-2 mb-4">
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

          <form onSubmit={handleSaveSlug} className="border-t border-slate-100 pt-4 space-y-2">
            <label className="block text-xs font-medium text-slate-700">Customize URL</label>
            <div className="flex items-center gap-1">
              <span className="text-sm text-slate-400 whitespace-nowrap">{origin}/join/</span>
              <input
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                className="flex-1 min-w-0 text-sm border border-slate-200 rounded-lg px-2.5 py-1.5 outline-none focus:border-black"
              />
            </div>
            <p className="text-[11px] text-slate-400">
              Lowercase letters, numbers, and hyphens only. Changing this will break any links you've already shared.
            </p>
            {slugError && <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{slugError}</p>}
            {slugSuccess && <p className="text-xs text-emerald-600 bg-emerald-50 rounded-lg px-3 py-2">Sign-up page URL updated successfully</p>}
            <button
              type="submit"
              disabled={savingSlug || slug === user?.org_slug}
              className="px-4 py-2 text-sm bg-black text-white rounded-lg hover:bg-slate-800 font-medium disabled:opacity-50 transition-colors"
            >
              {savingSlug ? "Saving…" : "Save URL"}
            </button>
          </form>
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

// ─── Screening tab ─────────────────────────────────────────────────────────────

function ScreeningTab() {
  const { user, refresh } = useAuth();
  const [criminalEnabled, setCriminalEnabled] = useState(user?.screening_criminal_record_enabled ?? false);
  const [rentalHistoryEnabled, setRentalHistoryEnabled] = useState(user?.screening_rental_history_enabled ?? false);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setCriminalEnabled(user?.screening_criminal_record_enabled ?? false);
    setRentalHistoryEnabled(user?.screening_rental_history_enabled ?? false);
  }, [user?.screening_criminal_record_enabled, user?.screening_rental_history_enabled]);

  async function handleSave() {
    setSaving(true); setError(""); setSuccess(false);
    try {
      await profileApi.updateOrg({
        screening_criminal_record_enabled: criminalEnabled,
        screening_rental_history_enabled: rentalHistoryEnabled,
      });
      await refresh();
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally { setSaving(false); }
  }

  return (
    <div className="max-w-lg space-y-6">
      <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-5">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Tenant screening questions</h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Control which sensitive questions appear on your rental application form. Both are off by default —
            in several Canadian provinces, criminal-record and eviction-history screening carries Human Rights Code risk if used
            to reject applicants, so only enable what you have a clear, consistent policy for.
          </p>
        </div>

        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={criminalEnabled}
            onChange={(e) => setCriminalEnabled(e.target.checked)}
            className="mt-0.5"
          />
          <span>
            <span className="block text-sm font-medium text-slate-900">Ask about criminal record</span>
            <span className="block text-xs text-slate-400 mt-0.5">
              Adds "Do you have a criminal record?" to the application. Off by default.
            </span>
          </span>
        </label>

        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={rentalHistoryEnabled}
            onChange={(e) => setRentalHistoryEnabled(e.target.checked)}
            className="mt-0.5"
          />
          <span>
            <span className="block text-sm font-medium text-slate-900">Ask about eviction / refused-rent history</span>
            <span className="block text-xs text-slate-400 mt-0.5">
              Adds "Have you ever been evicted?" and "Have you ever refused to pay rent?" to the application. Off by default.
            </span>
          </span>
        </label>

        {error && <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
        {success && <p className="text-xs text-emerald-600 bg-emerald-50 rounded-lg px-3 py-2">Screening settings saved</p>}
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-2 text-sm bg-black text-white rounded-lg hover:bg-slate-800 font-medium disabled:opacity-50 transition-colors"
        >
          {saving ? "Saving…" : "Save changes"}
        </button>
      </div>
    </div>
  );
}

// ─── DocuSign tab ─────────────────────────────────────────────────────────────

function DocuSignTab() {
  const [status, setStatus] = useState<{
    configured: boolean;
    connected: boolean;
    account: { name: string | null; email: string | null; account_id: string | null; account_name: string | null; is_sandbox: boolean } | null;
  } | null>(null);
  const [config, setConfig] = useState<DocuSignConfigOut | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState("");

  const [form, setForm] = useState({ integration_key: "", account_id: "", user_id: "", private_key: "" });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [togglingOwnAccount, setTogglingOwnAccount] = useState(false);

  async function loadAll() {
    setLoading(true); setError("");
    try {
      const [s, c] = await Promise.all([leasesApi.docusignStatus(), leasesApi.getDocusignConfig()]);
      setStatus(s);
      setConfig(c);
      setForm({ integration_key: c.integration_key ?? "", account_id: c.account_id ?? "", user_id: c.user_id ?? "", private_key: "" });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load DocuSign status");
    } finally { setLoading(false); }
  }

  async function handleToggleUseOwnAccount(checked: boolean) {
    setTogglingOwnAccount(true); setSaveError("");
    try {
      const c = await leasesApi.updateDocusignConfig({ use_own_account: checked });
      setConfig(c);
      await loadAll();
    } catch (e: unknown) {
      setSaveError(e instanceof Error ? e.message : "Failed to update");
    } finally { setTogglingOwnAccount(false); }
  }

  useEffect(() => { loadAll(); }, []);

  async function handleClearKey() {
    setSaving(true); setSaveError(""); setSaveSuccess(false);
    try {
      const c = await leasesApi.updateDocusignConfig({ private_key: "" });
      setConfig(c);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
      await loadAll();
    } catch (e: unknown) {
      setSaveError(e instanceof Error ? e.message : "Failed to remove key");
    } finally { setSaving(false); }
  }

  async function handleConnect() {
    setConnecting(true); setError("");
    try {
      const redirectUri = `${window.location.origin}/settings?tab=docusign`;
      const { url } = await leasesApi.docusignConsentUrl(redirectUri);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to build consent link");
    } finally { setConnecting(false); }
  }

  async function handleSaveConfig(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setSaveError(""); setSaveSuccess(false);
    try {
      const body: Record<string, string> = {
        integration_key: form.integration_key.trim(),
        account_id: form.account_id.trim(),
        user_id: form.user_id.trim(),
      };
      if (form.private_key.trim()) body.private_key = form.private_key.trim();
      const c = await leasesApi.updateDocusignConfig(body);
      setConfig(c);
      setForm((f) => ({ ...f, private_key: "" }));
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
      await loadAll();
    } catch (e: unknown) {
      setSaveError(e instanceof Error ? e.message : "Save failed");
    } finally { setSaving(false); }
  }

  return (
    <div className="max-w-lg space-y-6">
      <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-5">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">DocuSign e-signature</h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Connect DocuSign so lease agreements can be sent for signature directly from the Leases page.
          </p>
        </div>

        {loading ? (
          <p className="text-xs text-slate-400">Checking status…</p>
        ) : !status?.configured ? (
          <div className="flex items-start gap-3">
            <span className="w-2 h-2 rounded-full bg-slate-300 mt-1.5 shrink-0" />
            <div>
              <p className="text-sm font-medium text-slate-900">Not configured</p>
              <p className="text-xs text-slate-400 mt-0.5">
                Add your DocuSign developer account credentials below to get started.
              </p>
            </div>
          </div>
        ) : status.connected ? (
          <div className="flex items-start gap-3">
            <span className="w-2 h-2 rounded-full bg-emerald-500 mt-1.5 shrink-0" />
            <div>
              <p className="text-sm font-medium text-slate-900">Connected{config && !config.using_platform_default ? " — using your own account" : ""}</p>
              <p className="text-xs text-slate-400 mt-0.5">Leases can be sent for signature via DocuSign.</p>
              {status.account && (
                <div className="mt-2 bg-slate-50 rounded-lg px-3 py-2 space-y-1">
                  <p className="text-xs text-slate-700">
                    <span className="text-slate-400">Signed in as</span>{" "}
                    <span className="font-medium">{status.account.name ?? "Unknown"}</span>
                    {status.account.email ? ` (${status.account.email})` : ""}
                  </p>
                  <p className="text-xs text-slate-700">
                    <span className="text-slate-400">Account</span>{" "}
                    <span className="font-medium">{status.account.account_name ?? "Unknown"}</span>
                    {status.account.account_id ? ` · ${status.account.account_id}` : ""}
                  </p>
                  <p className="text-[11px] text-slate-400">
                    {status.account.is_sandbox ? "Sandbox (demo) environment" : "Production environment"}
                  </p>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex items-start gap-3">
            <span className="w-2 h-2 rounded-full bg-amber-500 mt-1.5 shrink-0" />
            <div>
              <p className="text-sm font-medium text-slate-900">Needs one-time setup</p>
              <p className="text-xs text-slate-400 mt-0.5">
                Credentials are configured, but the DocuSign account hasn't granted access yet. Click below, sign
                in to DocuSign, and click Allow.
              </p>
            </div>
          </div>
        )}

        {error && <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleConnect}
            disabled={!status?.configured || connecting}
            className="px-4 py-2 text-sm bg-black text-white rounded-lg hover:bg-slate-800 font-medium disabled:opacity-50 transition-colors"
          >
            {connecting ? "Opening…" : status?.connected ? "Reconnect DocuSign" : "Connect DocuSign"}
          </button>
          <button
            type="button"
            onClick={loadAll}
            className="px-4 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 font-medium transition-colors"
          >
            Refresh status
          </button>
        </div>
      </div>

      <form onSubmit={handleSaveConfig} className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Your developer account</h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Bring your own DocuSign developer (sandbox) account instead of the shared default. Create one at
            DocuSign's developer portal, add a JWT integration key, generate an RSA keypair, and paste the values
            below. Leave everything blank to keep using the shared default.
          </p>
          <a href="https://developers.docusign.com/" target="_blank" rel="noopener noreferrer"
            className="inline-block text-xs font-medium text-violet-700 hover:text-violet-900 mt-1.5">
            How to set up a DocuSign developer account →
          </a>
        </div>

        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={config?.use_own_account ?? false}
            disabled={togglingOwnAccount}
            onChange={(e) => handleToggleUseOwnAccount(e.target.checked)}
            className="mt-0.5"
          />
          <span>
            <span className="block text-sm font-medium text-slate-900">Use your developer account</span>
            <span className="block text-xs text-slate-400 mt-0.5">
              Off by default — leases are sent using the shared system developer account. Turn this on to use the
              credentials you save below instead.
            </span>
          </span>
        </label>

        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Integration key (Client ID)</label>
          <input value={form.integration_key} onChange={(e) => setForm((f) => ({ ...f, integration_key: e.target.value }))}
            placeholder="e.g. a3327593-a611-4bb1-aada-3687c8a66cb4"
            className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-black" />
          <p className="text-[11px] text-slate-400 mt-1">
            In the DocuSign Admin console, go to <span className="font-medium">Apps and Keys</span> and click
            <span className="font-medium"> Add App and Integration Key</span>. The key it generates (a GUID) is this value.
          </p>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">API account ID</label>
          <input value={form.account_id} onChange={(e) => setForm((f) => ({ ...f, account_id: e.target.value }))}
            placeholder="Your DocuSign API Account ID"
            className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-black" />
          <p className="text-[11px] text-slate-400 mt-1">
            Shown at the top of the same <span className="font-medium">Apps and Keys</span> page, next to your
            account name (also visible under your DocuSign profile menu → Settings).
          </p>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">API username (User ID)</label>
          <input value={form.user_id} onChange={(e) => setForm((f) => ({ ...f, user_id: e.target.value }))}
            placeholder="The GUID of the DocuSign user the integration impersonates"
            className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-black" />
          <p className="text-[11px] text-slate-400 mt-1">
            The GUID of the DocuSign user your integration signs in as — find it under
            <span className="font-medium"> Apps and Keys → your user's name</span>, or your profile's
            <span className="font-medium"> API Username</span> field. This is who needs to click "Allow" during Connect.
          </p>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">
            RSA private key {config?.private_key_set && <span className="text-emerald-600 font-normal">(already on file — paste a new one to replace it)</span>}
          </label>
          <textarea value={form.private_key} onChange={(e) => setForm((f) => ({ ...f, private_key: e.target.value }))} rows={5}
            placeholder={config?.private_key_set ? "•••••••• (unchanged)" : "-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----"}
            className="w-full text-xs font-mono border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-black resize-none" />
          <p className="text-[11px] text-slate-400 mt-1">
            On your integration key's row in <span className="font-medium">Apps and Keys</span>, choose
            <span className="font-medium"> Actions → Generate RSA</span>. DocuSign shows the private key only once —
            copy the whole block, including the BEGIN/END lines, right away.
          </p>
          {config?.private_key_set && (
            <button type="button" onClick={handleClearKey} disabled={saving}
              className="text-[11px] text-red-600 hover:text-red-700 font-medium mt-1 disabled:opacity-50">
              Remove saved key
            </button>
          )}
        </div>

        {saveError && <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{saveError}</p>}
        {saveSuccess && <p className="text-xs text-emerald-600 bg-emerald-50 rounded-lg px-3 py-2">DocuSign credentials saved</p>}

        <button type="submit" disabled={saving}
          className="px-4 py-2 text-sm bg-black text-white rounded-lg hover:bg-slate-800 font-medium disabled:opacity-50 transition-colors">
          {saving ? "Saving…" : "Save credentials"}
        </button>
      </form>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<"profile" | "roles" | "marketing" | "screening" | "docusign">("profile");

  useEffect(() => {
    const t = searchParams.get("tab");
    if (t === "roles" || t === "marketing" || t === "profile" || t === "screening" || t === "docusign") setTab(t);
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
        {(["profile", "roles", "marketing", "screening", "docusign"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium capitalize transition-colors border-b-2 -mb-px ${
              tab === t ? "border-black text-slate-900" : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            {t === "profile" ? "My profile" : t === "roles" ? "Role guide" : t === "marketing" ? "Marketing" : t === "screening" ? "Screening" : "DocuSign"}
          </button>
        ))}
      </div>

      {/* Profile tab */}
      {tab === "profile" && <ProfileTab />}

      {/* Marketing tab */}
      {tab === "marketing" && <MarketingTab />}

      {/* Screening tab */}
      {tab === "screening" && <ScreeningTab />}

      {/* DocuSign tab */}
      {tab === "docusign" && <DocuSignTab />}

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
