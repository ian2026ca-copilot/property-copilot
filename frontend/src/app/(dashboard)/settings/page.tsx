"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { profileApi, campaignsApi, leasesApi, tenantsApi, billingApi, type MarketingSiteOut, type DocuSignConfigOut, type ReferenceEmailConfigOut, type BillingStatusOut, type LeaseTemplateOut } from "@/lib/api";
import { MOCK_MODE } from "@/lib/useApiData";
import { LeaseTemplatesModal } from "@/components/LeaseTemplatesModal";

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

  const [replyEmail, setReplyEmail] = useState(user?.reference_reply_email || user?.email || "");
  const [savingEmail, setSavingEmail] = useState(false);
  const [emailSuccess, setEmailSuccess] = useState(false);
  const [emailError, setEmailError] = useState("");

  const [imapConfig, setImapConfig] = useState<ReferenceEmailConfigOut | null>(null);
  const [loadingImap, setLoadingImap] = useState(true);
  const [imapForm, setImapForm] = useState({ imap_host: "", imap_port: "993", app_password: "", check_enabled: false });
  const [savingImap, setSavingImap] = useState(false);
  const [imapSuccess, setImapSuccess] = useState(false);
  const [imapError, setImapError] = useState("");

  useEffect(() => {
    setCriminalEnabled(user?.screening_criminal_record_enabled ?? false);
    setRentalHistoryEnabled(user?.screening_rental_history_enabled ?? false);
  }, [user?.screening_criminal_record_enabled, user?.screening_rental_history_enabled]);

  useEffect(() => {
    setReplyEmail(user?.reference_reply_email || user?.email || "");
  }, [user?.reference_reply_email, user?.email]);

  async function loadImapConfig() {
    setLoadingImap(true);
    try {
      const c = await tenantsApi.getReferenceEmailConfig();
      setImapConfig(c);
      setImapForm({
        imap_host: c.imap_host ?? "",
        imap_port: c.imap_port ? String(c.imap_port) : "993",
        app_password: "",
        check_enabled: c.check_enabled,
      });
    } catch {
      // no config yet / not reachable — leave form at defaults
    } finally {
      setLoadingImap(false);
    }
  }

  useEffect(() => { loadImapConfig(); }, []);

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

  async function handleSaveEmail(e: React.FormEvent) {
    e.preventDefault();
    setSavingEmail(true); setEmailError(""); setEmailSuccess(false);
    try {
      await profileApi.updateOrg({ reference_reply_email: replyEmail.trim() });
      await refresh();
      setEmailSuccess(true);
      setTimeout(() => setEmailSuccess(false), 3000);
    } catch (e: unknown) {
      setEmailError(e instanceof Error ? e.message : "Save failed");
    } finally { setSavingEmail(false); }
  }

  async function handleSaveImap(e: React.FormEvent) {
    e.preventDefault();
    setSavingImap(true); setImapError(""); setImapSuccess(false);
    try {
      const body: { imap_host: string; imap_port: number; check_enabled: boolean; app_password?: string } = {
        imap_host: imapForm.imap_host.trim(),
        imap_port: Number(imapForm.imap_port) || 993,
        check_enabled: imapForm.check_enabled,
      };
      if (imapForm.app_password.trim()) body.app_password = imapForm.app_password.trim();
      const c = await tenantsApi.updateReferenceEmailConfig(body);
      setImapConfig(c);
      setImapForm((f) => ({ ...f, app_password: "" }));
      setImapSuccess(true);
      setTimeout(() => setImapSuccess(false), 3000);
    } catch (e: unknown) {
      setImapError(e instanceof Error ? e.message : "Save failed");
    } finally { setSavingImap(false); }
  }

  async function handleClearImapPassword() {
    setSavingImap(true); setImapError("");
    try {
      const c = await tenantsApi.updateReferenceEmailConfig({ app_password: "" });
      setImapConfig(c);
      setImapSuccess(true);
      setTimeout(() => setImapSuccess(false), 3000);
    } catch (e: unknown) {
      setImapError(e instanceof Error ? e.message : "Failed to remove password");
    } finally { setSavingImap(false); }
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

      <form onSubmit={handleSaveEmail} className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Reference reply email</h3>
          <p className="text-xs text-slate-400 mt-0.5">
            When you email an employer or landlord reference from the Screening page, this is the address their
            reply goes to. Defaults to your own account email below — change it if replies should land somewhere else.
          </p>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Reply-to address</label>
          <input
            type="email"
            value={replyEmail}
            onChange={(e) => setReplyEmail(e.target.value)}
            placeholder={user?.email}
            className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-black"
          />
        </div>

        {emailError && <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{emailError}</p>}
        {emailSuccess && <p className="text-xs text-emerald-600 bg-emerald-50 rounded-lg px-3 py-2">Reply-to address saved</p>}
        <button
          type="submit"
          disabled={savingEmail}
          className="px-4 py-2 text-sm bg-black text-white rounded-lg hover:bg-slate-800 font-medium disabled:opacity-50 transition-colors"
        >
          {savingEmail ? "Saving…" : "Save email"}
        </button>
      </form>

      <form onSubmit={handleSaveImap} className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Automatic reference-reply checking</h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Connect the inbox above via IMAP and the app will check it periodically, match replies back to the
            reference request that was sent, and post an AI-summarized note on the applicant automatically —
            no manual copy-paste needed.
          </p>
          <a href="https://support.google.com/mail/answer/185833" target="_blank" rel="noopener noreferrer"
            className="inline-block text-xs font-medium text-violet-700 hover:text-violet-900 mt-1.5">
            How to generate a Gmail App Password →
          </a>
        </div>

        {loadingImap ? (
          <p className="text-xs text-slate-400">Loading…</p>
        ) : (
          <>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">IMAP host</label>
              <input value={imapForm.imap_host} onChange={(e) => setImapForm((f) => ({ ...f, imap_host: e.target.value }))}
                placeholder="imap.gmail.com"
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-black" />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">IMAP port</label>
              <input value={imapForm.imap_port} onChange={(e) => setImapForm((f) => ({ ...f, imap_port: e.target.value }))}
                placeholder="993"
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-black" />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">
                App password {imapConfig?.password_set && <span className="text-emerald-600 font-normal">(already on file — enter a new one to replace it)</span>}
              </label>
              <input
                type="password"
                value={imapForm.app_password}
                onChange={(e) => setImapForm((f) => ({ ...f, app_password: e.target.value }))}
                placeholder={imapConfig?.password_set ? "•••••••• (unchanged)" : "16-character app password"}
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-black"
              />
              <p className="text-[11px] text-slate-400 mt-1">
                Not your regular password — generate a dedicated App Password from your Google Account
                (Security → 2-Step Verification → App passwords) so this app never sees your real login.
              </p>
              {imapConfig?.password_set && (
                <button type="button" onClick={handleClearImapPassword} disabled={savingImap}
                  className="text-[11px] text-red-600 hover:text-red-700 font-medium mt-1 disabled:opacity-50">
                  Remove saved password
                </button>
              )}
            </div>

            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={imapForm.check_enabled}
                onChange={(e) => setImapForm((f) => ({ ...f, check_enabled: e.target.checked }))}
                className="mt-0.5"
              />
              <span>
                <span className="block text-sm font-medium text-slate-900">Enable automatic reply checking</span>
                <span className="block text-xs text-slate-400 mt-0.5">
                  Off by default. Turn on once the fields above are saved.
                </span>
              </span>
            </label>
          </>
        )}

        {imapError && <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{imapError}</p>}
        {imapSuccess && <p className="text-xs text-emerald-600 bg-emerald-50 rounded-lg px-3 py-2">Settings saved</p>}
        <button
          type="submit"
          disabled={savingImap || loadingImap}
          className="px-4 py-2 text-sm bg-black text-white rounded-lg hover:bg-slate-800 font-medium disabled:opacity-50 transition-colors"
        >
          {savingImap ? "Saving…" : "Save settings"}
        </button>
      </form>
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

// ─── Invite tenant template tab ─────────────────────────────────────────────

const DEFAULT_INVITE_TEMPLATE =
  "Welcome, {tenant_name}! {org_name} has set up your tenant portal account. " +
  "Log in using your email address ({email}) as your username.\n\n" +
  "Portal link: {portal_link}";

function InviteTemplateTab() {
  const { user, refresh } = useAuth();
  const [template, setTemplate] = useState(user?.invite_message_template ?? "");
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setTemplate(user?.invite_message_template ?? "");
  }, [user?.invite_message_template]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setError(""); setSuccess(false);
    try {
      await profileApi.updateOrg({ invite_message_template: template });
      await refresh();
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally { setSaving(false); }
  }

  async function handleReset() {
    setTemplate("");
    setSaving(true); setError(""); setSuccess(false);
    try {
      await profileApi.updateOrg({ invite_message_template: "" });
      await refresh();
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Reset failed");
    } finally { setSaving(false); }
  }

  return (
    <div className="max-w-lg space-y-6">
      <form onSubmit={handleSave} className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Tenant invite template</h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Write your own message for "Send tenant invite" instead of relying on AI to draft one each time.
            Leave this blank to keep using AI-generated invites.
          </p>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Message template</label>
          <textarea
            rows={6}
            value={template}
            onChange={(e) => setTemplate(e.target.value)}
            placeholder={DEFAULT_INVITE_TEMPLATE}
            className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-black resize-none font-mono"
          />
          <p className="text-[11px] text-slate-400 mt-1.5">
            Placeholders: <code className="bg-slate-100 px-1 rounded">{"{tenant_name}"}</code>{" "}
            <code className="bg-slate-100 px-1 rounded">{"{org_name}"}</code>{" "}
            <code className="bg-slate-100 px-1 rounded">{"{email}"}</code>{" "}
            <code className="bg-slate-100 px-1 rounded">{"{portal_link}"}</code> — if you omit{" "}
            <code className="bg-slate-100 px-1 rounded">{"{portal_link}"}</code>, the real link is appended
            automatically at the end.
          </p>
        </div>

        {error && <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
        {success && <p className="text-xs text-emerald-600 bg-emerald-50 rounded-lg px-3 py-2">Template saved</p>}

        <div className="flex gap-2">
          <button type="submit" disabled={saving}
            className="px-4 py-2 text-sm bg-black text-white rounded-lg hover:bg-slate-800 font-medium disabled:opacity-50 transition-colors">
            {saving ? "Saving…" : "Save template"}
          </button>
          {!!user?.invite_message_template && (
            <button type="button" onClick={handleReset} disabled={saving}
              className="px-4 py-2 text-sm text-slate-500 hover:text-slate-700 disabled:opacity-50">
              Reset to AI-generated
            </button>
          )}
        </div>
      </form>
    </div>
  );
}

// ─── Lease agreement template tab ───────────────────────────────────────────

function LeaseTemplateTab() {
  const [showLeaseTemplates, setShowLeaseTemplates] = useState(false);
  const [templates, setTemplates] = useState<LeaseTemplateOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [error, setError] = useState("");

  function loadTemplates() {
    setLoading(true);
    leasesApi.listTemplates().then(setTemplates).catch(() => {}).finally(() => setLoading(false));
  }

  useEffect(() => { loadTemplates(); }, []);

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Delete template "${name}"?`)) return;
    setDeleting(id); setError("");
    try {
      await leasesApi.deleteTemplate(id);
      setTemplates(prev => prev.filter(t => t.id !== id));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Delete failed");
    } finally { setDeleting(null); }
  }

  return (
    <div className="max-w-lg space-y-6">
      <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Lease agreement templates</h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Upload your own lease agreement documents, or have AI generate one for a province and property type —
            these show up as options whenever you create, edit, or renew a lease.
          </p>
        </div>

        {error && <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

        {loading ? (
          <p className="text-xs text-slate-400 py-2">Loading…</p>
        ) : templates.length > 0 && (
          <ul className="space-y-2">
            {templates.map(t => (
              <li key={t.id} className="flex items-start gap-3 p-3 border border-slate-200 rounded-xl hover:border-slate-300 transition-colors">
                <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center shrink-0 text-slate-500">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <a href={t.url} target="_blank" rel="noopener noreferrer"
                    className="text-sm font-medium text-slate-900 hover:text-blue-600 hover:underline block truncate">
                    {t.name}
                  </a>
                  {t.description && <p className="text-xs text-slate-500 mt-0.5 truncate">{t.description}</p>}
                </div>
                <button onClick={() => handleDelete(t.id, t.name)} disabled={deleting === t.id}
                  className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors shrink-0 disabled:opacity-50">
                  {deleting === t.id ? <span className="text-xs">…</span> : (
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}

        <button type="button" onClick={() => setShowLeaseTemplates(true)}
          className="px-4 py-2 text-sm bg-black text-white rounded-lg hover:bg-slate-800 font-medium transition-colors">
          + Add lease template
        </button>
      </div>

      {showLeaseTemplates && (
        <LeaseTemplatesModal showList={false} onClose={() => { setShowLeaseTemplates(false); loadTemplates(); }} />
      )}
    </div>
  );
}

// ─── Billing tab ──────────────────────────────────────────────────────────────

const BILLING_STATUS_LABELS: Record<string, string> = {
  trialing: "Trial active",
  active: "Active",
  past_due: "Payment past due",
  canceled: "Canceled",
};

function BillingTab({ showWelcome }: { showWelcome: boolean }) {
  const [status, setStatus] = useState<BillingStatusOut | null>(null);
  const [loading, setLoading] = useState(true);
  const [redirecting, setRedirecting] = useState(false);
  const [error, setError] = useState("");
  const [plan, setPlan] = useState<"monthly" | "yearly">("monthly");

  async function load() {
    setLoading(true); setError("");
    try {
      setStatus(await billingApi.status());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load billing status");
    } finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  async function handleSetUpBilling() {
    setRedirecting(true); setError("");
    try {
      const { url } = await billingApi.checkoutSession(plan);
      window.location.href = url;
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to start checkout");
      setRedirecting(false);
    }
  }

  async function handleManageBilling() {
    setRedirecting(true); setError("");
    try {
      const { url } = await billingApi.portalSession();
      window.location.href = url;
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to open billing portal");
      setRedirecting(false);
    }
  }

  const hasSubscription = !!status?.status;

  return (
    <div className="max-w-lg space-y-6">
      {showWelcome && (
        <div className="bg-violet-50 border border-violet-200 rounded-xl px-4 py-3">
          <p className="text-sm font-medium text-violet-900">Welcome! One last step.</p>
          <p className="text-xs text-violet-700 mt-0.5">
            Property Copilot is $20/month with a 31-day free trial. Set up billing below whenever you're ready —
            you can also skip this for now and come back later.
          </p>
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Subscription</h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Property Copilot is $20/month, billed via Stripe, with a 31-day free trial for new accounts.
          </p>
        </div>

        {loading ? (
          <p className="text-xs text-slate-400">Loading…</p>
        ) : status?.billing_exempt ? (
          <div className="flex items-start gap-3">
            <span className="w-2 h-2 rounded-full bg-violet-500 mt-1.5 shrink-0" />
            <div>
              <p className="text-sm font-medium text-slate-900">Comped account</p>
              <p className="text-xs text-slate-400 mt-0.5">No billing required — this account has been comped by an admin.</p>
            </div>
          </div>
        ) : hasSubscription ? (
          <div className="flex items-start gap-3">
            <span className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${status?.cancel_at_period_end ? "bg-amber-500" : status?.status === "past_due" ? "bg-amber-500" : "bg-emerald-500"}`} />
            <div>
              <p className="text-sm font-medium text-slate-900">{BILLING_STATUS_LABELS[status?.status ?? ""] ?? status?.status}</p>
              {status?.trial_ends_at && (
                <p className="text-xs text-slate-400 mt-0.5">
                  Trial ends {new Date(status.trial_ends_at).toLocaleDateString()}
                </p>
              )}
              {status?.cancel_at_period_end && (
                <p className="text-xs text-amber-600 mt-0.5">
                  Cancellation scheduled — access continues until the date above, then won&apos;t renew.
                </p>
              )}
              {status?.status === "past_due" && (
                <p className="text-xs text-amber-600 mt-0.5">Your last payment failed — update your card to avoid interruption.</p>
              )}
            </div>
          </div>
        ) : (
          <div className="flex items-start gap-3">
            <span className="w-2 h-2 rounded-full bg-slate-300 mt-1.5 shrink-0" />
            <div>
              <p className="text-sm font-medium text-slate-900">No billing set up yet</p>
              <p className="text-xs text-slate-400 mt-0.5">Start your free trial — you won't be charged for 31 days.</p>
            </div>
          </div>
        )}

        {error && <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

        {!status?.billing_exempt && !hasSubscription && !loading && (
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setPlan("monthly")}
              className={`text-left rounded-lg border px-3 py-2.5 transition-colors ${plan === "monthly" ? "border-black bg-slate-50" : "border-slate-200 hover:border-slate-300"}`}>
              <p className="text-sm font-medium text-slate-900">Monthly</p>
              <p className="text-xs text-slate-400">$20/month CAD</p>
            </button>
            <button type="button" onClick={() => setPlan("yearly")}
              className={`text-left rounded-lg border px-3 py-2.5 transition-colors ${plan === "yearly" ? "border-black bg-slate-50" : "border-slate-200 hover:border-slate-300"}`}>
              <p className="text-sm font-medium text-slate-900">Yearly <span className="text-emerald-600 font-normal">save $40</span></p>
              <p className="text-xs text-slate-400">$200/year CAD</p>
            </button>
          </div>
        )}

        {!status?.billing_exempt && (
          hasSubscription ? (
            <button type="button" onClick={handleManageBilling} disabled={redirecting}
              className="px-4 py-2 text-sm bg-black text-white rounded-lg hover:bg-slate-800 font-medium disabled:opacity-50 transition-colors">
              {redirecting ? "Redirecting…" : "Manage billing"}
            </button>
          ) : (
            <button type="button" onClick={handleSetUpBilling} disabled={redirecting || loading}
              className="px-4 py-2 text-sm bg-black text-white rounded-lg hover:bg-slate-800 font-medium disabled:opacity-50 transition-colors">
              {redirecting ? "Redirecting…" : `Set up billing — ${plan === "yearly" ? "$200/yr" : "$20/mo"}`}
            </button>
          )
        )}
      </div>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<"profile" | "roles" | "marketing" | "screening" | "docusign" | "template" | "lease-template" | "billing">("profile");

  useEffect(() => {
    const t = searchParams.get("tab");
    if (t === "roles" || t === "marketing" || t === "profile" || t === "screening" || t === "docusign" || t === "template" || t === "lease-template" || t === "billing") setTab(t);
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
        {(["profile", "roles", "marketing", "screening", "docusign", "template", "lease-template", "billing"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium capitalize transition-colors border-b-2 -mb-px ${
              tab === t ? "border-black text-slate-900" : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            {t === "profile" ? "My profile" : t === "roles" ? "Role guide" : t === "marketing" ? "Marketing" : t === "screening" ? "Screening" : t === "docusign" ? "DocuSign" : t === "template" ? "Invite tenant template" : t === "lease-template" ? "Lease agreement template" : "Billing"}
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

      {/* Invite tenant template tab */}
      {tab === "template" && <InviteTemplateTab />}

      {/* Lease agreement template tab */}
      {tab === "lease-template" && <LeaseTemplateTab />}

      {/* Billing tab */}
      {tab === "billing" && <BillingTab showWelcome={searchParams.get("welcome") === "1"} />}

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
