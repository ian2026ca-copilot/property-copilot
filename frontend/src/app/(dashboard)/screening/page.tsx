"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { MOCK_MODE } from "@/lib/useApiData";
import {
  tenantsApi, unitsApi,
  type TenantOut, type TenantApplicationOut, type UnitDetailOut, type TenantAiScreenOut, type TenantScreeningNoteOut,
  type EmployerReferenceLetterOut,
} from "@/lib/api";

type AppStatus = "NOT_STARTED" | "IN_REVIEW" | "MORE_INFO_REQUESTED" | "APPROVED" | "DECLINED";

const STATUSES: AppStatus[] = ["NOT_STARTED", "IN_REVIEW", "MORE_INFO_REQUESTED", "APPROVED", "DECLINED"];

const STATUS_LABELS: Record<AppStatus, string> = {
  NOT_STARTED: "Not started",
  IN_REVIEW: "In review",
  MORE_INFO_REQUESTED: "More info requested",
  APPROVED: "Approved",
  DECLINED: "Declined",
};

const STATUS_STYLES: Record<AppStatus, string> = {
  APPROVED: "bg-emerald-100 text-emerald-700",
  IN_REVIEW: "bg-blue-100 text-blue-700",
  NOT_STARTED: "bg-slate-100 text-slate-500",
  DECLINED: "bg-red-100 text-red-600",
  MORE_INFO_REQUESTED: "bg-amber-100 text-amber-700",
};

function asStatus(s: string): AppStatus {
  return (STATUSES as string[]).includes(s) ? (s as AppStatus) : "NOT_STARTED";
}

function initials(name: string) {
  return name.split(" ").filter(Boolean).slice(0, 2).map(p => p[0]?.toUpperCase()).join("") || "?";
}

const IMAGE_EXT_RE = /\.(jpe?g|png|webp|gif)$/i;
const NOTE_COLLAPSE_THRESHOLD = 160;

function ScoreRing({ score }: { score: number | null }) {
  const s = score ?? 0;
  const color = score === null ? "#cbd5e1" : s >= 80 ? "#22c55e" : s >= 60 ? "#f59e0b" : "#ef4444";
  const r = 22, circ = 2 * Math.PI * r;
  const dash = score === null ? 0 : (s / 100) * circ;
  return (
    <div className="relative w-14 h-14 flex items-center justify-center shrink-0">
      <svg width="56" height="56" className="-rotate-90">
        <circle cx="28" cy="28" r={r} fill="none" stroke="#f1f5f9" strokeWidth="4" />
        <circle cx="28" cy="28" r={r} fill="none" stroke={color} strokeWidth="4"
          strokeDasharray={`${dash} ${circ}`} strokeLinecap="round" />
      </svg>
      <span className="absolute text-xs font-bold text-slate-900">{score !== null ? score : "—"}</span>
    </div>
  );
}

interface UnitInfo { label: string; rent: number }

function ApplicantDrawer({
  tenant, unit, criminalEnabled, rentalHistoryEnabled, onClose, onStatusChange,
}: {
  tenant: TenantOut;
  unit: UnitInfo | null;
  criminalEnabled: boolean;
  rentalHistoryEnabled: boolean;
  onClose: () => void;
  onStatusChange: (id: string, status: AppStatus) => void;
}) {
  const [detail, setDetail] = useState<TenantApplicationOut | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(true);
  const [ai, setAi] = useState<TenantAiScreenOut | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState("");
  const [savingStatus, setSavingStatus] = useState<AppStatus | null>(null);
  const [statusError, setStatusError] = useState("");
  const [notes, setNotes] = useState<TenantScreeningNoteOut[]>([]);
  const [loadingNotes, setLoadingNotes] = useState(true);
  const [newNote, setNewNote] = useState("");
  const [addingNote, setAddingNote] = useState(false);
  const [noteError, setNoteError] = useState("");
  const [expandedNotes, setExpandedNotes] = useState<Set<string>>(new Set());
  const [contactError, setContactError] = useState<Record<string, string>>({});
  const [letterDrafts, setLetterDrafts] = useState<Record<string, EmployerReferenceLetterOut>>({});
  const [generatingLetter, setGeneratingLetter] = useState<Record<string, boolean>>({});
  const [letterError, setLetterError] = useState<Record<string, string>>({});
  const [sendChannels, setSendChannels] = useState<Record<string, { email: boolean; sms: boolean }>>({});
  const [sendingLetter, setSendingLetter] = useState<Record<string, boolean>>({});

  function refreshNotes() {
    return tenantsApi.listNotes(tenant.id).then(setNotes).catch(() => {});
  }

  useEffect(() => {
    let cancelled = false;
    tenantsApi.getApplication(tenant.id)
      .then((d) => { if (!cancelled) setDetail(d); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoadingDetail(false); });
    tenantsApi.listNotes(tenant.id)
      .then((n) => { if (!cancelled) setNotes(n); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoadingNotes(false); });
    return () => { cancelled = true; };
  }, [tenant.id]);

  async function handleDecide(status: AppStatus) {
    setSavingStatus(status); setStatusError("");
    try {
      await tenantsApi.updateScreening(tenant.id, { application_status: status });
      onStatusChange(tenant.id, status);
      await refreshNotes();
    } catch (e: unknown) {
      setStatusError(e instanceof Error ? e.message : "Failed to save decision");
    } finally {
      setSavingStatus(null);
    }
  }

  function toggleNoteExpanded(id: string) {
    setExpandedNotes((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function handleAddNote() {
    if (!newNote.trim()) return;
    setAddingNote(true); setNoteError("");
    try {
      const saved = await tenantsApi.addNote(tenant.id, newNote.trim());
      setNotes((prev) => [saved, ...prev]);
      setNewNote("");
    } catch (e: unknown) {
      setNoteError(e instanceof Error ? e.message : "Failed to add note");
    } finally {
      setAddingNote(false);
    }
  }

  type ReferenceKind = "EMPLOYMENT" | "ADDRESS";

  async function handleSendLetter(kind: ReferenceKind, refId: string) {
    const letter = letterDrafts[refId];
    const channels = sendChannels[refId];
    if (!letter || !channels || (!channels.email && !channels.sms)) return;
    setSendingLetter((prev) => ({ ...prev, [refId]: true }));
    setContactError((prev) => ({ ...prev, [refId]: "" }));
    const contact = kind === "EMPLOYMENT" ? tenantsApi.contactEmployerReference : tenantsApi.contactLandlordReference;
    try {
      if (channels.email) {
        const saved = await contact(tenant.id, refId, "EMAIL", letter);
        setNotes((prev) => [saved, ...prev]);
      }
      if (channels.sms) {
        const saved = await contact(tenant.id, refId, "SMS", letter);
        setNotes((prev) => [saved, ...prev]);
      }
      setLetterDrafts((prev) => { const next = { ...prev }; delete next[refId]; return next; });
    } catch (e: unknown) {
      setContactError((prev) => ({ ...prev, [refId]: e instanceof Error ? e.message : "Failed to send" }));
    } finally {
      setSendingLetter((prev) => ({ ...prev, [refId]: false }));
    }
  }

  async function handleGenerateLetter(kind: ReferenceKind, refId: string, hasEmail: boolean, hasPhone: boolean) {
    setGeneratingLetter((prev) => ({ ...prev, [refId]: true }));
    setLetterError((prev) => ({ ...prev, [refId]: "" }));
    const generate = kind === "EMPLOYMENT" ? tenantsApi.generateReferenceLetter : tenantsApi.generateLandlordReferenceLetter;
    try {
      const letter = await generate(tenant.id, refId);
      setLetterDrafts((prev) => ({ ...prev, [refId]: letter }));
      setSendChannels((prev) => ({ ...prev, [refId]: { email: hasEmail, sms: !hasEmail && hasPhone } }));
    } catch (e: unknown) {
      setLetterError((prev) => ({ ...prev, [refId]: e instanceof Error ? e.message : "Failed to generate letter" }));
    } finally {
      setGeneratingLetter((prev) => ({ ...prev, [refId]: false }));
    }
  }

  async function handleRunScreening() {
    setAiLoading(true); setAiError("");
    try {
      const result = await tenantsApi.aiScreen(tenant.id);
      setAi(result);
    } catch (e: unknown) {
      setAiError(e instanceof Error ? e.message : "Failed to run screening");
    } finally {
      setAiLoading(false);
    }
  }

  const monthlyIncome = detail?.household_income_annual
    ? detail.household_income_annual / 12
    : detail?.personal_income_annual ? detail.personal_income_annual / 12 : null;
  const incomeRatio = monthlyIncome && unit ? monthlyIncome / unit.rent : null;
  const employmentWithRef = (detail?.employment_history ?? []).filter((e) => e.employer_reference_name);
  const addressesWithRef = (detail?.address_history ?? []).filter((a) => a.landlord_name);

  const status = asStatus(tenant.application_status);
  const docCount = tenant.documents.length;

  return (
    <div className="fixed inset-0 bg-black/30 z-50 flex justify-end">
      <div className="w-full max-w-sm bg-white h-full shadow-2xl flex flex-col overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 bg-black border-b border-slate-800">
          <h2 className="text-white text-sm font-semibold">Screening report</h2>
          <button onClick={onClose} className="text-white/60 hover:text-white text-lg">✕</button>
        </div>
        <div className="p-5 space-y-5">
          {/* Header */}
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-black text-white text-sm font-bold flex items-center justify-center">
              {initials(tenant.full_name)}
            </div>
            <div>
              <p className="font-semibold text-slate-900">{tenant.full_name}</p>
              <p className="text-xs text-slate-500">{tenant.email} · {tenant.phone || "no phone"}</p>
              <p className="text-xs text-slate-500 mt-0.5">{unit ? `Applied for ${unit.label}` : "No specific unit selected"}</p>
            </div>
          </div>

          {/* AI verdict */}
          <div className="rounded-xl border border-slate-200 p-3.5">
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-[10px] uppercase tracking-wider font-medium text-slate-500">AI summary</p>
              <button type="button" onClick={handleRunScreening} disabled={aiLoading}
                className="text-[11px] font-medium text-violet-700 hover:text-violet-900 disabled:opacity-50">
                {aiLoading ? "Running…" : ai ? "Run again" : "✨ Run screening"}
              </button>
            </div>
            {aiError && <p className="text-xs text-red-600">{aiError}</p>}
            {ai ? (
              <div className="flex items-start gap-3">
                <ScoreRing score={ai.score} />
                <p className="text-xs leading-relaxed text-slate-700 flex-1">{ai.verdict}</p>
              </div>
            ) : (
              !aiError && <p className="text-xs text-slate-400">Not run yet — click "Run screening" for an AI-written summary based on this applicant's income, employment, and documents.</p>
            )}
          </div>

          {/* Financials */}
          <div className="bg-slate-50 rounded-xl p-4 grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-[11px] text-slate-400 uppercase tracking-wider">Monthly income</p>
              <p className="font-bold text-slate-900 mt-0.5">{monthlyIncome ? `$${monthlyIncome.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : "—"}</p>
            </div>
            <div>
              <p className="text-[11px] text-slate-400 uppercase tracking-wider">Income ratio</p>
              <p className={`font-bold mt-0.5 ${incomeRatio && incomeRatio >= 3 ? "text-emerald-600" : incomeRatio ? "text-amber-600" : "text-slate-400"}`}>
                {incomeRatio ? `${incomeRatio.toFixed(1)}×` : "—"}
              </p>
            </div>
            <div>
              <p className="text-[11px] text-slate-400 uppercase tracking-wider">Documents</p>
              <p className={`font-bold mt-0.5 ${docCount > 0 ? "text-emerald-600" : "text-slate-400"}`}>{docCount}</p>
            </div>
            <div>
              <p className="text-[11px] text-slate-400 uppercase tracking-wider">Employment on file</p>
              <p className="font-medium text-slate-900 text-xs mt-0.5">{detail?.employment_history?.length ? `${detail.employment_history.length} record(s)` : "None"}</p>
            </div>
            {rentalHistoryEnabled && (
              <div>
                <p className="text-[11px] text-slate-400 uppercase tracking-wider">Evicted / refused rent</p>
                <p className={`font-bold mt-0.5 ${detail?.evicted || detail?.refused_rent ? "text-red-600" : "text-emerald-600"}`}>
                  {detail?.evicted || detail?.refused_rent ? "Disclosed" : "None disclosed"}
                </p>
              </div>
            )}
            {criminalEnabled && (
              <div>
                <p className="text-[11px] text-slate-400 uppercase tracking-wider">Criminal record</p>
                <p className={`font-bold mt-0.5 ${detail?.criminal_record ? "text-red-600" : "text-emerald-600"}`}>
                  {detail?.criminal_record ? "Disclosed" : "None disclosed"}
                </p>
              </div>
            )}
          </div>

          {loadingDetail && <p className="text-xs text-slate-400 text-center">Loading application detail…</p>}

          {/* Documents */}
          {docCount > 0 && (
            <div>
              <p className="text-[11px] uppercase tracking-wider text-slate-400 font-medium mb-2">Documents</p>
              <div className="space-y-1.5">
                {tenant.documents.map((d) => {
                  const isImage = IMAGE_EXT_RE.test(d.filename);
                  return (
                    <a key={d.id} href={d.url} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-2.5 text-xs text-slate-700 hover:text-blue-600 border border-slate-100 rounded-lg px-2.5 py-1.5">
                      {isImage ? (
                        <img src={d.url} alt={d.original_name} className="w-10 h-10 rounded-md object-cover border border-slate-200 shrink-0" />
                      ) : (
                        <span className="w-10 h-10 rounded-md bg-slate-100 flex items-center justify-center text-slate-400 shrink-0 text-[9px] font-medium">FILE</span>
                      )}
                      <span className="truncate flex-1">{d.original_name}</span>
                      <span className="text-[10px] text-slate-400 uppercase shrink-0">{d.doc_type.replace("_", " ")}</span>
                    </a>
                  );
                })}
              </div>
            </div>
          )}

          {/* Employer references */}
          {employmentWithRef.length > 0 && (
            <div>
              <p className="text-[11px] uppercase tracking-wider text-slate-400 font-medium mb-2">Employer reference{employmentWithRef.length > 1 ? "s" : ""}</p>
              <div className="space-y-2">
                {employmentWithRef.map((emp, i) => (
                  <div key={emp.id ?? i} className="border border-slate-100 rounded-lg px-3 py-2 text-xs space-y-1">
                    <p className="font-medium text-slate-900">
                      {emp.employer_reference_name}
                      {(emp.company || emp.position) && (
                        <span className="font-normal text-slate-400"> — {[emp.position, emp.company].filter(Boolean).join(" at ")}</span>
                      )}
                    </p>
                    <p className="text-slate-500">
                      {[emp.employer_reference_phone, emp.employer_reference_email].filter(Boolean).join(" · ") || "No contact info on file"}
                    </p>
                    {emp.id && !letterDrafts[emp.id] && (
                      <div className="pt-1">
                        <button type="button" disabled={(!emp.employer_reference_email && !emp.employer_reference_phone) || !!generatingLetter[emp.id]}
                          onClick={() => handleGenerateLetter("EMPLOYMENT", emp.id as string, !!emp.employer_reference_email, !!emp.employer_reference_phone)}
                          className="px-2 py-1 text-[11px] font-medium border border-violet-200 text-violet-700 rounded-md hover:bg-violet-50 disabled:opacity-40 disabled:cursor-not-allowed">
                          {generatingLetter[emp.id] ? "Drafting…" : "✨ AI reference letter"}
                        </button>
                      </div>
                    )}
                    {emp.id && contactError[emp.id] && <p className="text-red-600">{contactError[emp.id]}</p>}
                    {emp.id && letterError[emp.id] && <p className="text-red-600">{letterError[emp.id]}</p>}
                    {emp.id && letterDrafts[emp.id] && (
                      <div className="mt-2 border border-violet-100 bg-violet-50/50 rounded-lg p-2.5 space-y-2">
                        <p className="text-[10px] uppercase tracking-wider text-violet-500 font-medium">AI-drafted letter — review before sending</p>
                        <input value={letterDrafts[emp.id].subject}
                          onChange={(e) => setLetterDrafts((prev) => ({ ...prev, [emp.id as string]: { ...prev[emp.id as string], subject: e.target.value } }))}
                          className="w-full text-xs font-medium border border-slate-200 rounded-md px-2 py-1 outline-none focus:border-violet-400" />
                        <textarea value={letterDrafts[emp.id].body} rows={5}
                          onChange={(e) => setLetterDrafts((prev) => ({ ...prev, [emp.id as string]: { ...prev[emp.id as string], body: e.target.value } }))}
                          className="w-full text-xs border border-slate-200 rounded-md px-2 py-1.5 outline-none focus:border-violet-400 resize-none" />
                        <div className="flex items-center gap-3 text-slate-600">
                          <label className={`flex items-center gap-1 ${!emp.employer_reference_email ? "opacity-40" : ""}`}>
                            <input type="checkbox" disabled={!emp.employer_reference_email}
                              checked={!!sendChannels[emp.id as string]?.email}
                              onChange={(e) => setSendChannels((prev) => ({ ...prev, [emp.id as string]: { email: e.target.checked, sms: !!prev[emp.id as string]?.sms } }))} />
                            Email
                          </label>
                          <label className={`flex items-center gap-1 ${!emp.employer_reference_phone ? "opacity-40" : ""}`}>
                            <input type="checkbox" disabled={!emp.employer_reference_phone}
                              checked={!!sendChannels[emp.id as string]?.sms}
                              onChange={(e) => setSendChannels((prev) => ({ ...prev, [emp.id as string]: { email: !!prev[emp.id as string]?.email, sms: e.target.checked } }))} />
                            SMS
                          </label>
                        </div>
                        <div className="flex items-center gap-2">
                          <button type="button"
                            disabled={!!sendingLetter[emp.id] || (!sendChannels[emp.id as string]?.email && !sendChannels[emp.id as string]?.sms)}
                            onClick={() => handleSendLetter("EMPLOYMENT", emp.id as string)}
                            className="px-2.5 py-1 text-[11px] font-medium bg-violet-600 text-white rounded-md hover:bg-violet-700 disabled:opacity-50">
                            {sendingLetter[emp.id] ? "Sending…" : "Send letter"}
                          </button>
                          <button type="button"
                            onClick={() => setLetterDrafts((prev) => { const next = { ...prev }; delete next[emp.id as string]; return next; })}
                            className="px-2.5 py-1 text-[11px] font-medium text-slate-500 hover:text-slate-700">
                            Discard
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Landlord references */}
          {addressesWithRef.length > 0 && (
            <div>
              <p className="text-[11px] uppercase tracking-wider text-slate-400 font-medium mb-2">Landlord reference{addressesWithRef.length > 1 ? "s" : ""}</p>
              <div className="space-y-2">
                {addressesWithRef.map((a, i) => (
                  <div key={a.id ?? i} className="border border-slate-100 rounded-lg px-3 py-2 text-xs space-y-1">
                    <p className="font-medium text-slate-900">
                      {a.landlord_name}
                      <span className="font-normal text-slate-400">
                        {" — "}{a.is_current ? "Current address" : "Previous address"}
                        {a.street_address ? ` · ${a.street_address}${a.city ? `, ${a.city}` : ""}` : ""}
                      </span>
                    </p>
                    <p className="text-slate-500">
                      {[a.landlord_phone, a.landlord_email].filter(Boolean).join(" · ") || "No contact info on file"}
                    </p>
                    {a.id && !letterDrafts[a.id] && (
                      <div className="pt-1">
                        <button type="button" disabled={(!a.landlord_email && !a.landlord_phone) || !!generatingLetter[a.id]}
                          onClick={() => handleGenerateLetter("ADDRESS", a.id as string, !!a.landlord_email, !!a.landlord_phone)}
                          className="px-2 py-1 text-[11px] font-medium border border-violet-200 text-violet-700 rounded-md hover:bg-violet-50 disabled:opacity-40 disabled:cursor-not-allowed">
                          {generatingLetter[a.id] ? "Drafting…" : "✨ AI reference letter"}
                        </button>
                      </div>
                    )}
                    {a.id && contactError[a.id] && <p className="text-red-600">{contactError[a.id]}</p>}
                    {a.id && letterError[a.id] && <p className="text-red-600">{letterError[a.id]}</p>}
                    {a.id && letterDrafts[a.id] && (
                      <div className="mt-2 border border-violet-100 bg-violet-50/50 rounded-lg p-2.5 space-y-2">
                        <p className="text-[10px] uppercase tracking-wider text-violet-500 font-medium">AI-drafted letter — review before sending</p>
                        <input value={letterDrafts[a.id].subject}
                          onChange={(e) => setLetterDrafts((prev) => ({ ...prev, [a.id as string]: { ...prev[a.id as string], subject: e.target.value } }))}
                          className="w-full text-xs font-medium border border-slate-200 rounded-md px-2 py-1 outline-none focus:border-violet-400" />
                        <textarea value={letterDrafts[a.id].body} rows={5}
                          onChange={(e) => setLetterDrafts((prev) => ({ ...prev, [a.id as string]: { ...prev[a.id as string], body: e.target.value } }))}
                          className="w-full text-xs border border-slate-200 rounded-md px-2 py-1.5 outline-none focus:border-violet-400 resize-none" />
                        <div className="flex items-center gap-3 text-slate-600">
                          <label className={`flex items-center gap-1 ${!a.landlord_email ? "opacity-40" : ""}`}>
                            <input type="checkbox" disabled={!a.landlord_email}
                              checked={!!sendChannels[a.id as string]?.email}
                              onChange={(e) => setSendChannels((prev) => ({ ...prev, [a.id as string]: { email: e.target.checked, sms: !!prev[a.id as string]?.sms } }))} />
                            Email
                          </label>
                          <label className={`flex items-center gap-1 ${!a.landlord_phone ? "opacity-40" : ""}`}>
                            <input type="checkbox" disabled={!a.landlord_phone}
                              checked={!!sendChannels[a.id as string]?.sms}
                              onChange={(e) => setSendChannels((prev) => ({ ...prev, [a.id as string]: { email: !!prev[a.id as string]?.email, sms: e.target.checked } }))} />
                            SMS
                          </label>
                        </div>
                        <div className="flex items-center gap-2">
                          <button type="button"
                            disabled={!!sendingLetter[a.id] || (!sendChannels[a.id as string]?.email && !sendChannels[a.id as string]?.sms)}
                            onClick={() => handleSendLetter("ADDRESS", a.id as string)}
                            className="px-2.5 py-1 text-[11px] font-medium bg-violet-600 text-white rounded-md hover:bg-violet-700 disabled:opacity-50">
                            {sendingLetter[a.id] ? "Sending…" : "Send letter"}
                          </button>
                          <button type="button"
                            onClick={() => setLetterDrafts((prev) => { const next = { ...prev }; delete next[a.id as string]; return next; })}
                            className="px-2.5 py-1 text-[11px] font-medium text-slate-500 hover:text-slate-700">
                            Discard
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Status */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-[11px] uppercase tracking-wider text-slate-400 font-medium">Application status</p>
              <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${STATUS_STYLES[status]}`}>
                {STATUS_LABELS[status]}
              </span>
            </div>
            {statusError && <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2 mb-2">{statusError}</p>}
            <div className="space-y-2">
              {status !== "APPROVED" && (
                <button onClick={() => handleDecide("APPROVED")} disabled={savingStatus !== null}
                  className="w-full py-2 text-sm bg-black text-white rounded-lg hover:bg-slate-800 font-medium transition-colors disabled:opacity-50">
                  {savingStatus === "APPROVED" ? "Saving…" : "Approve applicant"}
                </button>
              )}
              {status !== "DECLINED" && (
                <button onClick={() => handleDecide("DECLINED")} disabled={savingStatus !== null}
                  className="w-full py-2 text-sm border border-red-200 text-red-600 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50">
                  {savingStatus === "DECLINED" ? "Saving…" : "Decline applicant"}
                </button>
              )}
              {status !== "MORE_INFO_REQUESTED" && (
                <button onClick={() => handleDecide("MORE_INFO_REQUESTED")} disabled={savingStatus !== null}
                  className="w-full py-2 text-sm border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50">
                  {savingStatus === "MORE_INFO_REQUESTED" ? "Saving…" : "Request more info"}
                </button>
              )}
              {status !== "IN_REVIEW" && (
                <button onClick={() => handleDecide("IN_REVIEW")} disabled={savingStatus !== null}
                  className="w-full py-2 text-sm border border-blue-200 text-blue-600 rounded-lg hover:bg-blue-50 transition-colors disabled:opacity-50">
                  {savingStatus === "IN_REVIEW" ? "Saving…" : "Mark as in review"}
                </button>
              )}
              {status !== "NOT_STARTED" && (
                <button onClick={() => handleDecide("NOT_STARTED")} disabled={savingStatus !== null}
                  className="w-full py-1.5 text-xs text-slate-400 hover:text-slate-600 transition-colors disabled:opacity-50">
                  {savingStatus === "NOT_STARTED" ? "Saving…" : "Reset to not started"}
                </button>
              )}
            </div>
          </div>

          {/* Notes */}
          <div>
            <p className="text-[11px] uppercase tracking-wider text-slate-400 font-medium mb-2">Notes</p>
            <div className="space-y-2 mb-2">
              <textarea value={newNote} onChange={(e) => setNewNote(e.target.value)} rows={2}
                placeholder="Add a note about this applicant…"
                className="w-full text-xs border border-slate-200 rounded-lg px-2.5 py-2 outline-none focus:border-black resize-none" />
              {noteError && <p className="text-xs text-red-600">{noteError}</p>}
              <button type="button" onClick={handleAddNote} disabled={addingNote || !newNote.trim()}
                className="px-3 py-1.5 text-xs font-medium bg-black text-white rounded-lg hover:bg-slate-800 disabled:opacity-50">
                {addingNote ? "Adding…" : "Add note"}
              </button>
            </div>

            {loadingNotes && <p className="text-xs text-slate-400">Loading notes…</p>}
            {!loadingNotes && notes.length === 0 && <p className="text-xs text-slate-400">No notes yet.</p>}
            <div className="space-y-1.5">
              {notes.map((n) => {
                if (n.kind === "STATUS_CHANGE") {
                  return (
                    <p key={n.id} className="text-[11px] text-slate-400 italic px-0.5">
                      {n.note} — <span className="font-medium">{n.author_name}</span>, {new Date(n.created_at).toLocaleString()}
                    </p>
                  );
                }
                const isLong = n.note.length > NOTE_COLLAPSE_THRESHOLD;
                const isExpanded = expandedNotes.has(n.id);
                const displayText = isLong && !isExpanded ? n.note.slice(0, NOTE_COLLAPSE_THRESHOLD).trimEnd() + "…" : n.note;
                return (
                  <div key={n.id} className="border border-slate-100 rounded-lg px-2.5 py-2">
                    <p className="text-xs text-slate-700 whitespace-pre-wrap">{displayText}</p>
                    {isLong && (
                      <button type="button" onClick={() => toggleNoteExpanded(n.id)}
                        className="text-[10px] font-medium text-violet-600 hover:text-violet-800 mt-1">
                        {isExpanded ? "Show less" : "Show more"}
                      </button>
                    )}
                    <p className="text-[10px] text-slate-400 mt-1">{n.author_name} · {new Date(n.created_at).toLocaleString()}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ScreeningPage() {
  const { user } = useAuth();
  const [tenants, setTenants] = useState<TenantOut[]>([]);
  const [units, setUnits] = useState<UnitDetailOut[]>([]);
  const [loading, setLoading] = useState(!MOCK_MODE);
  const [selected, setSelected] = useState<TenantOut | null>(null);
  const [statusFilter, setStatusFilter] = useState<"all" | AppStatus>("all");

  useEffect(() => {
    if (MOCK_MODE) { setLoading(false); return; }
    Promise.all([tenantsApi.listPersons(), unitsApi.listAll()])
      .then(([ppl, us]) => { setTenants(ppl); setUnits(us); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const unitsById = useMemo(() => {
    const map: Record<string, UnitInfo> = {};
    for (const u of units) map[u.id] = { label: `Unit ${u.unit_number} · ${u.property_name}`, rent: u.monthly_rent };
    return map;
  }, [units]);

  function handleStatusChange(id: string, status: AppStatus) {
    setTenants((prev) => prev.map((t) => (t.id === id ? { ...t, application_status: status } : t)));
    setSelected((prev) => (prev && prev.id === id ? { ...prev, application_status: status } : prev));
  }

  const filtered = statusFilter === "all" ? tenants : tenants.filter((t) => asStatus(t.application_status) === statusFilter);
  const inReviewCount = tenants.filter((t) => ["NOT_STARTED", "IN_REVIEW", "MORE_INFO_REQUESTED"].includes(t.application_status)).length;

  return (
    <div className="max-w-[1280px] mx-auto px-6 py-6 space-y-6">
      {selected && (
        <ApplicantDrawer
          tenant={selected}
          unit={selected.interested_unit_id ? unitsById[selected.interested_unit_id] ?? null : null}
          criminalEnabled={user?.screening_criminal_record_enabled ?? false}
          rentalHistoryEnabled={user?.screening_rental_history_enabled ?? false}
          onClose={() => setSelected(null)}
          onStatusChange={handleStatusChange}
        />
      )}

      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <p className="text-[11px] uppercase tracking-widest text-slate-400 font-medium">Applicants</p>
          <h1 className="text-xl font-bold text-slate-900 mt-0.5">Tenant screening</h1>
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Total applicants", value: tenants.length },
          { label: "Approved", value: tenants.filter((t) => t.application_status === "APPROVED").length },
          { label: "In review", value: inReviewCount },
          { label: "Declined", value: tenants.filter((t) => t.application_status === "DECLINED").length },
        ].map((k) => (
          <div key={k.label} className="bg-white rounded-xl border border-slate-200 px-5 py-4">
            <p className="text-[11px] uppercase tracking-wider text-slate-400 font-medium">{k.label}</p>
            <p className="text-2xl font-bold text-slate-900 mt-1">{k.value}</p>
          </div>
        ))}
      </div>

      {/* Filter */}
      <div className="flex items-center gap-3 flex-wrap">
        {(["all", ...STATUSES] as const).map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              statusFilter === s ? "bg-black text-white" : "bg-white border border-slate-200 text-slate-600 hover:border-slate-400"
            }`}
          >
            {s === "all" ? "All" : STATUS_LABELS[s]}
          </button>
        ))}
      </div>

      {loading && <p className="text-sm text-slate-400 text-center py-10">Loading applicants…</p>}

      {!loading && tenants.length === 0 && (
        <p className="text-sm text-slate-400 text-center py-10">
          No tenant applicants yet. Share your sign-up link from Settings to start collecting applications.
        </p>
      )}

      {/* Applicant cards grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((t) => {
          const status = asStatus(t.application_status);
          const unit = t.interested_unit_id ? unitsById[t.interested_unit_id] ?? null : null;
          const monthlyIncome = t.household_income_annual ? t.household_income_annual / 12 : t.personal_income_annual ? t.personal_income_annual / 12 : null;
          const incomeRatio = monthlyIncome && unit ? monthlyIncome / unit.rent : null;
          return (
            <div
              key={t.id}
              onClick={() => setSelected(t)}
              className="bg-white rounded-xl border border-slate-200 p-5 hover:shadow-md hover:border-slate-300 transition-all cursor-pointer"
            >
              <div className="flex items-start gap-3">
                <div className="w-14 h-14 rounded-full bg-slate-100 text-slate-600 text-sm font-bold flex items-center justify-center shrink-0">
                  {initials(t.full_name)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-slate-900 truncate">{t.full_name}</p>
                    <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${STATUS_STYLES[status]}`}>
                      {STATUS_LABELS[status]}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5 truncate">{unit ? unit.label : "No unit selected"}</p>
                  <p className="text-xs text-slate-400">{unit ? `$${unit.rent.toLocaleString()}/mo` : t.email}</p>
                </div>
              </div>

              <div className="flex items-center gap-4 mt-3 text-xs text-slate-500">
                {monthlyIncome && <span>Income <span className="font-semibold text-slate-900">${(monthlyIncome).toLocaleString(undefined, { maximumFractionDigits: 0 })}/mo</span></span>}
                {incomeRatio && <span className={`font-semibold ${incomeRatio >= 3 ? "text-emerald-600" : "text-amber-600"}`}>{incomeRatio.toFixed(1)}× rent</span>}
                <span>{t.documents.length} doc{t.documents.length === 1 ? "" : "s"}</span>
              </div>

              <div className="mt-3 text-right">
                <span className="text-[11px] text-slate-400 hover:text-black font-medium">View report →</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
