"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { unitsApi, type UnitDetailOut } from "@/lib/api";
import { MOCK_MODE } from "@/lib/useApiData";
import { CampaignModal } from "@/components/CampaignModal";

type Stage = "Available" | "Showing" | "Applied" | "Approved" | "Leased";

interface Lead {
  id: string;
  name: string;
  avatar: string;
  unit: string;
  property: string;
  address?: string;
  rent: number;
  beds: string;
  bathrooms?: number;
  squareFeet?: number | null;
  date: string;
  score?: number;
  note: string;
  stage: Stage;
  tours?: number;
  email: string;
  phone: string;
}

function unitToLead(u: UnitDetailOut): Lead {
  return {
    id: u.id,
    name: `Unit ${u.unit_number}`,
    avatar: "🏠",
    unit: u.unit_number,
    property: u.property_name,
    address: u.property_address,
    rent: u.monthly_rent,
    beds: `${u.bedrooms} bd / ${u.bathrooms} ba`,
    bathrooms: u.bathrooms,
    squareFeet: u.square_feet,
    date: "",
    note: u.property_address,
    stage: "Available",
    email: "",
    phone: "",
  };
}

const STAGES: Stage[] = ["Available", "Showing", "Applied", "Approved", "Leased"];

const STAGE_STYLES: Record<Stage, { bg: string; border: string; dot: string; count: string }> = {
  Available:  { bg: "bg-slate-50",    border: "border-slate-200", dot: "bg-slate-400",   count: "bg-slate-100 text-slate-600" },
  Showing:    { bg: "bg-blue-50",     border: "border-blue-200",  dot: "bg-blue-400",    count: "bg-blue-100 text-blue-700" },
  Applied:    { bg: "bg-violet-50",   border: "border-violet-200",dot: "bg-violet-400",  count: "bg-violet-100 text-violet-700" },
  Approved:   { bg: "bg-amber-50",    border: "border-amber-200", dot: "bg-amber-400",   count: "bg-amber-100 text-amber-700" },
  Leased:     { bg: "bg-emerald-50",  border: "border-emerald-200",dot:"bg-emerald-500", count: "bg-emerald-100 text-emerald-700" },
};

const initialLeads: Lead[] = [
  { id: "l3", name: "Aiden Park", avatar: "AP", unit: "201", property: "Sunset Towers", rent: 1600, beds: "Studio", date: "2026-06-08", note: "Toured yesterday, very interested", stage: "Showing", tours: 1, email: "aiden.park@email.com", phone: "(213) 555-0471" },
  { id: "l4", name: "Maya Torres", avatar: "MT", unit: "B1", property: "Northside Commons", rent: 1800, beds: "1 bed / 1 bath", date: "2026-06-07", note: "2nd tour scheduled for Thu", stage: "Showing", tours: 2, email: "maya.torres@email.com", phone: "(312) 555-0882" },
  { id: "l5", name: "Ryan Okafor", avatar: "RO", unit: "201", property: "Sunset Towers", rent: 1600, beds: "Studio", date: "2026-06-05", note: "Application submitted, refs pending", stage: "Applied", score: 72, email: "ryan.okafor@email.com", phone: "(323) 555-0134" },
  { id: "l6", name: "Leila Hassan", avatar: "LH", unit: "B1", property: "Northside Commons", rent: 1800, beds: "1 bed / 1 bath", date: "2026-06-06", note: "Strong application · 740 credit", stage: "Applied", score: 88, email: "leila.hassan@email.com", phone: "(773) 555-0295" },
  { id: "l7", name: "Leila Hassan", avatar: "LH", unit: "B1", property: "Northside Commons", rent: 1800, beds: "1 bed / 1 bath", date: "2026-06-09", note: "Background clear · lease sent via DocuSign", stage: "Approved", score: 88, email: "leila.hassan@email.com", phone: "(773) 555-0295" },
  { id: "l8", name: "Jordan Mills", avatar: "JM", unit: "102", property: "Sunset Towers", rent: 1950, beds: "1 bed / 1 bath", date: "2026-05-28", note: "Move-in Jun 15 · lease signed", stage: "Leased", score: 91, email: "jordan.mills@email.com", phone: "(310) 555-0763" },
];

function ScoreBadge({ score }: { score: number }) {
  const color = score >= 80 ? "text-emerald-600 bg-emerald-50" : score >= 65 ? "text-amber-600 bg-amber-50" : "text-red-600 bg-red-50";
  return <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${color}`}>{score}</span>;
}

function LeadCard({ lead, onMove, onSelect, onCreateCampaign }: {
  lead: Lead;
  onMove: (id: string, dir: 1 | -1) => void;
  onSelect: (l: Lead) => void;
  onCreateCampaign: (l: Lead) => void;
}) {
  const isUnit = lead.avatar === "🏠";
  const stageIdx = STAGES.indexOf(lead.stage);
  const canCreateCampaign = lead.stage === "Available" || lead.stage === "Showing";

  return (
    <div
      onClick={() => onSelect(lead)}
      className="bg-white rounded-xl border border-slate-200 p-3.5 cursor-pointer hover:shadow-md hover:border-slate-300 transition-all group"
    >
      <div className="flex items-start gap-2.5">
        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm shrink-0 ${isUnit ? "bg-slate-100" : "bg-black text-white text-[11px] font-bold"}`}>
          {lead.avatar}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <p className="text-xs font-semibold text-slate-900 truncate">{lead.name}</p>
            {lead.score !== undefined && <ScoreBadge score={lead.score} />}
          </div>
          <p className="text-[11px] text-slate-500 truncate">{lead.property} · Unit {lead.unit}</p>
        </div>
      </div>

      <div className="mt-2.5 flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-900">${lead.rent.toLocaleString()}<span className="text-slate-400 font-normal">/mo</span></span>
        <span className="text-[11px] text-slate-400">{lead.beds}</span>
      </div>

      <p className="text-[11px] text-slate-500 mt-1.5 leading-relaxed line-clamp-2">{lead.note}</p>

      {lead.tours && (
        <div className="mt-2 flex items-center gap-1 text-[11px] text-blue-600">
          <span>📅</span><span>{lead.tours} tour{lead.tours > 1 ? "s" : ""} scheduled</span>
        </div>
      )}

      {canCreateCampaign && (
        <div className="mt-2.5" onClick={e => e.stopPropagation()}>
          <button
            onClick={() => onCreateCampaign(lead)}
            className="w-full py-1 text-[10px] font-medium text-violet-700 border border-violet-200 rounded hover:bg-violet-50 transition-colors"
          >
            + Create new campaign
          </button>
        </div>
      )}

      {/* Move buttons */}
      <div className="flex gap-1.5 mt-3 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
        {stageIdx > 0 && (
          <button onClick={() => onMove(lead.id, -1)} className="flex-1 py-1 text-[10px] border border-slate-200 rounded text-slate-500 hover:bg-slate-50">← Back</button>
        )}
        {stageIdx < STAGES.length - 1 && (
          <button onClick={() => onMove(lead.id, 1)} className="flex-1 py-1 text-[10px] bg-black text-white rounded hover:bg-slate-800">Advance →</button>
        )}
      </div>
    </div>
  );
}

function LeadDrawer({ lead, onClose }: { lead: Lead; onClose: () => void }) {
  const isUnit = lead.avatar === "🏠";
  return (
    <div className="fixed inset-0 bg-black/30 z-50 flex justify-end">
      <div className="w-full max-w-sm bg-white h-full shadow-2xl flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-black">
          <h2 className="text-white text-sm font-semibold">{isUnit ? "Vacant unit" : "Applicant profile"}</h2>
          <button onClick={onClose} className="text-white/60 hover:text-white text-lg">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          <div className="flex items-center gap-3">
            <div className={`w-12 h-12 rounded-full flex items-center justify-center text-lg shrink-0 ${isUnit ? "bg-slate-100" : "bg-black text-white text-sm font-bold"}`}>
              {lead.avatar}
            </div>
            <div>
              <p className="font-semibold text-slate-900">{lead.name}</p>
              <p className="text-xs text-slate-500">{lead.property} · Unit {lead.unit}</p>
              {!isUnit && <p className="text-xs text-slate-500">{lead.email}</p>}
            </div>
          </div>

          <div className="bg-slate-50 rounded-xl p-4 space-y-2 text-sm">
            <p className="text-[11px] uppercase tracking-wider text-slate-400 font-medium">Details</p>
            <div className="grid grid-cols-2 gap-y-2">
              <span className="text-slate-500">Unit</span><span className="font-medium text-slate-900">{lead.unit}</span>
              <span className="text-slate-500">Property</span><span className="font-medium text-slate-900">{lead.property}</span>
              {lead.address && (<><span className="text-slate-500">Address</span><span className="font-medium text-slate-900">{lead.address}</span></>)}
              <span className="text-slate-500">Layout</span><span className="font-medium text-slate-900">{lead.beds}</span>
              {lead.squareFeet != null && (<><span className="text-slate-500">Square feet</span><span className="font-medium text-slate-900">{lead.squareFeet.toLocaleString()} sqft</span></>)}
              <span className="text-slate-500">Rent</span><span className="font-medium text-slate-900">${lead.rent.toLocaleString()}/mo</span>
              <span className="text-slate-500">Stage</span><span className="font-medium text-slate-900">{lead.stage}</span>
              {lead.score !== undefined && <><span className="text-slate-500">Score</span><ScoreBadge score={lead.score} /></>}
            </div>
          </div>

          <div>
            <p className="text-[11px] uppercase tracking-wider text-slate-400 font-medium mb-1">Note</p>
            <p className="text-sm text-slate-600 leading-relaxed">{lead.note}</p>
          </div>

          <div className="space-y-2">
            {!isUnit && (
              <>
                <button className="w-full py-2 text-sm bg-black text-white rounded-lg hover:bg-slate-800 transition-colors font-medium">Send lease via DocuSign</button>
                <button className="w-full py-2 text-sm border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors">Run screening report</button>
                <button className="w-full py-2 text-sm border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors">Schedule tour</button>
              </>
            )}
            {isUnit && (
              <>
                <button className="w-full py-2 text-sm bg-black text-white rounded-lg hover:bg-slate-800 transition-colors font-medium">Publish listing</button>
                <button className="w-full py-2 text-sm border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors">Set rent price</button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function VacancyPage() {
  const router = useRouter();
  const [leads, setLeads] = useState(initialLeads);
  const [selected, setSelected] = useState<Lead | null>(null);
  const [loadingUnits, setLoadingUnits] = useState(!MOCK_MODE);
  const [campaignUnits, setCampaignUnits] = useState<UnitDetailOut[]>([]);
  const [campaignLead, setCampaignLead] = useState<Lead | null>(null);

  useEffect(() => {
    if (MOCK_MODE) return;
    unitsApi.listAll()
      .then(units => {
        setCampaignUnits(units);
        const vacant = units.filter(u => u.status === "VACANT").map(unitToLead);
        setLeads(prev => [...vacant, ...prev]);
      })
      .catch(() => {})
      .finally(() => setLoadingUnits(false));
  }, []);

  const move = (id: string, dir: 1 | -1) => {
    setLeads(prev => prev.map(l => {
      if (l.id !== id) return l;
      const idx = STAGES.indexOf(l.stage);
      const next = STAGES[idx + dir];
      return next ? { ...l, stage: next } : l;
    }));
  };

  const byStage = (stage: Stage) => leads.filter(l => l.stage === stage);
  const totalVacant = leads.filter(l => l.stage === "Available").length;
  const totalPipeline = leads.filter(l => !["Available", "Leased"].includes(l.stage)).length;
  const totalLeased = leads.filter(l => l.stage === "Leased").length;

  return (
    <div className="max-w-[1280px] mx-auto px-6 py-6 space-y-6">
      {selected && <LeadDrawer lead={selected} onClose={() => setSelected(null)} />}
      {campaignLead && (
        <CampaignModal
          campaign={null}
          units={campaignUnits}
          initialUnitId={campaignLead.id}
          onClose={() => setCampaignLead(null)}
          onSave={() => { setCampaignLead(null); router.push("/marketing"); }}
          onPhotosChanged={() => {}}
        />
      )}

      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <p className="text-[11px] uppercase tracking-widest text-slate-400 font-medium">Leasing</p>
          <h1 className="text-xl font-bold text-slate-900 mt-0.5">Vacancy pipeline</h1>
        </div>
        <button className="px-3 py-1.5 bg-black text-white text-xs font-medium rounded-lg hover:bg-slate-800 transition-colors">
          + Publish listing
        </button>
      </div>

      {/* Summary chips */}
      <div className="flex items-center gap-3 flex-wrap">
        {[
          { label: "Vacant units", value: totalVacant, color: "bg-slate-100 text-slate-700" },
          { label: "In pipeline", value: totalPipeline, color: "bg-blue-100 text-blue-700" },
          { label: "Leased this month", value: totalLeased, color: "bg-emerald-100 text-emerald-700" },
        ].map(c => (
          <div key={c.label} className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium ${c.color}`}>
            <span className="text-base font-bold">{c.value}</span>
            <span>{c.label}</span>
          </div>
        ))}
      </div>

      {/* Kanban board */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {STAGES.map(stage => {
          const s = STAGE_STYLES[stage];
          const cards = byStage(stage);
          return (
            <div key={stage} className={`rounded-xl border ${s.border} ${s.bg} p-3 min-h-[400px] flex flex-col`}>
              {/* Column header */}
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${s.dot}`} />
                  <span className="text-xs font-semibold text-slate-700">{stage}</span>
                </div>
                <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded-full ${s.count}`}>{cards.length}</span>
              </div>

              {/* Cards */}
              <div className="flex flex-col gap-2 flex-1">
                {cards.map(lead => (
                  <LeadCard key={lead.id} lead={lead} onMove={move} onSelect={setSelected} onCreateCampaign={setCampaignLead} />
                ))}
                {cards.length === 0 && stage === "Available" && loadingUnits && (
                  <div className="flex-1 flex items-center justify-center">
                    <p className="text-[11px] text-slate-300 text-center">Loading vacant units…</p>
                  </div>
                )}
                {cards.length === 0 && !(stage === "Available" && loadingUnits) && (
                  <div className="flex-1 flex items-center justify-center">
                    <p className="text-[11px] text-slate-300 text-center">No leads</p>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
