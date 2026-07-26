"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { maintenanceApi, vendorsApi, type MaintenanceOut, type MaintenanceStatus, type VendorOut, type VendorAvailabilityOut } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_LABEL: Record<MaintenanceStatus, string> = {
  SUBMITTED: "Submitted", UNDER_REVIEW: "Under Review", SCHEDULED: "Scheduled",
  IN_PROGRESS: "In Progress", COMPLETED: "Completed", CLOSED: "Closed", CANCELLED: "Cancelled",
};
const STATUS_STYLE: Record<MaintenanceStatus, string> = {
  SUBMITTED: "bg-indigo-100 text-indigo-700", UNDER_REVIEW: "bg-yellow-100 text-yellow-700",
  SCHEDULED: "bg-blue-100 text-blue-700", IN_PROGRESS: "bg-orange-100 text-orange-700",
  COMPLETED: "bg-emerald-100 text-emerald-700", CLOSED: "bg-slate-100 text-slate-500",
  CANCELLED: "bg-red-100 text-red-600",
};
const inp = "w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black";

function fmtDt(s: string | null) {
  if (!s) return "—";
  return new Date(s).toLocaleString("en-CA", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}
function fmtDate(s: string) {
  return new Date(s + "T00:00:00").toLocaleDateString("en-CA", { weekday: "short", month: "short", day: "numeric" });
}

// ─── Job Card ─────────────────────────────────────────────────────────────────

function JobCard({ req, onUpdate }: { req: MaintenanceOut; onUpdate: (r: MaintenanceOut) => void }) {
  const { user } = useAuth();
  const [expanded, setExpanded] = useState(false);
  const [newNote, setNewNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [addingNote, setAddingNote] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function updateStatus(status: MaintenanceStatus) {
    setSaving(true);
    try { onUpdate(await maintenanceApi.update(req.id, { status })); }
    finally { setSaving(false); }
  }

  async function addNote() {
    if (!newNote.trim()) return;
    setAddingNote(true);
    try { onUpdate(await maintenanceApi.addNote(req.id, newNote.trim())); setNewNote(""); }
    finally { setAddingNote(false); }
  }

  async function deleteNote(noteId: string) {
    await maintenanceApi.removeNote(req.id, noteId);
    onUpdate({ ...req, notes: req.notes.filter(n => n.id !== noteId) });
  }

  async function handlePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try { onUpdate(await maintenanceApi.uploadAttachment(req.id, file)); }
    catch { /* silently ignore */ }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = ""; }
  }

  const canStart = req.status === "SCHEDULED";
  const canComplete = req.status === "IN_PROGRESS";
  const canCancel = req.status === "SCHEDULED" || req.status === "IN_PROGRESS";
  const isDone = ["COMPLETED", "CLOSED", "CANCELLED"].includes(req.status);

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <button className="w-full text-left px-5 py-4" onClick={() => setExpanded(v => !v)}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-slate-900">{req.title}</p>
            <p className="text-xs text-slate-400 mt-0.5">{req.category} · {req.property_name} Unit {req.unit_number}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium ${STATUS_STYLE[req.status]}`}>{STATUS_LABEL[req.status]}</span>
            <svg className={`w-4 h-4 text-slate-400 transition-transform ${expanded ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
          </div>
        </div>
        {req.scheduled_start && (
          <p className="text-xs text-slate-500 mt-1.5">{fmtDt(req.scheduled_start)} – {fmtDt(req.scheduled_end)}</p>
        )}
      </button>

      {expanded && (
        <div className="px-5 pb-5 border-t border-slate-100 pt-4 space-y-4">
          {/* Tenant contact */}
          {req.submitted_by_name && (
            <div className="bg-slate-50 rounded-lg px-4 py-3 space-y-1">
              <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">Tenant contact</p>
              <p className="text-sm font-medium text-slate-900">{req.submitted_by_name}</p>
              <div className="flex flex-wrap gap-3 mt-0.5">
                {req.tenant_email && (
                  <a href={`mailto:${req.tenant_email}`} className="text-xs text-blue-600 hover:underline flex items-center gap-1">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                    {req.tenant_email}
                  </a>
                )}
                {req.tenant_phone && (
                  <a href={`tel:${req.tenant_phone}`} className="text-xs text-blue-600 hover:underline flex items-center gap-1">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
                    {req.tenant_phone}
                  </a>
                )}
              </div>
            </div>
          )}

          <p className="text-sm text-slate-700 whitespace-pre-wrap">{req.description}</p>

          {/* Scheduled time */}
          {req.scheduled_start && (
            <div className="bg-blue-50 rounded-lg px-4 py-3">
              <p className="text-xs font-medium text-blue-700 mb-0.5">Scheduled</p>
              <p className="text-sm text-blue-900">{fmtDt(req.scheduled_start)} – {fmtDt(req.scheduled_end)}</p>
            </div>
          )}

          {/* Estimate */}
          {(req.est_cost_min || req.est_hours_min) && (
            <div className="bg-slate-50 rounded-lg px-4 py-3 flex gap-6">
              {req.est_hours_min != null && <div><p className="text-[11px] text-slate-400">Estimated hours</p><p className="text-sm font-medium">{req.est_hours_min}–{req.est_hours_max} hrs</p></div>}
              {req.est_cost_min != null && <div><p className="text-[11px] text-slate-400">Estimated cost</p><p className="text-sm font-medium">${req.est_cost_min}–${req.est_cost_max}</p></div>}
            </div>
          )}

          {/* Attachments */}
          {req.attachments.length > 0 && (
            <div>
              <p className="text-xs font-medium text-slate-500 mb-2">Photos</p>
              <div className="grid grid-cols-4 gap-2">
                {req.attachments.map(a => (
                  <div key={a.id} className="rounded-lg overflow-hidden border border-slate-200 aspect-square bg-slate-50 flex items-center justify-center">
                    {a.original_name.match(/\.(jpg|jpeg|png|webp)$/i)
                      ? <img src={a.url} alt={a.original_name} className="w-full h-full object-cover" />
                      : <p className="text-[9px] text-slate-500 truncate p-1">{a.original_name}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Notes log */}
          <div>
            <p className="text-xs font-medium text-slate-500 mb-2">Notes ({req.notes.length})</p>
            {req.notes.length > 0 && (
              <div className="space-y-2 mb-2 max-h-48 overflow-y-auto pr-1">
                {req.notes.map(n => (
                  <div key={n.id} className="bg-slate-50 rounded-lg px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-medium text-slate-700">{n.author_name}</p>
                      <div className="flex items-center gap-2 shrink-0">
                        <p className="text-[11px] text-slate-400">{fmtDt(n.created_at)}</p>
                        {n.author_user_id === user?.id && (
                          <button onClick={() => deleteNote(n.id)} className="text-[11px] text-slate-400 hover:text-red-500">Delete</button>
                        )}
                      </div>
                    </div>
                    <p className="text-sm text-slate-700 whitespace-pre-wrap mt-0.5">{n.note}</p>
                  </div>
                ))}
              </div>
            )}
            {!isDone && (
              <div>
                <textarea value={newNote} onChange={e => setNewNote(e.target.value)} rows={2}
                  className={`${inp} resize-none`} placeholder="Describe what was done…" />
                <button onClick={addNote} disabled={addingNote || !newNote.trim()} className="mt-1.5 text-xs text-black hover:underline disabled:opacity-50">
                  {addingNote ? "Adding…" : "Add note"}
                </button>
              </div>
            )}
          </div>

          {/* Photo upload (in progress only) */}
          {canComplete && (
            <div>
              <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,application/pdf"
                onChange={handlePhoto} className="hidden" id={`photo-${req.id}`} />
              <label htmlFor={`photo-${req.id}`}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 border border-slate-300 rounded-lg text-xs text-slate-600 cursor-pointer hover:bg-slate-50 ${uploading ? "opacity-50 pointer-events-none" : ""}`}>
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                {uploading ? "Uploading…" : "Add photo"}
              </label>
            </div>
          )}

          {/* Action buttons */}
          {!isDone && (
            <div className="flex gap-2 pt-1">
              {canStart && (
                <button onClick={() => updateStatus("IN_PROGRESS")} disabled={saving}
                  className="flex-1 px-4 py-2 bg-orange-500 text-white text-sm font-medium rounded-lg hover:bg-orange-600 disabled:opacity-50">
                  Mark in progress
                </button>
              )}
              {canComplete && (
                <button onClick={() => updateStatus("COMPLETED")} disabled={saving}
                  className="flex-1 px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 disabled:opacity-50">
                  Mark completed
                </button>
              )}
              {canCancel && (
                <button onClick={() => updateStatus("CANCELLED")} disabled={saving}
                  className="px-4 py-2 border border-red-300 text-red-600 text-sm font-medium rounded-lg hover:bg-red-50 disabled:opacity-50">
                  Can&apos;t do
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Availability Panel ───────────────────────────────────────────────────────

function AvailabilitySection({ vendorId }: { vendorId: string }) {
  const [slots, setSlots] = useState<VendorAvailabilityOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ date: "", start_time: "", end_time: "" });
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try { setSlots(await vendorsApi.listAvailability(vendorId)); } finally { setLoading(false); }
  }, [vendorId]);

  useEffect(() => { load(); }, [load]);

  async function addSlot(e: React.FormEvent) {
    e.preventDefault();
    if (!form.date || !form.start_time || !form.end_time) { setError("All fields required."); return; }
    setAdding(true);
    try {
      await vendorsApi.addAvailability(vendorId, form);
      setForm({ date: "", start_time: "", end_time: "" });
      setError("");
      await load();
    } catch (err: any) { setError(err.message ?? "Failed"); } finally { setAdding(false); }
  }

  async function remove(slotId: string) {
    await vendorsApi.deleteAvailability(vendorId, slotId);
    setSlots(ss => ss.filter(s => s.id !== slotId));
  }

  const byDate: Record<string, VendorAvailabilityOut[]> = {};
  slots.forEach(s => { (byDate[s.date] = byDate[s.date] ?? []).push(s); });

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
      <h2 className="text-sm font-semibold text-slate-900">My Availability</h2>
      <form onSubmit={addSlot} className="bg-slate-50 rounded-lg p-4 space-y-3">
        <p className="text-xs font-medium text-slate-600">Add a free slot</p>
        {error && <p className="text-red-600 text-xs">{error}</p>}
        <div className="grid grid-cols-7 gap-2 items-end">
          <div className="col-span-3">
            <label className="block text-[11px] text-slate-400 mb-1">Date</label>
            <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} className={inp} />
          </div>
          <div className="col-span-2">
            <label className="block text-[11px] text-slate-400 mb-1">Start</label>
            <input type="time" value={form.start_time} onChange={e => setForm(f => ({ ...f, start_time: e.target.value }))} className={inp} />
          </div>
          <div className="col-span-2">
            <label className="block text-[11px] text-slate-400 mb-1">End</label>
            <input type="time" value={form.end_time} onChange={e => setForm(f => ({ ...f, end_time: e.target.value }))} className={inp} />
          </div>
        </div>
        <button type="submit" disabled={adding} className="px-4 py-1.5 bg-black text-white text-xs font-medium rounded-lg hover:bg-slate-800 disabled:opacity-50">
          {adding ? "Adding…" : "Add slot"}
        </button>
      </form>

      {loading ? <p className="text-sm text-slate-400 text-center py-4">Loading…</p>
        : Object.keys(byDate).length === 0
          ? <p className="text-sm text-slate-400 italic text-center py-4">No availability added yet. Add slots so managers can schedule jobs.</p>
          : <div className="space-y-3">
            {Object.entries(byDate).sort(([a], [b]) => a.localeCompare(b)).map(([date, daySlots]) => (
              <div key={date}>
                <p className="text-xs font-medium text-slate-500 mb-1.5">{fmtDate(date)}</p>
                <div className="space-y-1">
                  {daySlots.map(slot => (
                    <div key={slot.id} className="flex items-center justify-between bg-slate-50 rounded-lg px-3 py-2">
                      <span className="text-sm text-slate-700">{slot.start_time.slice(0, 5)} – {slot.end_time.slice(0, 5)}</span>
                      <button onClick={() => remove(slot.id)} className="text-xs text-slate-400 hover:text-red-500">Remove</button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
      }
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type Tab = "upcoming" | "in_progress" | "completed";

export default function VendorPortalPage() {
  const { user } = useAuth();
  const [jobs, setJobs] = useState<MaintenanceOut[]>([]);
  const [profile, setProfile] = useState<VendorOut | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("upcoming");

  const load = useCallback(async () => {
    try {
      const [j, p] = await Promise.all([maintenanceApi.listAssigned(), vendorsApi.me().catch(() => null)]);
      setJobs(j);
      setProfile(p);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  function handleUpdate(r: MaintenanceOut) {
    setJobs(prev => prev.map(j => String(j.id) === String(r.id) ? r : j));
  }

  const upcoming = jobs.filter(j => j.status === "SCHEDULED");
  const inProgress = jobs.filter(j => j.status === "IN_PROGRESS");
  const completed = jobs.filter(j => ["COMPLETED", "CLOSED", "CANCELLED"].includes(j.status));

  const tabList: [Tab, string][] = [
    ["upcoming", `Upcoming (${upcoming.length})`],
    ["in_progress", `In Progress (${inProgress.length})`],
    ["completed", `Completed (${completed.length})`],
  ];

  const currentJobs = tab === "upcoming" ? upcoming : tab === "in_progress" ? inProgress : completed;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">My Jobs</h1>
        {profile && (
          <p className="text-sm text-slate-500 mt-0.5">
            {profile.business_name || profile.full_name}
            {profile.service_categories.length > 0 && ` · ${profile.service_categories.join(", ")}`}
          </p>
        )}
      </div>

      <div className="flex gap-2 border-b border-slate-200">
        {tabList.map(([t, label]) => (
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
      ) : currentJobs.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-slate-200">
          <p className="text-slate-400 text-sm">
            {tab === "upcoming" ? "No upcoming jobs scheduled." : tab === "in_progress" ? "No jobs in progress." : "No completed jobs yet."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {currentJobs.map(j => (
            <JobCard key={j.id} req={j} onUpdate={handleUpdate} />
          ))}
        </div>
      )}

      {/* Availability always visible below */}
      {profile && (
        <div className="pt-2">
          <AvailabilitySection vendorId={profile.id} />
        </div>
      )}
    </div>
  );
}
