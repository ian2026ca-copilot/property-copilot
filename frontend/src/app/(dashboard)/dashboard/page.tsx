"use client";

import dynamic from "next/dynamic";
import { useEffect, useState, useMemo } from "react";
import { propertiesApi, paymentsApi, tenantsApi, type PropertyOut, type PaymentOut, type LeaseOut } from "@/lib/api";
import { MOCK_MODE } from "@/lib/useApiData";

const ForecastChart = dynamic(() => import("@/components/dashboard/ForecastChart"), { ssr: false });
const RiskDonut = dynamic(() => import("@/components/dashboard/RiskDonut"), { ssr: false });

// ─── Mock fallback data ───────────────────────────────────────────────────────

const MOCK_PROPERTIES: PropertyOut[] = [
  { id: "1", name: "Sunset Towers", address: "1420 Sunset Blvd", city: "Los Angeles", state: "CA", zip_code: "90028", property_type: "RESIDENTIAL", year_built: 1985, unit_count: 12, occupied_count: 11, cover_url: null },
  { id: "2", name: "Cedar Row", address: "88 Cedar St", city: "Austin", state: "TX", zip_code: "78701", property_type: "MIXED_USE", year_built: 2001, unit_count: 8, occupied_count: 8, cover_url: null },
  { id: "3", name: "Northside Commons", address: "310 N Oak Ave", city: "Chicago", state: "IL", zip_code: "60614", property_type: "RESIDENTIAL", year_built: 1972, unit_count: 6, occupied_count: 5, cover_url: null },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function monthKey(dateStr: string) {
  return dateStr.slice(0, 7); // "YYYY-MM"
}

function formatMonthLabel(key: string) {
  const [y, m] = key.split("-");
  return new Date(Number(y), Number(m) - 1).toLocaleString("default", { month: "short" });
}

function fmt$(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}k`;
  return `$${Math.round(n).toLocaleString()}`;
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse bg-slate-100 rounded ${className}`} />;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [properties, setProperties] = useState<PropertyOut[]>([]);
  const [payments, setPayments] = useState<PaymentOut[]>([]);
  const [leases, setLeases] = useState<LeaseOut[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (MOCK_MODE) {
      setProperties(MOCK_PROPERTIES);
      setLoading(false);
      return;
    }
    Promise.all([
      propertiesApi.list().catch(() => [] as PropertyOut[]),
      paymentsApi.list().catch(() => [] as PaymentOut[]),
      tenantsApi.list().catch(() => [] as LeaseOut[]),
    ]).then(([props, pays, ten]) => {
      setProperties(props);
      setPayments(pays);
      setLeases(ten);
    }).finally(() => setLoading(false));
  }, []);

  // ── Derived KPIs ────────────────────────────────────────────────────────────

  const totalProperties = properties.length;
  const totalUnits = properties.reduce((s, p) => s + p.unit_count, 0);
  const occupiedUnits = properties.reduce((s, p) => s + p.occupied_count, 0);
  const occupancyPct = totalUnits > 0 ? Math.round((occupiedUnits / totalUnits) * 100) : 0;
  const vacantUnits = totalUnits - occupiedUnits;

  const today = new Date().toISOString().slice(0, 10);
  const thisMonth = today.slice(0, 7);

  const collectedThisMonth = payments
    .filter(p => p.status === "PAID" && p.paid_date?.startsWith(thisMonth))
    .reduce((s, p) => s + p.amount, 0);

  const overduePayments = payments.filter(p => p.status === "OVERDUE");
  const overdueCount = overduePayments.length;
  const overdueTotal = overduePayments.reduce((s, p) => s + p.amount, 0);

  const pendingPayments = payments.filter(p => p.status === "PENDING");

  // Leases expiring within 90 days
  const in90 = new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10);
  const expiringLeases = leases.filter(l =>
    l.end_date >= today && l.end_date <= in90
  );

  // Leases expiring within 30 days
  const in30 = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
  const expiringIn30 = leases.filter(l =>
    l.end_date >= today && l.end_date <= in30
  );

  // Monthly revenue chart data — last 6 months of PAID payments
  const chartData = useMemo(() => {
    const months: string[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    }
    // Sum PAID payments per month
    const revenueByMonth: Record<string, number> = {};
    payments.filter(p => p.status === "PAID" && p.paid_date).forEach(p => {
      const mk = monthKey(p.paid_date!);
      revenueByMonth[mk] = (revenueByMonth[mk] ?? 0) + p.amount;
    });
    // Total units per property for occupancy estimate (use properties data)
    const occupancyByMonth: Record<string, number> = {};
    months.forEach(mk => {
      occupancyByMonth[mk] = occupancyPct; // current occupancy as proxy
    });

    return months.map(mk => ({
      month: formatMonthLabel(mk),
      occupancy: occupancyByMonth[mk] ?? occupancyPct,
      revenue: Math.round(revenueByMonth[mk] ?? 0),
    }));
  }, [payments, occupancyPct]);

  // ── KPI cards ────────────────────────────────────────────────────────────────

  const kpis = [
    {
      label: "Properties",
      value: loading ? null : String(totalProperties),
      sub: loading ? null : `${totalUnits} total units`,
      delta: null,
      color: "text-slate-900",
    },
    {
      label: "Occupancy",
      value: loading ? null : `${occupancyPct}%`,
      sub: loading ? null : vacantUnits > 0 ? `${vacantUnits} unit${vacantUnits > 1 ? "s" : ""} need leasing` : "Fully occupied",
      delta: null,
      color: occupancyPct >= 90 ? "text-emerald-600" : occupancyPct >= 75 ? "text-amber-600" : "text-red-600",
    },
    {
      label: "Revenue this month",
      value: loading ? null : fmt$(collectedThisMonth),
      sub: loading ? null : `${payments.filter(p => p.status === "PAID" && p.paid_date?.startsWith(thisMonth)).length} payments received`,
      delta: null,
      color: "text-slate-900",
    },
    {
      label: "Overdue",
      value: loading ? null : String(overdueCount),
      sub: loading ? null : overdueCount > 0 ? `${fmt$(overdueTotal)} past due` : "No overdue payments",
      delta: null,
      color: overdueCount > 0 ? "text-red-600" : "text-emerald-600",
    },
    {
      label: "Active leases",
      value: loading ? null : String(leases.length),
      sub: loading ? null : expiringIn30.length > 0
        ? `${expiringIn30.length} expiring in 30 days`
        : expiringLeases.length > 0
          ? `${expiringLeases.length} expiring in 90 days`
          : "No leases expiring soon",
      delta: null,
      color: "text-slate-900",
    },
  ];

  // ── Dynamic insights ──────────────────────────────────────────────────────────

  const insights = useMemo(() => {
    if (MOCK_MODE || loading) return [
      { title: "Revenue opportunity", body: "3 units are priced below market. Review pricing for make-ready units.", action: "Review" },
      { title: "Renewal timing", body: "2 leases expire within 90 days. Start calls and prioritise residents with clean payment history.", action: "Start calls" },
      { title: "Predictive maintenance", body: "Schedule preventive maintenance before coverage gap widens.", action: "Schedule" },
    ];

    const list = [];

    if (expiringLeases.length > 0) {
      const names = expiringLeases.slice(0, 2).map(l => l.tenant?.full_name ?? "Tenant").join(", ");
      list.push({
        title: `${expiringLeases.length} lease${expiringLeases.length > 1 ? "s" : ""} expiring within 90 days`,
        body: `${names}${expiringLeases.length > 2 ? ` and ${expiringLeases.length - 2} more` : ""}. Start renewal conversations now to avoid vacancy.`,
        action: "View leases",
      });
    }

    if (vacantUnits > 0) {
      list.push({
        title: `${vacantUnits} vacant unit${vacantUnits > 1 ? "s" : ""}`,
        body: `${vacantUnits} unit${vacantUnits > 1 ? "s are" : " is"} currently unoccupied. List them to recover potential revenue of ${fmt$(vacantUnits * (collectedThisMonth / Math.max(occupiedUnits, 1)))}/mo.`,
        action: "List units",
      });
    }

    if (overdueCount > 0) {
      const names = overduePayments.slice(0, 2).map(p => p.tenant_name ?? "Tenant").join(", ");
      list.push({
        title: `${overdueCount} overdue payment${overdueCount > 1 ? "s" : ""}`,
        body: `${fmt$(overdueTotal)} outstanding from ${names}${overdueCount > 2 ? ` and ${overdueCount - 2} more` : ""}. Follow up to recover.`,
        action: "View payments",
      });
    }

    if (list.length === 0) {
      list.push({
        title: "Portfolio in good shape",
        body: `${occupancyPct}% occupancy with no overdue payments and no leases expiring soon.`,
        action: "View report",
      });
    }

    return list;
  }, [loading, expiringLeases, vacantUnits, overdueCount, overduePayments, overdueTotal, occupancyPct, occupiedUnits, collectedThisMonth]);

  // ── Alerts ───────────────────────────────────────────────────────────────────

  const alerts = useMemo(() => {
    if (MOCK_MODE || loading) return [
      { title: "Unit 201 HVAC renewal", body: "Send a proactive update to affected tenants.", action: "Dispatch", severity: "high" },
      { title: "2 leases under 90 days", body: "Recommend renewal offers before this season.", action: "Prepare offers", severity: "medium" },
      { title: "Market rent moved up 3%", body: "Review renewal pricing for your properties.", action: "Analyze", severity: "low" },
    ];

    const list: { title: string; body: string; action: string; severity: string }[] = [];

    overduePayments.slice(0, 3).forEach(p => {
      list.push({
        title: `Overdue: ${p.tenant_name ?? "Unknown"} — ${p.unit_number ?? ""} ${p.property_name ?? ""}`.trim(),
        body: `${fmt$(p.amount)} overdue since ${p.due_date}. Contact tenant to arrange payment.`,
        action: "Mark paid",
        severity: "high",
      });
    });

    expiringIn30.forEach(l => {
      list.push({
        title: `Lease expiring ${l.end_date}: ${l.tenant?.full_name ?? "Tenant"}`,
        body: `Unit ${l.unit_number ?? ""} at ${l.property_name ?? ""}. Send renewal offer now.`,
        action: "Send offer",
        severity: "medium",
      });
    });

    expiringLeases.filter(l => l.end_date > in30).forEach(l => {
      list.push({
        title: `Lease expires ${l.end_date}: ${l.tenant?.full_name ?? "Tenant"}`,
        body: `Unit ${l.unit_number ?? ""} — expires within 90 days.`,
        action: "Review",
        severity: "low",
      });
    });

    if (list.length === 0) {
      list.push({
        title: "All clear",
        body: "No urgent alerts. Your portfolio is running smoothly.",
        action: "View all",
        severity: "low",
      });
    }

    return list.slice(0, 5);
  }, [loading, overduePayments, expiringIn30, expiringLeases, in30]);

  const SEVERITY_DOT: Record<string, string> = {
    high: "bg-red-500",
    medium: "bg-amber-400",
    low: "bg-slate-300",
  };

  return (
    <div className="max-w-[1280px] mx-auto px-6 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <p className="text-[13px] uppercase tracking-widest text-slate-400 font-medium">Managed portfolio</p>
          <h1 className="text-xl font-bold text-slate-900 mt-0.5">
            {loading ? "Loading dashboard…" : `${totalUnits}-unit operating dashboard`}
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-400">
            {loading ? "" : `Updated ${new Date().toLocaleDateString()}`}
          </span>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {kpis.map((k) => (
          <div key={k.label} className="bg-white rounded-xl border border-slate-200 px-5 py-4">
            <p className="text-[13px] uppercase tracking-wider text-slate-400 font-medium">{k.label}</p>
            {k.value === null ? (
              <>
                <Skeleton className="h-8 w-16 mt-2" />
                <Skeleton className="h-3 w-24 mt-2" />
              </>
            ) : (
              <>
                <p className={`text-2xl font-bold mt-1 ${k.color}`}>{k.value}</p>
                <p className="text-xs text-slate-500 mt-0.5">{k.sub}</p>
              </>
            )}
          </div>
        ))}
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-slate-900">Revenue — last 6 months</h3>
            <span className="text-xs text-slate-400">PAID payments</span>
          </div>
          {loading ? (
            <Skeleton className="h-[260px] w-full" />
          ) : (
            <ForecastChart data={chartData} />
          )}
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-slate-900">Portfolio health</h3>
            <span className="text-xs text-slate-400">Live</span>
          </div>
          {loading ? (
            <Skeleton className="h-[220px] w-full" />
          ) : (
            <RiskDonut
              occupancyPct={occupancyPct}
              overdueCount={overdueCount}
              totalLeases={leases.length}
            />
          )}
        </div>
      </div>

      {/* Summary pills */}
      {!loading && (
        <div className="flex flex-wrap gap-2">
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 rounded-full text-xs text-slate-600">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            {payments.filter(p => p.status === "PAID" && p.paid_date?.startsWith(thisMonth)).length} collected this month
          </span>
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 rounded-full text-xs text-slate-600">
            <span className="w-2 h-2 rounded-full bg-slate-300" />
            {pendingPayments.length} pending
          </span>
          {overdueCount > 0 && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-50 border border-red-200 rounded-full text-xs text-red-700">
              <span className="w-2 h-2 rounded-full bg-red-500" />
              {overdueCount} overdue — {fmt$(overdueTotal)}
            </span>
          )}
          {expiringLeases.length > 0 && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 border border-amber-200 rounded-full text-xs text-amber-700">
              <span className="w-2 h-2 rounded-full bg-amber-400" />
              {expiringLeases.length} lease{expiringLeases.length > 1 ? "s" : ""} expiring in 90 days
            </span>
          )}
        </div>
      )}

      {/* Insights + Alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-slate-900">Portfolio insights</h3>
            <span className="text-xs text-slate-400">Based on live data</span>
          </div>
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full" />)}
            </div>
          ) : (
            <div className="space-y-3">
              {insights.map((ins, i) => (
                <div key={i} className="flex gap-3 p-3 rounded-lg bg-slate-50 hover:bg-slate-100 transition-colors">
                  <div className="w-1 rounded-full bg-black shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-slate-900">{ins.title}</p>
                    <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{ins.body}</p>
                  </div>
                  <button className="text-[13px] text-black font-medium shrink-0 hover:underline">{ins.action}</button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-slate-900">Alerts and action items</h3>
            <span className="text-xs text-slate-400">Priority sorted</span>
          </div>
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full" />)}
            </div>
          ) : (
            <div className="space-y-3">
              {alerts.map((a, i) => (
                <div key={i} className="flex gap-3 p-3 rounded-lg border border-slate-100 hover:border-slate-200 transition-colors">
                  <span className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${SEVERITY_DOT[a.severity]}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-slate-900">{a.title}</p>
                    <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{a.body}</p>
                  </div>
                  <button className="text-[13px] font-medium text-black shrink-0 px-2.5 py-1 border border-black/20 rounded-lg hover:bg-black hover:text-white transition-colors">
                    {a.action}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Property breakdown table */}
      {!loading && properties.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
            <h3 className="text-sm font-semibold text-slate-900">Property breakdown</h3>
            <span className="text-xs text-slate-400">{properties.length} properties</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100">
                  {["Property", "Type", "Units", "Occupied", "Occupancy", ""].map(h => (
                    <th key={h} className="text-left text-[13px] font-medium text-slate-400 uppercase tracking-wider px-5 py-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {properties.map(p => {
                  const occ = p.unit_count > 0 ? Math.round((p.occupied_count / p.unit_count) * 100) : 0;
                  return (
                    <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-5 py-3">
                        <p className="text-xs font-semibold text-slate-900">{p.name}</p>
                        <p className="text-[13px] text-slate-400">{p.address}, {p.city}</p>
                      </td>
                      <td className="px-5 py-3 text-xs text-slate-500 capitalize">{p.property_type.replace("_", " ").toLowerCase()}</td>
                      <td className="px-5 py-3 text-xs text-slate-600">{p.unit_count}</td>
                      <td className="px-5 py-3 text-xs text-slate-600">{p.occupied_count}</td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden w-16">
                            <div className="h-full bg-black rounded-full" style={{ width: `${occ}%` }} />
                          </div>
                          <span className={`text-xs font-medium ${occ >= 90 ? "text-emerald-600" : occ >= 75 ? "text-amber-600" : "text-red-600"}`}>{occ}%</span>
                        </div>
                      </td>
                      <td className="px-5 py-3 text-right">
                        {p.occupied_count < p.unit_count && (
                          <span className="text-[13px] text-amber-600 font-medium">{p.unit_count - p.occupied_count} vacant</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
