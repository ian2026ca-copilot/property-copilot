"use client";

import { useEffect, useState } from "react";
import { adminApi, OwnerRowOut, OwnerDetailOut } from "@/lib/adminApi";
import { setToken } from "@/lib/auth";

const STATUS_STYLES: Record<string, string> = {
  trialing: "bg-blue-100 text-blue-700",
  active: "bg-emerald-100 text-emerald-700",
  past_due: "bg-amber-100 text-amber-700",
  canceled: "bg-slate-100 text-slate-500",
};

function StatusPill({ owner }: { owner: OwnerRowOut }) {
  if (owner.is_suspended) return <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-red-100 text-red-700">Suspended</span>;
  if (owner.billing_exempt) return <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-violet-100 text-violet-700">Comped</span>;
  const status = owner.subscription_status;
  if (!status) return <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-slate-100 text-slate-500">No subscription</span>;
  return (
    <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${STATUS_STYLES[status] ?? "bg-slate-100 text-slate-500"}`}>
      {status.replace("_", " ")}{owner.cancel_at_period_end ? " · cancelling" : ""}
    </span>
  );
}

function StatsOverview({ owners }: { owners: OwnerRowOut[] }) {
  const active = owners.filter((o) => o.subscription_status === "active").length;
  const trialing = owners.filter((o) => o.subscription_status === "trialing").length;
  const pastDue = owners.filter((o) => o.subscription_status === "past_due").length;
  const comped = owners.filter((o) => o.billing_exempt).length;
  const suspended = owners.filter((o) => o.is_suspended).length;
  const totalProperties = owners.reduce((sum, o) => sum + o.property_count, 0);
  const totalTenants = owners.reduce((sum, o) => sum + o.tenant_count, 0);

  const cards: { label: string; value: number; accent?: string }[] = [
    { label: "Owners", value: owners.length },
    { label: "Active", value: active, accent: "text-emerald-600" },
    { label: "Trialing", value: trialing, accent: "text-blue-600" },
    { label: "Past due", value: pastDue, accent: "text-amber-600" },
    { label: "Comped", value: comped, accent: "text-violet-600" },
    { label: "Suspended", value: suspended, accent: "text-red-600" },
    { label: "Properties", value: totalProperties },
    { label: "Tenants", value: totalTenants },
  ];

  return (
    <div className="grid grid-cols-4 lg:grid-cols-8 gap-3">
      {cards.map((c) => (
        <div key={c.label} className="bg-white rounded-xl border border-slate-200 px-3 py-3">
          <p className={`text-xl font-semibold ${c.accent ?? "text-slate-900"}`}>{c.value}</p>
          <p className="text-[11px] text-slate-400 mt-0.5">{c.label}</p>
        </div>
      ))}
    </div>
  );
}

function OwnerDetailDrawer({ orgId, onClose }: { orgId: string; onClose: () => void }) {
  const [detail, setDetail] = useState<OwnerDetailOut | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [impersonating, setImpersonating] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError(""); setDetail(null);
    adminApi.getOwnerDetail(orgId)
      .then((d) => { if (!cancelled) setDetail(d); })
      .catch((e: unknown) => { if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [orgId]);

  async function handleImpersonate() {
    setImpersonating(true); setError("");
    try {
      const { access_token } = await adminApi.impersonate(orgId);
      setToken(access_token);
      window.location.href = "/dashboard";
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to log in as owner");
      setImpersonating(false);
    }
  }

  return (
    <div className="fixed inset-0 z-20 flex justify-end">
      <div className="absolute inset-0 bg-black/20" onClick={onClose} />
      <div className="relative w-full max-w-md h-full bg-white shadow-xl overflow-y-auto p-6 space-y-5">
        <div className="flex items-start justify-between">
          <h2 className="text-base font-semibold text-slate-900">{detail?.organization_name ?? "Owner detail"}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-sm">✕</button>
        </div>

        {loading && <p className="text-xs text-slate-400">Loading…</p>}
        {error && <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

        {detail && (
          <>
            <div>
              <button
                type="button"
                onClick={handleImpersonate}
                disabled={impersonating || detail.is_suspended || !detail.owner_email}
                className="w-full px-4 py-2 text-sm bg-black text-white rounded-lg hover:bg-slate-800 font-medium disabled:opacity-50 transition-colors"
              >
                {impersonating ? "Logging in…" : "Log in as owner →"}
              </button>
              {detail.is_suspended && (
                <p className="text-[11px] text-red-600 mt-1">Reactivate this organization before logging in as its owner.</p>
              )}
              {!detail.owner_email && !detail.is_suspended && (
                <p className="text-[11px] text-slate-400 mt-1">This organization has no owner to log in as.</p>
              )}
            </div>

            <div>
              <p className="text-[11px] uppercase tracking-wider text-slate-400 font-medium mb-2">Owner</p>
              <p className="text-sm text-slate-900">{detail.owner_name ?? "—"}</p>
              <p className="text-xs text-slate-500">{detail.owner_email}</p>
              {detail.owner_phone && <p className="text-xs text-slate-500">{detail.owner_phone}</p>}
              <p className="text-[11px] text-slate-400 mt-1">/{detail.organization_slug} · created {new Date(detail.created_at).toLocaleDateString()}</p>
            </div>

            <div>
              <p className="text-[11px] uppercase tracking-wider text-slate-400 font-medium mb-2">Billing</p>
              <p className="text-sm text-slate-700">
                {detail.billing_exempt ? "Comped" : detail.subscription_status ? detail.subscription_status.replace("_", " ") : "No subscription"}
                {detail.is_suspended && <span className="text-red-600"> · Suspended</span>}
                {detail.cancel_at_period_end && <span className="text-amber-600"> · Cancelling</span>}
              </p>
              {detail.trial_ends_at && (
                <p className="text-xs text-slate-400">Trial ends {new Date(detail.trial_ends_at).toLocaleDateString()}</p>
              )}
              {detail.stripe_customer_id && (
                <p className="text-[11px] text-slate-400 mt-1 font-mono break-all">customer: {detail.stripe_customer_id}</p>
              )}
              {detail.stripe_subscription_id && (
                <p className="text-[11px] text-slate-400 font-mono break-all">subscription: {detail.stripe_subscription_id}</p>
              )}
            </div>

            <div>
              <p className="text-[11px] uppercase tracking-wider text-slate-400 font-medium mb-2">
                Team ({detail.tenant_count} tenants · {detail.vendor_count} vendors)
              </p>
              <div className="space-y-1.5">
                {detail.team.map((m) => (
                  <div key={m.user_id} className="flex items-center justify-between text-xs">
                    <span className="text-slate-700">{m.name} <span className="text-slate-400">{m.email}</span></span>
                    <span className="text-slate-400">{m.role}</span>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <p className="text-[11px] uppercase tracking-wider text-slate-400 font-medium mb-2">
                Properties ({detail.property_count})
              </p>
              {detail.properties.length === 0 ? (
                <p className="text-xs text-slate-400">No properties yet.</p>
              ) : (
                <div className="space-y-2">
                  {detail.properties.map((p) => (
                    <div key={p.id} className="border border-slate-100 rounded-lg px-3 py-2">
                      <p className="text-sm font-medium text-slate-900">{p.name}</p>
                      <p className="text-xs text-slate-400">{p.address}, {p.city}, {p.state} · {p.unit_count} unit{p.unit_count === 1 ? "" : "s"}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <p className="text-[11px] uppercase tracking-wider text-slate-400 font-medium mb-2">Payments</p>
              <div className="grid grid-cols-3 gap-2 mb-3">
                <div className="bg-emerald-50 rounded-lg px-2.5 py-2">
                  <p className="text-sm font-semibold text-emerald-700">${detail.payments_collected_total.toLocaleString()}</p>
                  <p className="text-[10px] text-emerald-600">Collected</p>
                </div>
                <div className="bg-red-50 rounded-lg px-2.5 py-2">
                  <p className="text-sm font-semibold text-red-700">${detail.payments_overdue_total.toLocaleString()}</p>
                  <p className="text-[10px] text-red-600">Overdue ({detail.payments_overdue_count})</p>
                </div>
                <div className="bg-slate-50 rounded-lg px-2.5 py-2">
                  <p className="text-sm font-semibold text-slate-700">${detail.payments_pending_total.toLocaleString()}</p>
                  <p className="text-[10px] text-slate-500">Pending</p>
                </div>
              </div>
              {detail.recent_payments.length === 0 ? (
                <p className="text-xs text-slate-400">No payments recorded yet.</p>
              ) : (
                <div className="space-y-1.5">
                  {detail.recent_payments.map((p) => (
                    <div key={p.id} className="flex items-center justify-between text-xs border-b border-slate-50 pb-1.5">
                      <span className="text-slate-700">
                        {p.tenant_name ?? "—"}
                        <span className="text-slate-400"> · {p.payment_type.toLowerCase().replace("_", " ")}</span>
                      </span>
                      <span className="text-right">
                        <span className="text-slate-900 font-medium">${p.amount.toLocaleString()}</span>{" "}
                        <span className="text-slate-400">{p.due_date}</span>{" "}
                        <span className={
                          p.status === "PAID" ? "text-emerald-600"
                          : p.status === "OVERDUE" || p.status === "LATE" ? "text-red-600"
                          : "text-slate-400"
                        }>{p.status.toLowerCase()}</span>
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function AdminOwnersPage() {
  const [owners, setOwners] = useState<OwnerRowOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actingOn, setActingOn] = useState<string | null>(null);
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);

  async function load() {
    setLoading(true); setError("");
    try {
      setOwners(await adminApi.listOwners());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load owners");
    } finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  async function runAction(orgId: string, action: (id: string) => Promise<unknown>, confirmMsg?: string) {
    if (confirmMsg && !window.confirm(confirmMsg)) return;
    setActingOn(orgId); setError("");
    try {
      await action(orgId);
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Action failed");
    } finally { setActingOn(null); }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Owners</h1>
        <p className="text-sm text-slate-500 mt-0.5">Every owner organization, subscription status, and usage.</p>
      </div>

      {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

      {!loading && owners.length > 0 && <StatsOverview owners={owners} />}

      {loading ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : owners.length === 0 ? (
        <p className="text-sm text-slate-400">No owner organizations yet.</p>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs text-slate-400 uppercase tracking-wider">
                <th className="px-4 py-3 font-medium">Organization</th>
                <th className="px-4 py-3 font-medium">Owner</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Trial ends / renews</th>
                <th className="px-4 py-3 font-medium">Properties</th>
                <th className="px-4 py-3 font-medium">Tenants</th>
                <th className="px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {owners.map((o) => {
                const busy = actingOn === o.organization_id;
                return (
                  <tr key={o.organization_id} onClick={() => setSelectedOrgId(o.organization_id)}
                    className="border-b border-slate-50 last:border-0 cursor-pointer hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-900 hover:text-violet-700">
                      {o.organization_name}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {o.owner_name ?? "—"}
                      {o.owner_email && <span className="block text-xs text-slate-400">{o.owner_email}</span>}
                    </td>
                    <td className="px-4 py-3"><StatusPill owner={o} /></td>
                    <td className="px-4 py-3 text-slate-500 text-xs">
                      {o.trial_ends_at ? new Date(o.trial_ends_at).toLocaleDateString() : "—"}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{o.property_count}</td>
                    <td className="px-4 py-3 text-slate-600">{o.tenant_count}</td>
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <div className="flex flex-wrap gap-1.5">
                        {o.is_suspended ? (
                          <button disabled={busy} onClick={() => runAction(o.organization_id, adminApi.reactivate)}
                            className="text-xs font-medium text-emerald-700 hover:text-emerald-900 disabled:opacity-50">
                            Reactivate
                          </button>
                        ) : (
                          <button disabled={busy} onClick={() => runAction(o.organization_id, adminApi.suspend, `Suspend ${o.organization_name}? All members will lose access immediately.`)}
                            className="text-xs font-medium text-red-600 hover:text-red-800 disabled:opacity-50">
                            Suspend
                          </button>
                        )}
                        <span className="text-slate-200">·</span>
                        {o.billing_exempt ? (
                          <button disabled={busy} onClick={() => runAction(o.organization_id, adminApi.uncomp)}
                            className="text-xs font-medium text-slate-500 hover:text-slate-700 disabled:opacity-50">
                            Un-comp
                          </button>
                        ) : (
                          <button disabled={busy} onClick={() => runAction(o.organization_id, adminApi.comp)}
                            className="text-xs font-medium text-violet-700 hover:text-violet-900 disabled:opacity-50">
                            Comp
                          </button>
                        )}
                        <span className="text-slate-200">·</span>
                        <button disabled={busy} onClick={() => runAction(o.organization_id, adminApi.refund, `Refund ${o.organization_name}'s latest invoice? This cannot be undone.`)}
                          className="text-xs font-medium text-amber-700 hover:text-amber-900 disabled:opacity-50">
                          Refund
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {selectedOrgId && <OwnerDetailDrawer orgId={selectedOrgId} onClose={() => setSelectedOrgId(null)} />}
    </div>
  );
}
