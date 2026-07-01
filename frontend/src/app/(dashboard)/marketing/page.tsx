"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { campaignsApi, unitsApi, type CampaignOut, type CampaignStatus, type UnitDetailOut, type OrgFbSettingsOut } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { can } from "@/lib/roles";

// ─── Constants ─────────────────────────────────────────────────────────────────

const STATUS_LABEL: Record<CampaignStatus, string> = {
  DRAFT: "Draft", PUBLISHED: "Published", ARCHIVED: "Archived",
};
const STATUS_STYLE: Record<CampaignStatus, string> = {
  DRAFT: "bg-slate-100 text-slate-600",
  PUBLISHED: "bg-emerald-100 text-emerald-700",
  ARCHIVED: "bg-slate-100 text-slate-400",
};

const inp = "w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black";

function fmtDate(s: string | null) {
  if (!s) return "—";
  return new Date(s + "T00:00:00").toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" });
}

// ─── Facebook Credential Modal ─────────────────────────────────────────────────

function FbCredentialModal({
  current,
  onClose,
  onSave,
}: {
  current: OrgFbSettingsOut | null;
  onClose: () => void;
  onSave: (updated: OrgFbSettingsOut) => void;
}) {
  const [pageId, setPageId] = useState(current?.fb_page_id ?? "");
  const [token, setToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const isEdit = !!(current?.fb_page_id || current?.fb_page_token_set);

  // fb_page_id can be string | null — coerce to string for the input
  const pageIdStr = pageId ?? "";

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!pageIdStr.trim()) { setError("Page ID is required."); return; }
    if (!isEdit && !token.trim()) { setError("Page Access Token is required for new connections."); return; }
    setSaving(true); setError("");
    try {
      const body: { fb_page_id?: string; fb_page_token?: string } = { fb_page_id: pageIdStr.trim() };
      if (token.trim()) body.fb_page_token = token.trim();
      const res = await campaignsApi.saveFbSettings(body);
      onSave(res);
    } catch (err: any) { setError(err.message ?? "Failed to save"); }
    finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="text-base font-semibold">{isEdit ? "Edit Facebook credentials" : "Connect Facebook Page"}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
        </div>

        <form onSubmit={handleSave} className="px-6 py-5 space-y-4">
          {/* Instructions */}
          <div className="bg-slate-50 rounded-lg p-4 space-y-1 text-xs text-slate-600">
            <p className="font-medium text-slate-700 mb-1">How to get your credentials</p>
            <ol className="list-decimal list-inside space-y-1 text-slate-500">
              <li>Go to <strong>Meta for Developers</strong> → Graph API Explorer</li>
              <li>Select your Facebook Page from the dropdown</li>
              <li>Add permissions: <code className="bg-slate-200 px-1 rounded">pages_manage_posts</code>, <code className="bg-slate-200 px-1 rounded">pages_read_engagement</code></li>
              <li>Click <strong>Generate Access Token</strong> and copy it here</li>
              <li>Your Page ID is in Page Settings → About → Page ID</li>
            </ol>
          </div>

          {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}

          <div className="space-y-1">
            <label className="block text-xs font-medium text-slate-700">Facebook Page ID *</label>
            <input
              value={pageIdStr}
              onChange={e => setPageId(e.target.value)}
              placeholder="e.g. 123456789012345"
              className={inp}
            />
            <p className="text-[11px] text-slate-400">Found in your Page Settings → About → Page ID</p>
          </div>

          <div className="space-y-1">
            <label className="block text-xs font-medium text-slate-700">
              Page Access Token {isEdit ? <span className="font-normal text-slate-400">(leave blank to keep existing)</span> : "*"}
            </label>
            <div className="relative">
              <input
                type={showToken ? "text" : "password"}
                value={token}
                onChange={e => setToken(e.target.value)}
                placeholder={isEdit ? "••••••••••••  (unchanged)" : "Paste your token here"}
                className={`${inp} pr-10`}
              />
              <button type="button" onClick={() => setShowToken(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700">
                {showToken ? (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50">
              Cancel
            </button>
            <button type="submit" disabled={saving}
              className="flex-1 px-4 py-2 bg-[#1877F2] text-white rounded-lg text-sm font-medium hover:bg-[#166FE5] disabled:opacity-50">
              {saving ? "Saving…" : isEdit ? "Save changes" : "Connect Page"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Campaign Modal (Create / Edit) ────────────────────────────────────────────

function CampaignModal({
  campaign, units, onClose, onSave,
}: {
  campaign: CampaignOut | null;
  units: UnitDetailOut[];
  onClose: () => void;
  onSave: (c: CampaignOut) => void;
}) {
  const [form, setForm] = useState({
    title: campaign?.title ?? "",
    unit_id: campaign?.unit_id ?? "",
    description: campaign?.description ?? "",
    contact_name: campaign?.contact_name ?? "",
    contact_phone: campaign?.contact_phone ?? "",
    contact_email: campaign?.contact_email ?? "",
    available_from: campaign?.available_from ?? "",
    monthly_rent: campaign?.monthly_rent?.toString() ?? "",
  });
  const [photos, setPhotos] = useState<{ file: File; preview: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const MAX_PHOTOS = 20;

  function set(k: string, v: string) { setForm(f => ({ ...f, [k]: v })); }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title) { setError("Title is required."); return; }
    setSaving(true); setError("");
    try {
      const body = {
        title: form.title,
        unit_id: form.unit_id || null,
        description: form.description || null,
        contact_name: form.contact_name || null,
        contact_phone: form.contact_phone || null,
        contact_email: form.contact_email || null,
        available_from: form.available_from || null,
        monthly_rent: form.monthly_rent ? parseFloat(form.monthly_rent) : null,
      };
      let c = campaign
        ? await campaignsApi.update(campaign.id, body)
        : await campaignsApi.create(body);
      for (const p of photos) c = await campaignsApi.uploadPhoto(c.id, p.file);
      onSave(c);
    } catch (err: any) { setError(err.message ?? "Failed"); } finally { setSaving(false); }
  }

  const byProperty = units.reduce<Record<string, { name: string; units: UnitDetailOut[] }>>((acc, u) => {
    if (!acc[u.property_id]) acc[u.property_id] = { name: u.property_name, units: [] };
    acc[u.property_id].units.push(u);
    return acc;
  }, {});

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="text-base font-semibold">{campaign ? "Edit campaign" : "New campaign"}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl">×</button>
        </div>
        <form onSubmit={submit} className="px-6 py-5 space-y-4">
          {error && <p className="text-red-600 text-sm bg-red-50 px-3 py-2 rounded-lg">{error}</p>}

          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Campaign title *</label>
            <input value={form.title} onChange={e => set("title", e.target.value)} placeholder="2BR Available in Downtown" className={inp} required />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Unit (optional)</label>
            <select value={form.unit_id} onChange={e => set("unit_id", e.target.value)} className={inp}>
              <option value="">— no specific unit —</option>
              {Object.values(byProperty).map(prop => (
                <optgroup key={prop.name} label={prop.name}>
                  {prop.units.map(u => (
                    <option key={u.id} value={u.id}>
                      Unit {u.unit_number} — {u.bedrooms}bd · ${u.monthly_rent.toLocaleString()}/mo {u.tenant_name ? `(${u.tenant_name})` : "(Vacant)"}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Description / marketing copy</label>
            <textarea value={form.description} onChange={e => set("description", e.target.value)} rows={4}
              placeholder="Describe the unit, amenities, neighbourhood…" className={`${inp} resize-none`} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Monthly rent ($)</label>
              <input type="number" min="0" value={form.monthly_rent} onChange={e => set("monthly_rent", e.target.value)} placeholder="2500" className={inp} />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Available from</label>
              <input type="date" value={form.available_from} onChange={e => set("available_from", e.target.value)} className={inp} />
            </div>
          </div>

          <div className="border-t border-slate-100 pt-3">
            <p className="text-[11px] uppercase tracking-wider font-medium text-slate-400 mb-2">Contact info</p>
            <div className="space-y-2.5">
              <input value={form.contact_name} onChange={e => set("contact_name", e.target.value)} placeholder="Contact name" className={inp} />
              <div className="grid grid-cols-2 gap-3">
                <input value={form.contact_phone} onChange={e => set("contact_phone", e.target.value)} placeholder="Phone" className={inp} />
                <input type="email" value={form.contact_email} onChange={e => set("contact_email", e.target.value)} placeholder="Email" className={inp} />
              </div>
            </div>
          </div>

          {!campaign && (
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">
                Photos <span className="text-slate-400 font-normal">({photos.length}/{MAX_PHOTOS})</span>
              </label>
              <div className="border border-dashed border-slate-200 rounded-lg p-3 space-y-3">
                {photos.length > 0 && (
                  <div className="grid grid-cols-4 gap-2">
                    {photos.map((p, i) => (
                      <div key={i} className="relative group aspect-square rounded-lg overflow-hidden border border-slate-200">
                        <img src={p.preview} alt="" className="w-full h-full object-cover" />
                        <button type="button"
                          onClick={() => setPhotos(ps => { URL.revokeObjectURL(ps[i].preview); return ps.filter((_, j) => j !== i); })}
                          className="absolute top-1 right-1 w-5 h-5 bg-black/60 text-white rounded-full text-xs opacity-0 group-hover:opacity-100 flex items-center justify-center hover:bg-red-600 transition-opacity">
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                {photos.length < MAX_PHOTOS && (
                  <>
                    <button type="button" onClick={() => fileRef.current?.click()}
                      className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-black">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                      Add photos {photos.length > 0 && `(${MAX_PHOTOS - photos.length} remaining)`}
                    </button>
                    <input ref={fileRef} type="file" multiple accept="image/jpeg,image/png,image/webp" className="hidden"
                      onChange={e => {
                        if (!e.target.files) return;
                        const incoming = Array.from(e.target.files).slice(0, MAX_PHOTOS - photos.length);
                        setPhotos(ps => [...ps, ...incoming.map(f => ({ file: f, preview: URL.createObjectURL(f) }))]);
                        e.target.value = "";
                      }} />
                  </>
                )}
              </div>
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50">Cancel</button>
            <button type="submit" disabled={saving} className="flex-1 px-4 py-2 bg-black text-white rounded-lg text-sm font-medium hover:bg-slate-800 disabled:opacity-50">
              {saving ? "Saving…" : campaign ? "Save changes" : "Create campaign"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Campaign Card ──────────────────────────────────────────────────────────────

function CampaignCard({
  campaign, canManage, onEdit, onUpdate, onDelete,
}: {
  campaign: CampaignOut;
  canManage: boolean;
  onEdit: () => void;
  onUpdate: (c: CampaignOut) => void;
  onDelete: () => void;
}) {
  const [publishing, setPublishing] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [error, setError] = useState("");
  const photoRef = useRef<HTMLInputElement>(null);

  async function publish() {
    setPublishing(true); setError("");
    try { onUpdate(await campaignsApi.publish(campaign.id)); }
    catch (err: any) { setError(err.message ?? "Failed to publish"); }
    finally { setPublishing(false); }
  }

  async function archive() {
    setArchiving(true); setError("");
    try { onUpdate(await campaignsApi.archive(campaign.id)); }
    catch (err: any) { setError(err.message ?? "Failed"); }
    finally { setArchiving(false); }
  }

  const MAX_PHOTOS = 20;
  const atLimit = campaign.photos.length >= MAX_PHOTOS;

  async function handlePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []).slice(0, MAX_PHOTOS - campaign.photos.length);
    if (!files.length) return;
    setUploading(true);
    try {
      let updated = campaign;
      for (const file of files) updated = await campaignsApi.uploadPhoto(updated.id, file);
      onUpdate(updated);
    } catch { /* silent */ } finally { setUploading(false); if (photoRef.current) photoRef.current.value = ""; }
  }

  async function removePhoto(url: string) {
    const filename = url.split("/").pop()!;
    setDeleting(filename);
    try {
      const updated = await campaignsApi.deletePhoto(campaign.id, filename);
      onUpdate(updated as CampaignOut);
    } catch { /* silent */ } finally { setDeleting(null); }
  }

  const isDraft = campaign.status === "DRAFT";
  const isPublished = campaign.status === "PUBLISHED";
  const isArchived = campaign.status === "ARCHIVED";

  return (
    <div className={`bg-white rounded-xl border shadow-sm overflow-hidden flex flex-col ${isArchived ? "opacity-60 border-slate-100" : "border-slate-200"}`}>
      {campaign.photos.length > 0 && (
        <div className="shrink-0">
          {/* Hero — first photo */}
          <div className="relative group h-44 overflow-hidden">
            <img src={campaign.photos[0]} alt="" className="w-full h-full object-cover" />
            {canManage && !isArchived && (
              <button onClick={() => removePhoto(campaign.photos[0])} disabled={deleting === campaign.photos[0].split("/").pop()}
                className="absolute top-1.5 right-1.5 w-5 h-5 bg-black/60 text-white rounded-full text-xs opacity-0 group-hover:opacity-100 flex items-center justify-center hover:bg-red-600 transition-opacity">
                ×
              </button>
            )}
            <span className="absolute bottom-1.5 right-2 text-[10px] text-white/80 bg-black/40 rounded px-1.5 py-0.5">
              {campaign.photos.length} photo{campaign.photos.length !== 1 ? "s" : ""}
            </span>
          </div>
          {/* Thumbnail strip — remaining photos */}
          {campaign.photos.length > 1 && (
            <div className="flex gap-1 p-1 overflow-x-auto bg-slate-50 border-t border-slate-100">
              {campaign.photos.slice(1).map((url, i) => (
                <div key={i} className="relative group shrink-0 w-14 h-14 rounded overflow-hidden border border-slate-200">
                  <img src={url} alt="" className="w-full h-full object-cover" />
                  {canManage && !isArchived && (
                    <button onClick={() => removePhoto(url)} disabled={deleting === url.split("/").pop()}
                      className="absolute inset-0 bg-black/40 text-white text-sm opacity-0 group-hover:opacity-100 flex items-center justify-center hover:bg-red-600/70 transition-opacity">
                      ×
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="px-5 py-4 space-y-3 flex-1 flex flex-col">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-semibold text-slate-900 truncate">{campaign.title}</h3>
              <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium shrink-0 ${STATUS_STYLE[campaign.status]}`}>
                {STATUS_LABEL[campaign.status]}
              </span>
            </div>
            {(campaign.property_name || campaign.unit_number) && (
              <p className="text-xs text-slate-400 mt-0.5 truncate">
                {[campaign.property_name, campaign.unit_number ? `Unit ${campaign.unit_number}` : null].filter(Boolean).join(" · ")}
              </p>
            )}
          </div>
          {campaign.monthly_rent != null && (
            <p className="text-base font-bold text-slate-900 shrink-0">
              ${campaign.monthly_rent.toLocaleString()}<span className="text-xs font-normal text-slate-400">/mo</span>
            </p>
          )}
        </div>

        {campaign.description && (
          <p className="text-xs text-slate-600 line-clamp-2 flex-1">{campaign.description}</p>
        )}

        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
          {campaign.available_from && <span>📅 Available {fmtDate(campaign.available_from)}</span>}
          {campaign.contact_name && (
            <span>📞 {campaign.contact_name}{campaign.contact_phone ? ` · ${campaign.contact_phone}` : ""}</span>
          )}
        </div>

        {isPublished && campaign.fb_post_id && (
          <div className="bg-blue-50 border border-blue-100 rounded-lg px-3 py-2 flex items-center gap-2">
            <svg className="w-4 h-4 text-blue-600 shrink-0" fill="currentColor" viewBox="0 0 24 24">
              <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
            </svg>
            <span className="text-xs text-blue-700">Posted to Facebook</span>
            <a href={`https://www.facebook.com/${campaign.fb_post_id}`} target="_blank" rel="noopener noreferrer"
              className="ml-auto text-xs text-blue-600 hover:underline shrink-0">View →</a>
          </div>
        )}

        {error && <p className="text-xs text-red-600 bg-red-50 px-2 py-1 rounded">{error}</p>}

        {canManage && !isArchived && (
          <div className="flex items-center gap-2 pt-1 flex-wrap mt-auto">
            <input ref={photoRef} type="file" multiple accept="image/jpeg,image/png,image/webp" className="hidden"
              onChange={handlePhoto} id={`photo-${campaign.id}`} />
            <label htmlFor={`photo-${campaign.id}`}
              className={`inline-flex items-center gap-1 px-3 py-1.5 border rounded-lg text-xs cursor-pointer transition-colors ${
                atLimit || uploading
                  ? "border-slate-100 text-slate-300 pointer-events-none"
                  : "border-slate-200 text-slate-600 hover:bg-slate-50"
              }`}
              title={atLimit ? "Maximum 20 photos reached" : undefined}>
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              {uploading ? "Uploading…" : atLimit ? "20/20 photos" : `Add photo (${campaign.photos.length}/20)`}
            </label>

            {isDraft && (
              <button onClick={onEdit} className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs text-slate-600 hover:bg-slate-50">
                Edit
              </button>
            )}

            {isDraft && (
              <button onClick={publish} disabled={publishing}
                className="flex-1 px-3 py-1.5 bg-[#1877F2] text-white text-xs font-medium rounded-lg hover:bg-[#166FE5] disabled:opacity-50 flex items-center justify-center gap-1.5">
                <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                </svg>
                {publishing ? "Posting…" : "Post to Facebook"}
              </button>
            )}

            {(isDraft || isPublished) && (
              <button onClick={archive} disabled={archiving}
                className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs text-slate-500 hover:bg-slate-50 disabled:opacity-50">
                {archiving ? "…" : "Archive"}
              </button>
            )}

            {isDraft && (
              <button onClick={onDelete} className="px-3 py-1.5 border border-red-200 rounded-lg text-xs text-red-500 hover:bg-red-50">
                Delete
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Page ───────────────────────────────────────────────────────────────────────

type Tab = "DRAFT" | "PUBLISHED" | "ARCHIVED";

export default function MarketingPage() {
  const { user } = useAuth();
  const perms = can(user?.role);
  const [campaigns, setCampaigns] = useState<CampaignOut[]>([]);
  const [units, setUnits] = useState<UnitDetailOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("DRAFT");
  const [modal, setModal] = useState<"create" | CampaignOut | null>(null);
  const [fbSettings, setFbSettings] = useState<OrgFbSettingsOut | null>(null);
  const [fbModal, setFbModal] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  const load = useCallback(async () => {
    try {
      const [cs, us, fb] = await Promise.all([
        campaignsApi.list(),
        unitsApi.listAll().catch(() => []),
        campaignsApi.getFbSettings().catch(() => null),
      ]);
      setCampaigns(cs);
      setUnits(us);
      setFbSettings(fb);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  function handleSave(c: CampaignOut) {
    setCampaigns(prev => {
      const idx = prev.findIndex(x => x.id === c.id);
      return idx >= 0 ? prev.map((x, i) => i === idx ? c : x) : [c, ...prev];
    });
    setModal(null);
  }

  async function handleDelete(c: CampaignOut) {
    if (!confirm(`Delete campaign "${c.title}"?`)) return;
    try {
      await campaignsApi.remove(c.id);
      setCampaigns(prev => prev.filter(x => x.id !== c.id));
    } catch { /* silent */ }
  }

  async function handleDisconnect() {
    if (!confirm("Disconnect Facebook? This will remove your Page ID and Access Token.")) return;
    setDisconnecting(true);
    try {
      const res = await campaignsApi.saveFbSettings({ fb_page_id: "", fb_page_token: "" });
      setFbSettings(res);
    } catch { /* silent */ } finally { setDisconnecting(false); }
  }

  const isConnected = !!(fbSettings?.fb_page_id || fbSettings?.fb_page_token_set);

  const byStatus: Record<Tab, CampaignOut[]> = {
    DRAFT: campaigns.filter(c => c.status === "DRAFT"),
    PUBLISHED: campaigns.filter(c => c.status === "PUBLISHED"),
    ARCHIVED: campaigns.filter(c => c.status === "ARCHIVED"),
  };

  const tabs: [Tab, string][] = [
    ["DRAFT", `Drafts (${byStatus.DRAFT.length})`],
    ["PUBLISHED", `Published (${byStatus.PUBLISHED.length})`],
    ["ARCHIVED", `Archived (${byStatus.ARCHIVED.length})`],
  ];

  return (
    <div className="max-w-[1100px] mx-auto px-6 py-6 space-y-5">
      <div className="flex items-end justify-between">
        <div>
          <p className="text-[11px] uppercase tracking-widest text-slate-400 font-medium">Growth</p>
          <h1 className="text-xl font-bold text-slate-900 mt-0.5">Marketing</h1>
        </div>
        {perms.manageMaintenance && (
          <button onClick={() => setModal("create")} className="px-4 py-2 bg-black text-white text-sm font-medium rounded-xl hover:bg-slate-800">
            + New campaign
          </button>
        )}
      </div>

      {/* Facebook credentials bar */}
      {perms.manageMaintenance && (
        <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border text-sm ${
          isConnected
            ? "bg-[#1877F2]/5 border-[#1877F2]/20"
            : "bg-amber-50 border-amber-200"
        }`}>
          <svg className={`w-5 h-5 shrink-0 ${isConnected ? "text-[#1877F2]" : "text-amber-500"}`} fill="currentColor" viewBox="0 0 24 24">
            <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
          </svg>

          {isConnected ? (
            <>
              <div className="flex-1 min-w-0">
                <span className="font-medium text-slate-800">Facebook connected</span>
                {fbSettings?.fb_page_id && (
                  <span className="text-slate-500 ml-2 text-xs">Page ID: {fbSettings.fb_page_id}</span>
                )}
              </div>
              <button onClick={() => setFbModal(true)}
                className="px-3 py-1.5 text-xs font-medium border border-[#1877F2]/30 text-[#1877F2] rounded-lg hover:bg-[#1877F2]/10 transition-colors">
                Edit
              </button>
              <button onClick={handleDisconnect} disabled={disconnecting}
                className="px-3 py-1.5 text-xs font-medium border border-red-200 text-red-500 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50">
                {disconnecting ? "…" : "Disconnect"}
              </button>
            </>
          ) : (
            <>
              <div className="flex-1">
                <span className="font-medium text-amber-800">Facebook not connected</span>
                <span className="text-amber-700 ml-2 text-xs">Connect a Facebook Page to post campaigns.</span>
              </div>
              <button onClick={() => setFbModal(true)}
                className="px-3 py-1.5 text-xs font-medium bg-[#1877F2] text-white rounded-lg hover:bg-[#166FE5] transition-colors">
                Connect Facebook
              </button>
            </>
          )}
        </div>
      )}

      <div className="flex gap-1 border-b border-slate-200">
        {tabs.map(([t, label]) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${tab === t ? "border-black text-black" : "border-transparent text-slate-500 hover:text-slate-700"}`}>
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-6 h-6 border-2 border-black border-t-transparent rounded-full animate-spin" />
        </div>
      ) : byStatus[tab].length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-slate-200">
          <p className="text-slate-400 text-sm">
            {tab === "DRAFT" ? "No draft campaigns yet." : tab === "PUBLISHED" ? "No published campaigns yet." : "No archived campaigns."}
          </p>
          {tab === "DRAFT" && perms.manageMaintenance && (
            <button onClick={() => setModal("create")} className="mt-4 px-4 py-2 bg-black text-white text-sm font-medium rounded-xl hover:bg-slate-800">
              + New campaign
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {byStatus[tab].map(c => (
            <CampaignCard
              key={c.id}
              campaign={c}
              canManage={perms.manageMaintenance}
              onEdit={() => setModal(c)}
              onUpdate={handleSave}
              onDelete={() => handleDelete(c)}
            />
          ))}
        </div>
      )}

      {modal !== null && (
        <CampaignModal
          campaign={modal === "create" ? null : modal as CampaignOut}
          units={units}
          onClose={() => setModal(null)}
          onSave={handleSave}
        />
      )}

      {fbModal && (
        <FbCredentialModal
          current={fbSettings ? { fb_page_id: fbSettings.fb_page_id ?? "", fb_page_token_set: fbSettings.fb_page_token_set } : null}
          onClose={() => setFbModal(false)}
          onSave={updated => { setFbSettings(updated); setFbModal(false); }}
        />
      )}
    </div>
  );
}
