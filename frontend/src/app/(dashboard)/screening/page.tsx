"use client";

import { useState } from "react";

type ScreenStatus = "Pending" | "In review" | "Approved" | "Declined" | "More info";

interface Applicant {
  id: string;
  name: string;
  avatar: string;
  email: string;
  phone: string;
  unit: string;
  property: string;
  rent: number;
  applied: string;
  status: ScreenStatus;
  score: number;
  credit: number | null;
  income: number | null; // monthly
  employment: string;
  evictions: number;
  criminal: boolean;
  aiVerdict: string;
  aiColor: "green" | "amber" | "red";
  checks: { label: string; status: "pass" | "fail" | "pending" | "warn" }[];
}

const applicants: Applicant[] = [
  {
    id: "a1", name: "Leila Hassan", avatar: "LH", email: "leila.hassan@email.com", phone: "(773) 555-0295",
    unit: "B1", property: "Northside Commons", rent: 1800, applied: "2026-06-06",
    status: "Approved", score: 88, credit: 740, income: 6200, employment: "Software engineer · 3 yrs",
    evictions: 0, criminal: false,
    aiVerdict: "Strong applicant. Income is 3.4× rent, clean history, excellent credit.",
    aiColor: "green",
    checks: [
      { label: "Credit check", status: "pass" },
      { label: "Income verification", status: "pass" },
      { label: "Employment", status: "pass" },
      { label: "Eviction history", status: "pass" },
      { label: "Criminal background", status: "pass" },
      { label: "Identity", status: "pass" },
    ],
  },
  {
    id: "a2", name: "Ryan Okafor", avatar: "RO", email: "ryan.okafor@email.com", phone: "(323) 555-0134",
    unit: "201", property: "Sunset Towers", rent: 1600, applied: "2026-06-05",
    status: "In review", score: 72, credit: 680, income: 4100, employment: "Graphic designer · 1 yr",
    evictions: 0, criminal: false,
    aiVerdict: "Moderate risk. Income barely meets 2.5× threshold. References still pending.",
    aiColor: "amber",
    checks: [
      { label: "Credit check", status: "warn" },
      { label: "Income verification", status: "warn" },
      { label: "Employment", status: "pass" },
      { label: "Eviction history", status: "pass" },
      { label: "Criminal background", status: "pass" },
      { label: "Identity", status: "pending" },
    ],
  },
  {
    id: "a3", name: "Aiden Park", avatar: "AP", email: "aiden.park@email.com", phone: "(213) 555-0471",
    unit: "201", property: "Sunset Towers", rent: 1600, applied: "2026-06-08",
    status: "Pending", score: 0, credit: null, income: null, employment: "Pending",
    evictions: 0, criminal: false,
    aiVerdict: "Screening not yet started. Awaiting applicant to submit documents.",
    aiColor: "amber",
    checks: [
      { label: "Credit check", status: "pending" },
      { label: "Income verification", status: "pending" },
      { label: "Employment", status: "pending" },
      { label: "Eviction history", status: "pending" },
      { label: "Criminal background", status: "pending" },
      { label: "Identity", status: "pending" },
    ],
  },
  {
    id: "a4", name: "Derek Shaw", avatar: "DS", email: "derek.shaw@email.com", phone: "(415) 555-0048",
    unit: "A2", property: "Cedar Row", rent: 2200, applied: "2026-06-03",
    status: "Declined", score: 38, credit: 540, income: 3100, employment: "Freelance · 6 mo",
    evictions: 1, criminal: false,
    aiVerdict: "High risk. Prior eviction, credit below threshold, income insufficient.",
    aiColor: "red",
    checks: [
      { label: "Credit check", status: "fail" },
      { label: "Income verification", status: "fail" },
      { label: "Employment", status: "warn" },
      { label: "Eviction history", status: "fail" },
      { label: "Criminal background", status: "pass" },
      { label: "Identity", status: "pass" },
    ],
  },
  {
    id: "a5", name: "Sofia Reyes", avatar: "SR", email: "sofia.reyes@email.com", phone: "(512) 555-0617",
    unit: "B1", property: "Northside Commons", rent: 1800, applied: "2026-06-09",
    status: "More info", score: 65, credit: 700, income: 4800, employment: "Nurse · 2 yrs",
    evictions: 0, criminal: false,
    aiVerdict: "Good profile but co-signer requested. 2 references still outstanding.",
    aiColor: "amber",
    checks: [
      { label: "Credit check", status: "pass" },
      { label: "Income verification", status: "pass" },
      { label: "Employment", status: "pass" },
      { label: "Eviction history", status: "pass" },
      { label: "Criminal background", status: "pass" },
      { label: "Identity", status: "warn" },
    ],
  },
];

const STATUS_STYLES: Record<ScreenStatus, string> = {
  "Approved":   "bg-emerald-100 text-emerald-700",
  "In review":  "bg-blue-100 text-blue-700",
  "Pending":    "bg-slate-100 text-slate-500",
  "Declined":   "bg-red-100 text-red-600",
  "More info":  "bg-amber-100 text-amber-700",
};

const CHECK_STYLES = {
  pass:    { dot: "bg-emerald-500", label: "text-slate-700" },
  fail:    { dot: "bg-red-500",     label: "text-red-600 font-medium" },
  warn:    { dot: "bg-amber-400",   label: "text-amber-700" },
  pending: { dot: "bg-slate-300",   label: "text-slate-400" },
};

const VERDICT_BORDER = { green: "border-emerald-200 bg-emerald-50", amber: "border-amber-200 bg-amber-50", red: "border-red-200 bg-red-50" };
const VERDICT_TEXT   = { green: "text-emerald-800", amber: "text-amber-800", red: "text-red-800" };

function ScoreRing({ score }: { score: number }) {
  const color = score >= 80 ? "#22c55e" : score >= 60 ? "#f59e0b" : score === 0 ? "#cbd5e1" : "#ef4444";
  const r = 22, circ = 2 * Math.PI * r;
  const dash = score === 0 ? 0 : (score / 100) * circ;
  return (
    <div className="relative w-14 h-14 flex items-center justify-center">
      <svg width="56" height="56" className="-rotate-90">
        <circle cx="28" cy="28" r={r} fill="none" stroke="#f1f5f9" strokeWidth="4" />
        <circle cx="28" cy="28" r={r} fill="none" stroke={color} strokeWidth="4"
          strokeDasharray={`${dash} ${circ}`} strokeLinecap="round" />
      </svg>
      <span className="absolute text-xs font-bold text-slate-900">{score > 0 ? score : "—"}</span>
    </div>
  );
}

function ApplicantDrawer({ applicant: a, onClose, onDecide }: { applicant: Applicant; onClose: () => void; onDecide: (id: string, s: ScreenStatus) => void }) {
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
            <div className="w-12 h-12 rounded-full bg-black text-white text-sm font-bold flex items-center justify-center">{a.avatar}</div>
            <div>
              <p className="font-semibold text-slate-900">{a.name}</p>
              <p className="text-xs text-slate-500">{a.email} · {a.phone}</p>
              <p className="text-xs text-slate-500 mt-0.5">Applied for Unit {a.unit} · {a.property}</p>
            </div>
          </div>

          {/* AI verdict */}
          <div className={`rounded-xl border p-3.5 ${VERDICT_BORDER[a.aiColor]}`}>
            <p className="text-[10px] uppercase tracking-wider font-medium text-slate-500 mb-1">AI recommendation</p>
            <p className={`text-xs leading-relaxed ${VERDICT_TEXT[a.aiColor]}`}>{a.aiVerdict}</p>
          </div>

          {/* Financials */}
          <div className="bg-slate-50 rounded-xl p-4 grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-[11px] text-slate-400 uppercase tracking-wider">Credit score</p>
              <p className="font-bold text-slate-900 mt-0.5">{a.credit ?? "—"}</p>
            </div>
            <div>
              <p className="text-[11px] text-slate-400 uppercase tracking-wider">Monthly income</p>
              <p className="font-bold text-slate-900 mt-0.5">{a.income ? `$${a.income.toLocaleString()}` : "—"}</p>
            </div>
            <div>
              <p className="text-[11px] text-slate-400 uppercase tracking-wider">Income ratio</p>
              <p className={`font-bold mt-0.5 ${a.income && (a.income / a.rent) >= 3 ? "text-emerald-600" : "text-amber-600"}`}>
                {a.income ? `${(a.income / a.rent).toFixed(1)}×` : "—"}
              </p>
            </div>
            <div>
              <p className="text-[11px] text-slate-400 uppercase tracking-wider">Employment</p>
              <p className="font-medium text-slate-900 text-xs mt-0.5">{a.employment}</p>
            </div>
            <div>
              <p className="text-[11px] text-slate-400 uppercase tracking-wider">Evictions</p>
              <p className={`font-bold mt-0.5 ${a.evictions > 0 ? "text-red-600" : "text-emerald-600"}`}>{a.evictions}</p>
            </div>
            <div>
              <p className="text-[11px] text-slate-400 uppercase tracking-wider">Criminal</p>
              <p className={`font-bold mt-0.5 ${a.criminal ? "text-red-600" : "text-emerald-600"}`}>{a.criminal ? "Yes" : "Clear"}</p>
            </div>
          </div>

          {/* Check list */}
          <div>
            <p className="text-[11px] uppercase tracking-wider text-slate-400 font-medium mb-2">Background checks</p>
            <div className="space-y-1.5">
              {a.checks.map(c => (
                <div key={c.label} className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${CHECK_STYLES[c.status].dot}`} />
                  <span className={`text-xs ${CHECK_STYLES[c.status].label}`}>{c.label}</span>
                  <span className="ml-auto text-[11px] text-slate-400 capitalize">{c.status}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Actions */}
          {a.status !== "Approved" && a.status !== "Declined" && (
            <div className="space-y-2">
              <button onClick={() => { onDecide(a.id, "Approved"); onClose(); }}
                className="w-full py-2 text-sm bg-black text-white rounded-lg hover:bg-slate-800 font-medium transition-colors">
                Approve applicant
              </button>
              <button onClick={() => { onDecide(a.id, "Declined"); onClose(); }}
                className="w-full py-2 text-sm border border-red-200 text-red-600 rounded-lg hover:bg-red-50 transition-colors">
                Decline applicant
              </button>
              <button className="w-full py-2 text-sm border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 transition-colors">
                Request more info
              </button>
            </div>
          )}
          {(a.status === "Approved" || a.status === "Declined") && (
            <div className={`text-center py-3 rounded-lg text-sm font-medium ${a.status === "Approved" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"}`}>
              {a.status === "Approved" ? "✓ Applicant approved" : "✕ Applicant declined"}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ScreeningPage() {
  const [apps, setApps] = useState(applicants);
  const [selected, setSelected] = useState<Applicant | null>(null);
  const [statusFilter, setStatusFilter] = useState("all");

  const decide = (id: string, status: ScreenStatus) =>
    setApps(prev => prev.map(a => a.id === id ? { ...a, status } : a));

  const filtered = statusFilter === "all" ? apps : apps.filter(a => a.status === statusFilter);

  return (
    <div className="max-w-[1280px] mx-auto px-6 py-6 space-y-6">
      {selected && (
        <ApplicantDrawer
          applicant={selected}
          onClose={() => setSelected(null)}
          onDecide={(id, s) => { decide(id, s); setApps(prev => prev.map(a => a.id === id ? { ...a, status: s } : a)); }}
        />
      )}

      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <p className="text-[11px] uppercase tracking-widest text-slate-400 font-medium">Applicants</p>
          <h1 className="text-xl font-bold text-slate-900 mt-0.5">Background and screening</h1>
        </div>
        <button className="px-3 py-1.5 bg-black text-white text-xs font-medium rounded-lg hover:bg-slate-800 transition-colors">
          + Request report
        </button>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Total applicants", value: apps.length },
          { label: "Approved",  value: apps.filter(a => a.status === "Approved").length },
          { label: "In review",  value: apps.filter(a => ["In review", "More info", "Pending"].includes(a.status)).length },
          { label: "Declined",   value: apps.filter(a => a.status === "Declined").length },
        ].map(k => (
          <div key={k.label} className="bg-white rounded-xl border border-slate-200 px-5 py-4">
            <p className="text-[11px] uppercase tracking-wider text-slate-400 font-medium">{k.label}</p>
            <p className="text-2xl font-bold text-slate-900 mt-1">{k.value}</p>
          </div>
        ))}
      </div>

      {/* Filter */}
      <div className="flex items-center gap-3">
        {["all", "Pending", "In review", "More info", "Approved", "Declined"].map(s => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              statusFilter === s ? "bg-black text-white" : "bg-white border border-slate-200 text-slate-600 hover:border-slate-400"
            }`}
          >
            {s === "all" ? "All" : s}
          </button>
        ))}
      </div>

      {/* Applicant cards grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map(a => (
          <div
            key={a.id}
            onClick={() => setSelected(a)}
            className="bg-white rounded-xl border border-slate-200 p-5 hover:shadow-md hover:border-slate-300 transition-all cursor-pointer"
          >
            <div className="flex items-start gap-3">
              <ScoreRing score={a.score} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-900">{a.name}</p>
                  <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${STATUS_STYLES[a.status]}`}>
                    {a.status}
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">Unit {a.unit} · {a.property}</p>
                <p className="text-xs text-slate-400">${a.rent.toLocaleString()}/mo · Applied {a.applied}</p>
              </div>
            </div>

            {/* Check dots row */}
            <div className="flex items-center gap-1.5 mt-3">
              {a.checks.map(c => (
                <span key={c.label} title={`${c.label}: ${c.status}`}
                  className={`w-2.5 h-2.5 rounded-full ${CHECK_STYLES[c.status].dot}`} />
              ))}
              <span className="text-[11px] text-slate-400 ml-1">
                {a.checks.filter(c => c.status === "pass").length}/{a.checks.length} passed
              </span>
            </div>

            {/* Financials row */}
            <div className="flex items-center gap-4 mt-3 text-xs text-slate-500">
              {a.credit && <span>Credit <span className="font-semibold text-slate-900">{a.credit}</span></span>}
              {a.income && <span>Income <span className="font-semibold text-slate-900">${(a.income / 1000).toFixed(1)}k</span></span>}
              {a.income && <span className={`font-semibold ${(a.income / a.rent) >= 3 ? "text-emerald-600" : "text-amber-600"}`}>{(a.income / a.rent).toFixed(1)}× rent</span>}
            </div>

            {/* AI verdict */}
            <div className={`mt-3 px-3 py-2 rounded-lg border text-[11px] leading-relaxed ${VERDICT_BORDER[a.aiColor]} ${VERDICT_TEXT[a.aiColor]}`}>
              {a.aiVerdict}
            </div>

            <div className="mt-3 text-right">
              <span className="text-[11px] text-slate-400 hover:text-black font-medium">View report →</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
