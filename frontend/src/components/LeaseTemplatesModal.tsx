"use client";

import { useState, useEffect, useRef } from "react";
import { leasesApi, type LeaseTemplateOut } from "@/lib/api";

const CANADIAN_PROVINCES = [
  "Alberta","British Columbia","Manitoba","New Brunswick","Newfoundland and Labrador",
  "Nova Scotia","Ontario","Prince Edward Island","Quebec","Saskatchewan",
];

export function LeaseTemplatesModal({ onClose, showList = true }: { onClose: () => void; showList?: boolean }) {
  const [templates, setTemplates] = useState<LeaseTemplateOut[]>([]);
  const [loading, setLoading] = useState(showList);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  // AI generate state
  const [showAI, setShowAI] = useState(false);
  const [aiForm, setAiForm] = useState({ province: "Alberta", lease_type: "Fixed-term", property_type: "Residential Apartment", bedrooms: "", notes: "" });
  const [generating, setGenerating] = useState(false);
  const [aiError, setAiError] = useState("");

  useEffect(() => {
    if (!showList) return;
    leasesApi.listTemplates().then(t => { setTemplates(t); setLoading(false); }).catch(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleUpload(file: File) {
    if (!name.trim()) { setError("Please enter a template name first."); return; }
    setUploading(true); setError("");
    try {
      const t = await leasesApi.uploadTemplate(name.trim(), description.trim(), file);
      setTemplates(prev => [t, ...prev]);
      setName(""); setDescription("");
    } catch (e: any) {
      setError(e.message ?? "Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function handleAIGenerate(e: React.FormEvent) {
    e.preventDefault();
    setGenerating(true); setAiError("");
    try {
      const t = await leasesApi.aiGenerateTemplate(aiForm);
      setTemplates(prev => [t, ...prev]);
      setShowAI(false);
      setAiForm({ province: "Alberta", lease_type: "Fixed-term", property_type: "Residential Apartment", bedrooms: "", notes: "" });
    } catch (err: any) {
      setAiError(err.message ?? "Generation failed");
    } finally {
      setGenerating(false);
    }
  }

  async function handleDelete(id: string, templateName: string) {
    if (!confirm(`Delete template "${templateName}"?`)) return;
    setDeleting(id);
    try {
      await leasesApi.deleteTemplate(id);
      setTemplates(prev => prev.filter(t => t.id !== id));
    } catch (e: any) {
      setError(e.message ?? "Delete failed");
    } finally {
      setDeleting(null);
    }
  }

  const ACCEPT = "application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/jpeg,image/png";
  const inp = "w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black";

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Lease Agreement Templates</h2>
            <p className="text-xs text-slate-500 mt-0.5">Upload or AI-generate reusable lease agreement templates</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
        </div>

        {/* AI Generate Panel */}
        {showAI ? (
          <form onSubmit={handleAIGenerate} className="px-6 py-4 border-b border-slate-100 space-y-3 shrink-0">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-violet-600 uppercase tracking-wider">✨ AI Generate Lease Agreement</p>
              <button type="button" onClick={() => { setShowAI(false); setAiError(""); }}
                className="text-xs text-slate-400 hover:text-slate-600">Cancel</button>
            </div>
            {aiError && <p className="text-red-600 text-xs bg-red-50 px-3 py-2 rounded-lg">{aiError}</p>}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Province *</label>
                <select value={aiForm.province} onChange={e => setAiForm(f => ({ ...f, province: e.target.value }))} className={inp}>
                  {CANADIAN_PROVINCES.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Lease type</label>
                <select value={aiForm.lease_type} onChange={e => setAiForm(f => ({ ...f, lease_type: e.target.value }))} className={inp}>
                  <option>Fixed-term</option>
                  <option>Month-to-month</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Property type</label>
                <select value={aiForm.property_type} onChange={e => setAiForm(f => ({ ...f, property_type: e.target.value }))} className={inp}>
                  <option>Residential Apartment</option>
                  <option>Condo</option>
                  <option>Detached House</option>
                  <option>Townhouse</option>
                  <option>Basement Suite</option>
                  <option>Semi-Detached House</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Bedrooms</label>
                <select value={aiForm.bedrooms} onChange={e => setAiForm(f => ({ ...f, bedrooms: e.target.value }))} className={inp}>
                  <option value="">— any —</option>
                  {["Studio","1","2","3","4","5+"].map(b => <option key={b} value={b}>{b}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Special requirements</label>
              <input value={aiForm.notes} onChange={e => setAiForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="e.g. pet-friendly, include parking clause, furnished unit…"
                className={inp} />
            </div>
            <button type="submit" disabled={generating}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-violet-600 text-white rounded-xl text-sm font-medium hover:bg-violet-700 disabled:opacity-50 transition-colors">
              {generating ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Generating with Gemini…
                </>
              ) : "✨ Generate Lease Agreement"}
            </button>
          </form>
        ) : (
          /* Upload form */
          <div className="px-6 py-4 border-b border-slate-100 space-y-3 shrink-0">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Upload template</p>
              <button type="button" onClick={() => { setShowAI(true); setError(""); }}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-50 text-violet-700 border border-violet-200 rounded-lg text-xs font-medium hover:bg-violet-100 transition-colors">
                ✨ AI Generate
              </button>
            </div>
            {error && <p className="text-red-600 text-xs bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Template name *</label>
              <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Standard 1-Year Fixed Lease"
                className={inp} />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Description</label>
              <input value={description} onChange={e => setDescription(e.target.value)} placeholder="Optional notes about this template"
                className={inp} />
            </div>
            <button onClick={() => fileRef.current?.click()} disabled={uploading}
              className="flex items-center gap-2 px-4 py-2 border border-dashed border-slate-300 hover:border-black rounded-xl text-sm text-slate-600 hover:text-black transition-colors disabled:opacity-50 w-full justify-center">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              {uploading ? "Uploading…" : "Choose file (PDF, Word, JPG, PNG)"}
            </button>
            <input ref={fileRef} type="file" accept={ACCEPT} className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(f); }} />
          </div>
        )}

        {/* Template list */}
        {showList && (
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {loading ? (
            <p className="text-sm text-slate-400 text-center py-6">Loading…</p>
          ) : templates.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-6 italic">No templates yet. Upload one above.</p>
          ) : (
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
                    <p className="text-[10px] text-slate-400 mt-0.5">{t.original_name}</p>
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
        </div>
        )}

        <div className="px-6 py-4 border-t border-slate-100 shrink-0">
          <button onClick={onClose} className="w-full px-4 py-2 border border-slate-200 rounded-xl text-sm text-slate-600 hover:bg-slate-50">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
