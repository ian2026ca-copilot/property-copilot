"use client";

import React, { useState, useEffect, useRef } from "react";
import { campaignsApi, imagesApi, type CampaignOut, type CampaignStatus, type UnitDetailOut, type ImageOut, type MarketingSiteOut } from "@/lib/api";

// ─── Constants ─────────────────────────────────────────────────────────────────

export const STATUS_LABEL: Record<CampaignStatus, string> = {
  DRAFT: "Draft", PUBLISHED: "Published", ARCHIVED: "Archived",
};
export const STATUS_STYLE: Record<CampaignStatus, string> = {
  DRAFT: "bg-slate-100 text-slate-600",
  PUBLISHED: "bg-emerald-100 text-emerald-700",
  ARCHIVED: "bg-slate-100 text-slate-400",
};

const inp = "w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black";

export function fmtDate(s: string | null) {
  if (!s) return "—";
  return new Date(s + "T00:00:00").toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" });
}

const UTILITY_OPTIONS = ["Heat", "Electricity", "Water", "Cable", "Internet", "Satellite"];
const PARKING_TYPE_OPTIONS = ["Parallel", "Tandem"];
const PARKING_TENANT_OPTIONS = ["Outdoor", "Indoor", "Street", "Driveway", "Covered", "Garage", "Underground"];
export const HOME_FEATURE_OPTIONS = [
  "Dishwasher", "Front Door", "Microwave", "Fridge", "Laundry in Suite", "Fireplace",
  "Skylight", "Wireless Internet", "Continuous Water", "Subway", "Patio/Deck", "Storage",
  "Fenced Yard", "Air Conditioning",
];
export const NEIGHBORHOOD_FEATURE_OPTIONS = [
  "Bike Route", "Gym", "Golf Course", "Playground/Park", "Public Library",
  "Pool", "Shopping Center", "Sports Courts", "Tennis Courts",
];
const LEASE_TERM_OPTIONS = ["Long Term", "Short Term", "Negotiable"];
const FURNISHING_OPTIONS = ["Furnished", "Unfurnished", "Negotiable"];
const SMOKING_OPTIONS = ["Non-Smoking", "Smoking Allowed"];
const PETS_OPTIONS = ["No Pets", "Cats Negotiable", "Dogs Negotiable", "Cats & Dogs Negotiable", "Pets Allowed"];

export function toggleTag(setList: React.Dispatch<React.SetStateAction<string[]>>, value: string) {
  setList(prev => prev.includes(value) ? prev.filter(v => v !== value) : [...prev, value]);
}

export function TagPicker({ options, selected, onToggle, allowCustom, customPlaceholder }: {
  options: string[]; selected: string[]; onToggle: (v: string) => void;
  allowCustom?: boolean; customPlaceholder?: string;
}) {
  const [custom, setCustom] = useState("");
  const extra = selected.filter(s => !options.includes(s));
  return (
    <div className="flex flex-wrap gap-1.5 items-center">
      {options.map(o => (
        <button key={o} type="button" onClick={() => onToggle(o)}
          className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${selected.includes(o) ? "bg-black text-white border-black" : "border-slate-200 text-slate-600 hover:border-slate-400"}`}>
          {o}
        </button>
      ))}
      {extra.map(o => (
        <button key={o} type="button" onClick={() => onToggle(o)}
          className="px-2.5 py-1 rounded-full text-xs bg-black text-white border border-black">
          {o} ×
        </button>
      ))}
      {allowCustom && (
        <input value={custom} onChange={e => setCustom(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && custom.trim()) { e.preventDefault(); onToggle(custom.trim()); setCustom(""); } }}
          placeholder={customPlaceholder ?? "+ Add"}
          className="w-32 text-xs border border-dashed border-slate-300 rounded-full px-2.5 py-1 focus:outline-none focus:border-slate-500" />
      )}
    </div>
  );
}

// ─── Description formatting (lightweight markdown: **bold**, ## heading, - bullet) ─

// Strips markdown syntax down to clean plain text for platforms (Facebook, RentFaster)
// that don't render markdown — bullets become "•", headings become their own line.
function markdownToPlainText(md: string): string {
  return md
    .split("\n")
    .map(line => {
      const heading = line.match(/^#{1,3}\s+(.*)/);
      if (heading) return heading[1];
      const bullet = line.match(/^[-*]\s+(.*)/);
      if (bullet) return `• ${bullet[1]}`;
      return line;
    })
    .join("\n")
    .replace(/\*\*(.+?)\*\*/g, "$1");
}

// ─── Campaign Modal (Create / Edit) ────────────────────────────────────────────

export function CampaignModal({
  campaign, units, onClose, onSave, onPhotosChanged, onDelete, initialUnitId,
}: {
  campaign: CampaignOut | null;
  units: UnitDetailOut[];
  onClose: () => void;
  onSave: (c: CampaignOut) => void;
  onPhotosChanged: (c: CampaignOut) => void;
  onDelete?: () => void;
  initialUnitId?: string;
}) {
  const [form, setForm] = useState({
    title: campaign?.title ?? "",
    unit_id: campaign?.unit_id ?? initialUnitId ?? "",
    description: campaign?.description ?? "",
    contact_name: campaign?.contact_name ?? "",
    contact_phone: campaign?.contact_phone ?? "",
    contact_email: campaign?.contact_email ?? "",
    available_from: campaign?.available_from ?? "",
    monthly_rent: campaign?.monthly_rent?.toString() ?? "",
    security_deposit: campaign?.security_deposit?.toString() ?? "",
    lease_term: campaign?.lease_term ?? "",
    furnishing: campaign?.furnishing ?? "",
    smoking_policy: campaign?.smoking_policy ?? "",
    pets_policy: campaign?.pets_policy ?? "",
  });
  const [photos, setPhotos] = useState<{ file: File; preview: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const MAX_PHOTOS = 20;

  const [utilitiesIncluded, setUtilitiesIncluded] = useState<string[]>(campaign?.utilities_included ?? []);
  const [parkingAvailable, setParkingAvailable] = useState<boolean | null>(campaign?.parking_available ?? null);
  const [parkingTotalSpaces, setParkingTotalSpaces] = useState(campaign?.parking_details?.total_spaces?.toString() ?? "");
  const [parkingTypes, setParkingTypes] = useState<string[]>(campaign?.parking_details?.types ?? []);
  const [parkingTenantOptions, setParkingTenantOptions] = useState<string[]>(campaign?.parking_details?.tenant_options ?? []);
  const [parkingGarageFee, setParkingGarageFee] = useState(campaign?.parking_details?.garage_monthly_fee?.toString() ?? "");
  const [parkingNotes, setParkingNotes] = useState(campaign?.parking_details?.notes ?? "");
  const [homeFeatures, setHomeFeatures] = useState<string[]>(campaign?.home_features ?? []);
  const [neighborhoodFeatures, setNeighborhoodFeatures] = useState<string[]>(campaign?.neighborhood_features ?? []);

  const [showAiPanel, setShowAiPanel] = useState(false);
  const [aiInstructions, setAiInstructions] = useState("");
  const [generating, setGenerating] = useState(false);
  const [aiError, setAiError] = useState("");
  const [suggestedRent, setSuggestedRent] = useState<number | null>(null);

  const [unitImages, setUnitImages] = useState<ImageOut[]>([]);
  const [loadingUnitImages, setLoadingUnitImages] = useState(false);

  const descRef = useRef<HTMLTextAreaElement>(null);
  const [descCopied, setDescCopied] = useState(false);

  function handleCopyDescription() {
    navigator.clipboard.writeText(markdownToPlainText(form.description))
      .then(() => { setDescCopied(true); setTimeout(() => setDescCopied(false), 2000); })
      .catch(() => {});
  }

  function applyDescFormat(type: "bold" | "heading" | "bullet") {
    const el = descRef.current;
    if (!el) return;
    const { selectionStart: start, selectionEnd: end, value } = el;
    let newValue: string, newStart: number, newEnd: number;

    if (type === "bold") {
      const inner = value.slice(start, end) || "bold text";
      newValue = value.slice(0, start) + `**${inner}**` + value.slice(end);
      newStart = start + 2;
      newEnd = newStart + inner.length;
    } else if (type === "heading") {
      const lineStart = value.lastIndexOf("\n", start - 1) + 1;
      const lineEndIdx = value.indexOf("\n", start);
      const lineEnd = lineEndIdx === -1 ? value.length : lineEndIdx;
      const line = value.slice(lineStart, lineEnd);
      const newLine = /^##\s+/.test(line) ? line.replace(/^##\s+/, "") : `## ${line}`;
      newValue = value.slice(0, lineStart) + newLine + value.slice(lineEnd);
      newStart = lineStart;
      newEnd = lineStart + newLine.length;
    } else {
      const blockStart = value.lastIndexOf("\n", start - 1) + 1;
      const blockEndIdx = value.indexOf("\n", end - 1);
      const blockEnd = blockEndIdx === -1 ? value.length : blockEndIdx;
      const block = value.slice(blockStart, blockEnd);
      const newBlock = block.split("\n").map(l => l.startsWith("- ") ? l.slice(2) : `- ${l}`).join("\n");
      newValue = value.slice(0, blockStart) + newBlock + value.slice(blockEnd);
      newStart = blockStart;
      newEnd = blockStart + newBlock.length;
    }

    set("description", newValue);
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(newStart, newEnd); });
  }

  function insertDescDetails() {
    const unit = units.find(u => u.id === form.unit_id);
    const address = campaign ? liveCampaign?.property_address : unit?.property_address;
    const rent = form.monthly_rent ? `$${Number(form.monthly_rent).toLocaleString()}/mo` : null;
    const contactParts = [form.contact_name, form.contact_phone, form.contact_email].filter(Boolean);

    const lines = [
      address ? `Location: ${address}` : null,
      rent ? `Rent: ${rent}` : null,
      form.available_from ? `Available: ${fmtDate(form.available_from)}` : null,
      contactParts.length ? `Contact: ${contactParts.join(" · ")}` : null,
    ].filter((l): l is string => l !== null);
    if (!lines.length) return;

    const sep = form.description ? (form.description.endsWith("\n") ? "" : "\n\n") : "";
    const newValue = form.description + sep + lines.join("\n");
    set("description", newValue);
    const el = descRef.current;
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(newValue.length, newValue.length); });
  }

  useEffect(() => {
    if (campaign || !form.unit_id) { setUnitImages([]); return; }
    const unit = units.find(u => u.id === form.unit_id);
    if (!unit) { setUnitImages([]); return; }
    let cancelled = false;
    setLoadingUnitImages(true);
    imagesApi.listUnit(unit.property_id, unit.id)
      .then(imgs => { if (!cancelled) setUnitImages(imgs); })
      .catch(() => { if (!cancelled) setUnitImages([]); })
      .finally(() => { if (!cancelled) setLoadingUnitImages(false); });
    return () => { cancelled = true; };
  }, [form.unit_id, campaign, units]);

  // Edit mode: the campaign prop is a stale snapshot from when the modal was
  // opened. Photos, status, and Facebook post id all change live (immediately,
  // not deferred to "Save changes"), so they're tracked here and pushed up via
  // onPhotosChanged without closing the modal — mirroring how the parent's
  // own list is kept in sync.
  const [liveCampaign, setLiveCampaign] = useState<CampaignOut | null>(campaign);
  const existingPhotos = liveCampaign?.photos ?? [];
  const [editUploading, setEditUploading] = useState(false);
  const [editDeleting, setEditDeleting] = useState<string | null>(null);
  const [editPhotoError, setEditPhotoError] = useState("");
  const editPhotoRef = useRef<HTMLInputElement>(null);
  const MAX_EDIT_PHOTOS = 20;

  const [archiving, setArchiving] = useState(false);
  const [postError, setPostError] = useState("");
  const [postPlatform, setPostPlatform] = useState<string>("");
  const [sites, setSites] = useState<MarketingSiteOut[]>([]);
  const [siteStatus, setSiteStatus] = useState<Record<string, "copied" | "tab-only" | "blocked" | null>>({});

  useEffect(() => {
    campaignsApi.listMarketingSites().then(list => {
      setSites(list);
      setPostPlatform(p => p || list[0]?.id || "");
    }).catch(() => {});
  }, []);

  async function handleEditUpload(e: React.ChangeEvent<HTMLInputElement>) {
    if (!liveCampaign) return;
    const files = Array.from(e.target.files ?? []).slice(0, MAX_EDIT_PHOTOS - existingPhotos.length);
    if (!files.length) return;
    setEditUploading(true); setEditPhotoError("");
    try {
      let updated = liveCampaign;
      for (const file of files) updated = await campaignsApi.uploadPhoto(updated.id, file);
      setLiveCampaign(updated);
      onPhotosChanged(updated);
    } catch (err: any) {
      setEditPhotoError(err.message ?? "Upload failed");
    } finally {
      setEditUploading(false);
      if (editPhotoRef.current) editPhotoRef.current.value = "";
    }
  }

  async function handleEditRemove(url: string) {
    if (!liveCampaign) return;
    const filename = url.split("/").pop()!;
    setEditDeleting(filename); setEditPhotoError("");
    try {
      const updated = await campaignsApi.deletePhoto(liveCampaign.id, filename);
      setLiveCampaign(updated);
      onPhotosChanged(updated);
    } catch (err: any) {
      setEditPhotoError(err.message ?? "Delete failed");
    } finally {
      setEditDeleting(null);
    }
  }

  async function handleArchive() {
    if (!liveCampaign) return;
    setArchiving(true); setPostError("");
    try {
      const updated = await campaignsApi.archive(liveCampaign.id);
      setLiveCampaign(updated);
      onPhotosChanged(updated);
    } catch (err: any) { setPostError(err.message ?? "Failed"); }
    finally { setArchiving(false); }
  }

  function handlePostToSite(site: MarketingSiteOut) {
    if (!liveCampaign) return;
    const c = liveCampaign;
    // window.open must run synchronously inside the click handler — awaiting
    // the clipboard write first breaks the user-gesture chain and gets the
    // popup silently blocked in some browsers.
    const opened = window.open(site.url, "_blank", "noopener,noreferrer");

    const lines = [
      c.title,
      "",
      markdownToPlainText(c.description || ""),
      "",
      c.monthly_rent != null ? `Rent: $${c.monthly_rent.toLocaleString()}/mo` : null,
      c.available_from ? `Available: ${fmtDate(c.available_from)}` : null,
      c.property_address ? `Address: ${c.property_address}` : null,
      [c.contact_name, c.contact_phone, c.contact_email].some(Boolean)
        ? `Contact: ${[c.contact_name, c.contact_phone, c.contact_email].filter(Boolean).join(" · ")}`
        : null,
      c.photos.length
        ? `\nPhotos (attach these to your listing):\n${c.photos.join("\n")}`
        : null,
    ].filter((l): l is string => l !== null).join("\n");

    navigator.clipboard.writeText(lines)
      .then(() => setSiteStatus(s => ({ ...s, [site.id]: "copied" })))
      .catch(() => setSiteStatus(s => ({ ...s, [site.id]: opened ? "tab-only" : "blocked" })));
    setTimeout(() => setSiteStatus(s => ({ ...s, [site.id]: null })), 3000);
  }

  function set(k: string, v: string) { setForm(f => ({ ...f, [k]: v })); }

  async function handleAiGenerate() {
    setGenerating(true); setAiError("");
    try {
      const result = await campaignsApi.aiGenerate({
        unit_id: form.unit_id || undefined,
        extra_instructions: aiInstructions || undefined,
        monthly_rent: form.monthly_rent ? Number(form.monthly_rent) : undefined,
        available_from: form.available_from || undefined,
        contact_name: form.contact_name || undefined,
        contact_phone: form.contact_phone || undefined,
        contact_email: form.contact_email || undefined,
        existing_photo_filenames: campaign ? existingPhotos.map(url => url.split("/").pop()!) : undefined,
        files: !campaign ? photos.map(p => p.file) : undefined,
      });
      set("title", result.title);
      set("description", result.description);
      setSuggestedRent(result.suggested_rent);
    } catch (err: any) {
      setAiError(err.message ?? "Failed to generate");
    } finally {
      setGenerating(false);
    }
  }

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
        security_deposit: form.security_deposit ? parseFloat(form.security_deposit) : null,
        lease_term: form.lease_term || null,
        furnishing: form.furnishing || null,
        smoking_policy: form.smoking_policy || null,
        pets_policy: form.pets_policy || null,
        utilities_included: utilitiesIncluded,
        parking_available: parkingAvailable,
        parking_details: parkingAvailable ? {
          total_spaces: parkingTotalSpaces ? parseInt(parkingTotalSpaces) : null,
          types: parkingTypes,
          tenant_options: parkingTenantOptions,
          garage_monthly_fee: parkingGarageFee ? parseFloat(parkingGarageFee) : null,
          notes: parkingNotes || null,
        } : null,
        home_features: homeFeatures,
        neighborhood_features: neighborhoodFeatures,
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
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold">{campaign ? "Edit campaign" : "New campaign"}</h2>
            {liveCampaign && (
              <span className={`inline-flex px-2 py-0.5 rounded-full text-[12px] font-medium ${STATUS_STYLE[liveCampaign.status]}`}>
                {STATUS_LABEL[liveCampaign.status]}
              </span>
            )}
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl">×</button>
        </div>

        {liveCampaign && (
          <div className="px-6 py-3 border-b border-slate-100 space-y-2">
            {postError && <p className="text-red-600 text-xs bg-red-50 px-2 py-1.5 rounded-lg">{postError}</p>}
            {liveCampaign.status === "PUBLISHED" && liveCampaign.fb_post_id && (
              <a href={`https://www.facebook.com/${liveCampaign.fb_post_id}`} target="_blank" rel="noopener noreferrer"
                className="text-xs text-blue-600 hover:underline block">Posted to Facebook — view →</a>
            )}
            <div className="flex items-center gap-2 flex-wrap">
              {(() => {
                const sitesAvailable = liveCampaign.status === "DRAFT" || liveCampaign.status === "PUBLISHED";
                if (!sitesAvailable || sites.length === 0) return null;
                const site = sites.find(s => s.id === postPlatform) ?? sites[0];
                const status = siteStatus[site.id];
                const label = status === "copied" ? "Copied!" : status === "tab-only" ? "Opened (copy manually)" : status === "blocked" ? "Popup blocked" : "Post";
                const title = `Copies the listing details to your clipboard and opens ${site.name} in a new tab, so you paste it in yourself`;
                return (
                  <>
                    <select value={site.id} onChange={e => setPostPlatform(e.target.value)}
                      className="px-2 py-1.5 border border-slate-200 rounded-lg text-xs text-slate-600 bg-white focus:outline-none focus:ring-2 focus:ring-black">
                      {sites.map(s => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                    <button type="button" onClick={() => handlePostToSite(site)} title={title}
                      className="px-3 py-1.5 bg-black text-white text-xs font-medium rounded-lg hover:bg-slate-800 flex items-center gap-1.5">
                      {site.name === "Facebook" ? (
                        <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                        </svg>
                      ) : site.name === "RentFaster" ? "🏠" : site.name === "Kijiji" ? "📋" : "🔗"}
                      {label}
                    </button>
                  </>
                );
              })()}
              {(liveCampaign.status === "DRAFT" || liveCampaign.status === "PUBLISHED") && (
                <button type="button" onClick={handleArchive} disabled={archiving}
                  className="px-3 py-1.5 border border-slate-200 text-slate-500 text-xs font-medium rounded-lg hover:bg-slate-50 disabled:opacity-50">
                  {archiving ? "…" : "Archive"}
                </button>
              )}
              {liveCampaign.status === "DRAFT" && onDelete && (
                <button type="button" onClick={onDelete} className="ml-auto px-3 py-1.5 border border-red-200 text-red-500 text-xs font-medium rounded-lg hover:bg-red-50">
                  Delete
                </button>
              )}
            </div>
          </div>
        )}

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
            {!campaign && form.unit_id && (
              <p className="text-[13px] text-slate-400 mt-1">📷 Photos already uploaded for this unit will be added to the campaign automatically.</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Monthly rent ($)</label>
              <input type="number" min="0" value={form.monthly_rent} onChange={e => set("monthly_rent", e.target.value)} placeholder="2500" className={inp} />
              {suggestedRent != null && (
                <p className="text-[13px] text-violet-600 mt-1">
                  ✨ AI suggests ${suggestedRent.toLocaleString()}/mo —{" "}
                  <button type="button" onClick={() => { set("monthly_rent", String(suggestedRent)); setSuggestedRent(null); }}
                    className="underline hover:text-violet-800">
                    Use this
                  </button>
                </p>
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Available from</label>
              <input type="date" value={form.available_from} onChange={e => set("available_from", e.target.value)} className={inp} />
            </div>
          </div>

          <div className="border-t border-slate-100 pt-3">
            <p className="text-[13px] uppercase tracking-wider font-medium text-slate-400 mb-2">Contact info</p>
            <div className="space-y-2.5">
              <input value={form.contact_name} onChange={e => set("contact_name", e.target.value)} placeholder="Contact name" className={inp} />
              <div className="grid grid-cols-2 gap-3">
                <input value={form.contact_phone} onChange={e => set("contact_phone", e.target.value)} placeholder="Phone" className={inp} />
                <input type="email" value={form.contact_email} onChange={e => set("contact_email", e.target.value)} placeholder="Email" className={inp} />
              </div>
            </div>
          </div>

          <div className="border-t border-slate-100 pt-3 space-y-3">
            <p className="text-[13px] uppercase tracking-wider font-medium text-slate-400">Listing details</p>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Security deposit ($)</label>
                <input type="number" min="0" value={form.security_deposit} onChange={e => set("security_deposit", e.target.value)} placeholder="1500" className={inp} />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Lease term</label>
                <select value={form.lease_term} onChange={e => set("lease_term", e.target.value)} className={inp}>
                  <option value="">— select —</option>
                  {LEASE_TERM_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Furnishing</label>
                <select value={form.furnishing} onChange={e => set("furnishing", e.target.value)} className={inp}>
                  <option value="">— select —</option>
                  {FURNISHING_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Smoking policy</label>
                <select value={form.smoking_policy} onChange={e => set("smoking_policy", e.target.value)} className={inp}>
                  <option value="">— select —</option>
                  {SMOKING_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium text-slate-500 mb-1">Pets policy</label>
                <select value={form.pets_policy} onChange={e => set("pets_policy", e.target.value)} className={inp}>
                  <option value="">— select —</option>
                  {PETS_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1.5">Utilities included</label>
              <TagPicker options={UTILITY_OPTIONS} selected={utilitiesIncluded} onToggle={v => toggleTag(setUtilitiesIncluded, v)} />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1.5">Parking available</label>
              <div className="flex gap-1.5">
                <button type="button" onClick={() => setParkingAvailable(true)}
                  className={`px-3 py-1 rounded-full text-xs border ${parkingAvailable === true ? "bg-black text-white border-black" : "border-slate-200 text-slate-600 hover:border-slate-400"}`}>
                  Yes
                </button>
                <button type="button" onClick={() => setParkingAvailable(false)}
                  className={`px-3 py-1 rounded-full text-xs border ${parkingAvailable === false ? "bg-black text-white border-black" : "border-slate-200 text-slate-600 hover:border-slate-400"}`}>
                  No
                </button>
              </div>
              {parkingAvailable === true && (
                <div className="mt-2.5 space-y-2.5 border border-slate-100 rounded-lg p-3 bg-slate-50/50">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[13px] text-slate-500 mb-1">Total spaces</label>
                      <input type="number" min="0" value={parkingTotalSpaces} onChange={e => setParkingTotalSpaces(e.target.value)} className={inp} />
                    </div>
                    <div>
                      <label className="block text-[13px] text-slate-500 mb-1">Garage monthly fee ($)</label>
                      <input type="number" min="0" value={parkingGarageFee} onChange={e => setParkingGarageFee(e.target.value)} className={inp} />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[13px] text-slate-500 mb-1">Type</label>
                    <TagPicker options={PARKING_TYPE_OPTIONS} selected={parkingTypes} onToggle={v => toggleTag(setParkingTypes, v)} />
                  </div>
                  <div>
                    <label className="block text-[13px] text-slate-500 mb-1">Options for tenant</label>
                    <TagPicker options={PARKING_TENANT_OPTIONS} selected={parkingTenantOptions} onToggle={v => toggleTag(setParkingTenantOptions, v)} />
                  </div>
                  <div>
                    <label className="block text-[13px] text-slate-500 mb-1">Notes</label>
                    <textarea value={parkingNotes} onChange={e => setParkingNotes(e.target.value)} rows={2} className={`${inp} resize-none`} />
                  </div>
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1.5">Home features</label>
              <TagPicker options={HOME_FEATURE_OPTIONS} selected={homeFeatures} onToggle={v => toggleTag(setHomeFeatures, v)} allowCustom customPlaceholder="+ Add Feature" />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1.5">Neighborhood features</label>
              <TagPicker options={NEIGHBORHOOD_FEATURE_OPTIONS} selected={neighborhoodFeatures} onToggle={v => toggleTag(setNeighborhoodFeatures, v)} allowCustom customPlaceholder="Suggest New Feature" />
            </div>
          </div>

          {!campaign && (
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">
                Photos <span className="text-slate-400 font-normal">({photos.length}/{MAX_PHOTOS})</span>
              </label>
              <div className="border border-dashed border-slate-200 rounded-lg p-3 space-y-3">
                {form.unit_id && (loadingUnitImages || unitImages.length > 0) && (
                  <div className="space-y-1.5 pb-1 border-b border-slate-100">
                    <p className="text-[13px] uppercase tracking-wider font-medium text-slate-400">
                      From this unit {!loadingUnitImages && `(${unitImages.length})`} — added automatically
                    </p>
                    {loadingUnitImages ? (
                      <p className="text-xs text-slate-400">Loading…</p>
                    ) : (
                      <div className="grid grid-cols-4 gap-2">
                        {unitImages.map(img => (
                          <div key={img.id} className="aspect-square rounded-lg overflow-hidden border border-slate-200">
                            <img src={img.url} alt="" className="w-full h-full object-cover" />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
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

          {campaign && (
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">
                Photos <span className="text-slate-400 font-normal">({existingPhotos.length}/{MAX_EDIT_PHOTOS})</span>
              </label>
              <div className="border border-dashed border-slate-200 rounded-lg p-3 space-y-3">
                {editPhotoError && <p className="text-xs text-red-600 bg-red-50 px-2 py-1.5 rounded-lg">{editPhotoError}</p>}
                {existingPhotos.length > 0 && (
                  <div className="grid grid-cols-4 gap-2">
                    {existingPhotos.map((url, i) => {
                      const filename = url.split("/").pop()!;
                      return (
                        <div key={i} className="relative group aspect-square rounded-lg overflow-hidden border border-slate-200">
                          <img src={url} alt="" className="w-full h-full object-cover" />
                          <button type="button" onClick={() => handleEditRemove(url)} disabled={editDeleting === filename}
                            className="absolute top-1 right-1 w-5 h-5 bg-black/60 text-white rounded-full text-xs opacity-0 group-hover:opacity-100 flex items-center justify-center hover:bg-red-600 transition-opacity disabled:opacity-100">
                            {editDeleting === filename ? "…" : "×"}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
                {existingPhotos.length < MAX_EDIT_PHOTOS && (
                  <>
                    <button type="button" onClick={() => editPhotoRef.current?.click()} disabled={editUploading}
                      className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-black disabled:opacity-50">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                      {editUploading ? "Uploading…" : `Add photos ${existingPhotos.length > 0 ? `(${MAX_EDIT_PHOTOS - existingPhotos.length} remaining)` : ""}`}
                    </button>
                    <input ref={editPhotoRef} type="file" multiple accept="image/jpeg,image/png,image/webp" className="hidden"
                      onChange={handleEditUpload} />
                  </>
                )}
              </div>
            </div>
          )}

          <div>
            {!showAiPanel ? (
              <button type="button" onClick={() => setShowAiPanel(true)}
                className="w-full flex items-center gap-2 px-3 py-2.5 border border-dashed border-slate-300 hover:border-violet-400 hover:bg-violet-50 rounded-xl text-sm text-slate-500 hover:text-violet-700 transition-colors">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                ✨ Generate with AI
              </button>
            ) : (
              <div className="border border-violet-200 bg-violet-50 rounded-xl p-3 space-y-2">
                {aiError && <p className="text-red-600 text-xs bg-red-50 px-2 py-1.5 rounded-lg">{aiError}</p>}
                <label className="block text-xs font-medium text-violet-700">Extra instructions (optional)</label>
                <textarea value={aiInstructions} onChange={e => setAiInstructions(e.target.value)} rows={2}
                  placeholder="e.g. pet-friendly, close to downtown, includes parking"
                  className="w-full border border-violet-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-violet-500 resize-none" />
                {(campaign ? existingPhotos.length : photos.length) > 0 && (
                  <p className="text-[13px] text-violet-600">
                    📷 Will look at your {campaign ? existingPhotos.length : photos.length} uploaded photo{(campaign ? existingPhotos.length : photos.length) === 1 ? "" : "s"} for visual details.
                  </p>
                )}
                <div className="flex gap-2">
                  <button type="button" onClick={() => setShowAiPanel(false)}
                    className="px-3 py-1.5 text-xs text-slate-500 hover:text-slate-700">
                    Cancel
                  </button>
                  <button type="button" onClick={handleAiGenerate} disabled={generating}
                    className="ml-auto px-3 py-1.5 bg-violet-600 text-white rounded-lg text-xs font-medium hover:bg-violet-700 disabled:opacity-50">
                    {generating ? "Generating…" : "✨ Generate"}
                  </button>
                </div>
              </div>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-medium text-slate-500">Description / marketing copy</label>
              <button type="button" onClick={handleCopyDescription} disabled={!form.description}
                className="text-[13px] text-slate-500 hover:text-black underline disabled:opacity-40 disabled:no-underline">
                {descCopied ? "Copied!" : "Copy"}
              </button>
            </div>
            <div className="flex items-center gap-1 mb-1">
              <button type="button" onClick={() => applyDescFormat("bold")} title="Bold (**text**)"
                className="w-7 h-7 flex items-center justify-center text-xs font-bold border border-slate-200 rounded hover:bg-slate-50">B</button>
              <button type="button" onClick={() => applyDescFormat("heading")} title="Heading (## text)"
                className="w-7 h-7 flex items-center justify-center text-xs font-semibold border border-slate-200 rounded hover:bg-slate-50">H</button>
              <button type="button" onClick={() => applyDescFormat("bullet")} title="Bullet list (- text)"
                className="w-7 h-7 flex items-center justify-center text-xs border border-slate-200 rounded hover:bg-slate-50">•≡</button>
              <button type="button" onClick={insertDescDetails}
                title="Insert location, rent, availability & contact as new lines"
                className="h-7 px-2 flex items-center justify-center text-[13px] border border-slate-200 rounded hover:bg-slate-50 text-slate-600">
                + Details
              </button>
            </div>
            <div className="w-full border border-slate-200 rounded-lg focus-within:ring-2 focus-within:ring-black">
              {(() => {
                const descPhotos = campaign
                  ? existingPhotos
                  : [...unitImages.map(img => img.url), ...photos.map(p => p.preview)];
                return descPhotos.length > 0 ? (
                  <div className="flex gap-1.5 overflow-x-auto p-2 pb-1.5 border-b border-slate-100">
                    {descPhotos.map((url, i) => (
                      <img key={i} src={url} alt="" className="w-14 h-14 rounded-lg object-cover border border-slate-200 flex-shrink-0" />
                    ))}
                  </div>
                ) : null;
              })()}
              <textarea ref={descRef} value={form.description} onChange={e => set("description", e.target.value)} rows={4}
                placeholder="Describe the unit, amenities, neighbourhood… (supports **bold**, ## headings, - bullets)"
                className="w-full px-3 py-2 text-sm resize-none focus:outline-none rounded-lg" />
            </div>
          </div>

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
