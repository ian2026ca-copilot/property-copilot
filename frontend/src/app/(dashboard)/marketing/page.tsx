"use client";

import React, { useState, useEffect, useCallback } from "react";
import { campaignsApi, unitsApi, type CampaignOut, type UnitDetailOut } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { can } from "@/lib/roles";
import { CampaignModal, STATUS_LABEL, STATUS_STYLE } from "@/components/CampaignModal";

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

  const load = useCallback(async () => {
    try {
      const [cs, us] = await Promise.all([
        campaignsApi.list(),
        unitsApi.listAll().catch(() => []),
      ]);
      setCampaigns(cs);
      setUnits(us);
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

  // Photo uploads/removals inside the edit modal happen immediately (not
  // deferred to "Save changes"), so the list needs to stay in sync without
  // closing the modal the way handleSave does.
  function handlePhotosChanged(c: CampaignOut) {
    setCampaigns(prev => prev.map(x => x.id === c.id ? c : x));
  }

  async function handleDelete(c: CampaignOut) {
    if (!confirm(`Delete campaign "${c.title}"?`)) return;
    try {
      await campaignsApi.remove(c.id);
      setCampaigns(prev => prev.filter(x => x.id !== c.id));
      setModal(null);
    } catch { /* silent */ }
  }

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
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <p className="text-[13px] uppercase tracking-widest text-slate-400 font-medium">Growth</p>
          <h1 className="text-xl font-bold text-slate-900 mt-0.5">Marketing</h1>
        </div>
        {perms.manageMaintenance && (
          <button onClick={() => setModal("create")} className="px-4 py-2 bg-black text-white text-sm font-medium rounded-xl hover:bg-slate-800">
            + New campaign
          </button>
        )}
      </div>

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
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b border-slate-100">
                <th className="px-4 py-3 w-14"></th>
                <th className="px-4 py-3 text-[13px] uppercase tracking-wider font-medium text-slate-400">Campaign</th>
                <th className="px-4 py-3 text-[13px] uppercase tracking-wider font-medium text-slate-400">Property</th>
                <th className="px-4 py-3 text-[13px] uppercase tracking-wider font-medium text-slate-400">Unit</th>
                <th className="px-4 py-3 text-[13px] uppercase tracking-wider font-medium text-slate-400 text-right">Price</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {byStatus[tab].map(c => (
                <tr key={c.id} onClick={() => setModal(c)}
                  className="cursor-pointer hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-2.5">
                    {c.photos[0] ? (
                      <img src={c.photos[0]} alt="" className="w-10 h-10 rounded-lg object-cover" />
                    ) : (
                      <div className="w-10 h-10 rounded-lg bg-slate-100" />
                    )}
                  </td>
                  <td className="px-4 py-2.5 max-w-[260px]">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-slate-900 truncate">{c.title}</p>
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-[12px] font-medium shrink-0 ${STATUS_STYLE[c.status]}`}>
                        {STATUS_LABEL[c.status]}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-slate-600">{c.property_name ?? "—"}</td>
                  <td className="px-4 py-2.5 text-slate-600">{c.unit_number ?? "—"}</td>
                  <td className="px-4 py-2.5 text-right font-medium text-slate-900">
                    {c.monthly_rent != null ? `$${c.monthly_rent.toLocaleString()}/mo` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modal !== null && (
        <CampaignModal
          campaign={modal === "create" ? null : modal as CampaignOut}
          units={units}
          onClose={() => setModal(null)}
          onSave={handleSave}
          onPhotosChanged={handlePhotosChanged}
          onDelete={modal !== "create" ? () => handleDelete(modal as CampaignOut) : undefined}
        />
      )}

    </div>
  );
}
