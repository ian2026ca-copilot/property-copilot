"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";

// ─── Nav ───────────────────────────────────────────────────────────────────────

function Nav() {
  return (
    <nav className="fixed top-0 inset-x-0 z-40 bg-white/80 backdrop-blur border-b border-slate-100">
      <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
        <Link href="/" className="inline-flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center text-white font-bold text-xs">PC</div>
          <span className="text-sm font-semibold text-slate-900">Property Copilot</span>
        </Link>
        <div className="flex items-center gap-3">
          <Link href="/login" className="text-sm text-slate-600 hover:text-slate-900 font-medium px-3 py-1.5">
            Sign in
          </Link>
          <Link href="/register" className="text-sm bg-black text-white font-medium px-4 py-1.5 rounded-lg hover:bg-slate-800 transition-colors">
            Get started free
          </Link>
        </div>
      </div>
    </nav>
  );
}

// ─── Hero ──────────────────────────────────────────────────────────────────────

function Hero() {
  return (
    <section className="pt-32 pb-20 px-6 text-center">
      <div className="max-w-3xl mx-auto">
        <div className="inline-flex items-center gap-2 bg-blue-50 text-blue-700 text-xs font-medium px-3 py-1.5 rounded-full mb-6 border border-blue-100">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
          AI-powered property management
        </div>
        <h1 className="text-5xl font-bold text-slate-900 leading-tight tracking-tight mb-5">
          Manage every property.<br />
          <span className="text-blue-600">All in one place.</span>
        </h1>
        <p className="text-lg text-slate-500 leading-relaxed mb-8 max-w-xl mx-auto">
          Property Copilot handles rent collection, maintenance, tenant communication, vendor coordination, and marketing — so you can focus on growing your portfolio.
        </p>
        <div className="flex items-center justify-center gap-3 flex-wrap">
          <Link href="/register" className="px-6 py-3 bg-black text-white font-semibold rounded-xl hover:bg-slate-800 transition-colors text-sm shadow-sm">
            Start for free →
          </Link>
          <Link href="/login" className="px-6 py-3 border border-slate-200 text-slate-700 font-medium rounded-xl hover:bg-slate-50 transition-colors text-sm">
            Sign in to dashboard
          </Link>
        </div>
        <p className="text-xs text-slate-400 mt-4">No credit card required · Setup in 5 minutes</p>
      </div>

      {/* Dashboard preview */}
      <div className="max-w-5xl mx-auto mt-16">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl shadow-slate-200/60 overflow-hidden">
          {/* Browser chrome */}
          <div className="flex items-center gap-2 px-4 py-3 bg-slate-50 border-b border-slate-100">
            <div className="flex gap-1.5">
              <div className="w-3 h-3 rounded-full bg-red-400" />
              <div className="w-3 h-3 rounded-full bg-amber-400" />
              <div className="w-3 h-3 rounded-full bg-green-400" />
            </div>
            <div className="flex-1 mx-4 bg-white border border-slate-200 rounded-md px-3 py-1 text-xs text-slate-400 text-center">
              app.propertycopilot.com/dashboard
            </div>
          </div>
          {/* Fake dashboard */}
          <div className="flex h-80 bg-slate-50">
            {/* Sidebar */}
            <div className="w-48 bg-white border-r border-slate-100 py-4 px-3 space-y-1 shrink-0">
              {["Dashboard", "Properties", "Tenants", "Maintenance", "Payments", "Marketing", "Vendors"].map((item, i) => (
                <div key={item} className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium ${i === 0 ? "bg-slate-900 text-white" : "text-slate-500"}`}>
                  <div className={`w-1.5 h-1.5 rounded-full ${i === 0 ? "bg-white" : "bg-slate-300"}`} />
                  {item}
                </div>
              ))}
            </div>
            {/* Main */}
            <div className="flex-1 p-5 space-y-4 overflow-hidden">
              {/* Stat cards */}
              <div className="grid grid-cols-4 gap-3">
                {[
                  { label: "Total Units", value: "48", color: "text-slate-900" },
                  { label: "Occupied", value: "44", color: "text-emerald-600" },
                  { label: "Rent Due", value: "$62,400", color: "text-blue-600" },
                  { label: "Open Requests", value: "7", color: "text-amber-600" },
                ].map(s => (
                  <div key={s.label} className="bg-white rounded-xl border border-slate-100 p-3 shadow-sm">
                    <p className="text-[10px] text-slate-400 mb-1">{s.label}</p>
                    <p className={`text-lg font-bold ${s.color}`}>{s.value}</p>
                  </div>
                ))}
              </div>
              {/* Table rows */}
              <div className="bg-white rounded-xl border border-slate-100 overflow-hidden shadow-sm">
                <div className="px-4 py-2.5 border-b border-slate-50 flex justify-between items-center">
                  <span className="text-[11px] font-semibold text-slate-600 uppercase tracking-wider">Recent maintenance</span>
                  <div className="w-16 h-4 bg-slate-100 rounded" />
                </div>
                {[
                  { unit: "Unit 4B", issue: "Leaky faucet", badge: "IN PROGRESS", color: "bg-amber-100 text-amber-700" },
                  { unit: "Unit 2A", issue: "HVAC filter replacement", badge: "SCHEDULED", color: "bg-blue-100 text-blue-700" },
                  { unit: "Unit 7C", issue: "Door lock broken", badge: "OPEN", color: "bg-slate-100 text-slate-600" },
                ].map((row, i) => (
                  <div key={i} className="flex items-center gap-3 px-4 py-2.5 border-b border-slate-50 last:border-0">
                    <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-[10px] font-bold text-slate-500 shrink-0">{row.unit.slice(-2)}</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-slate-700">{row.unit}</p>
                      <p className="text-[10px] text-slate-400 truncate">{row.issue}</p>
                    </div>
                    <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${row.color}`}>{row.badge}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── Features ─────────────────────────────────────────────────────────────────

const FEATURES = [
  {
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
      </svg>
    ),
    title: "Property & Unit Management",
    desc: "Track every property, unit, lease, and tenant in one organised dashboard. Add photos, set rent, and manage occupancy at a glance.",
  },
  {
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    title: "Rent Collection & Payments",
    desc: "Track rent payments, record transactions, and monitor overdue balances automatically. Keep your cash flow clear without chasing spreadsheets.",
  },
  {
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M11 4a2 2 0 114 0v1a1 1 0 001 1h3a1 1 0 011 1v3a1 1 0 01-1 1h-1a2 2 0 100 4h1a1 1 0 011 1v3a1 1 0 01-1 1h-3a1 1 0 01-1-1v-1a2 2 0 10-4 0v1a1 1 0 01-1 1H7a1 1 0 01-1-1v-3a1 1 0 00-1-1H4a2 2 0 110-4h1a1 1 0 001-1V7a1 1 0 011-1h3a1 1 0 001-1V4z" />
      </svg>
    ),
    title: "Maintenance Requests",
    desc: "Tenants submit requests from their portal. You assign vendors, track status from open to closed, and get photo proof of completion.",
  },
  {
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
    title: "Tenant & Vendor Portals",
    desc: "Tenants get their own portal for requests and lease docs. Vendors see their assigned jobs, update status, and upload completion photos.",
  },
  {
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" />
      </svg>
    ),
    title: "Marketing Campaigns",
    desc: "Create rental campaigns with photos, pricing, and contact info. Publish directly to your Facebook Page with one click.",
  },
  {
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
      </svg>
    ),
    title: "Role-Based Access",
    desc: "Owner, Manager, Agent, Tenant, and Vendor roles — each with the right level of access. Invite your team and keep data where it belongs.",
  },
];

function Features() {
  return (
    <section className="py-20 px-6 bg-slate-50">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold text-slate-900 mb-3">Everything you need to run your properties</h2>
          <p className="text-slate-500 max-w-xl mx-auto">From a single unit to a large portfolio — Property Copilot scales with you.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {FEATURES.map((f) => (
            <div key={f.title} className="bg-white rounded-2xl border border-slate-100 p-6 hover:border-slate-200 hover:shadow-sm transition-all">
              <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center mb-4">
                {f.icon}
              </div>
              <h3 className="text-sm font-semibold text-slate-900 mb-2">{f.title}</h3>
              <p className="text-sm text-slate-500 leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── How it works ─────────────────────────────────────────────────────────────

function HowItWorks() {
  const steps = [
    {
      num: "1",
      title: "Set up your organization",
      desc: "Register in under a minute. Add your properties, units, and invite your team — owners, managers, agents.",
    },
    {
      num: "2",
      title: "Add tenants & vendors",
      desc: "Tenants get instant portal access to submit maintenance requests and view their lease. Vendors receive job assignments automatically.",
    },
    {
      num: "3",
      title: "Run everything from one dashboard",
      desc: "Track rent, handle maintenance, market vacancies, and manage your whole team — without switching between tools.",
    },
  ];

  return (
    <section className="py-20 px-6">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold text-slate-900 mb-3">Up and running in minutes</h2>
          <p className="text-slate-500">No complex setup. No training required.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {steps.map((s) => (
            <div key={s.num} className="text-center">
              <div className="w-12 h-12 rounded-2xl bg-black text-white text-lg font-bold flex items-center justify-center mx-auto mb-4">
                {s.num}
              </div>
              <h3 className="text-sm font-semibold text-slate-900 mb-2">{s.title}</h3>
              <p className="text-sm text-slate-500 leading-relaxed">{s.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Roles section ─────────────────────────────────────────────────────────────

function Roles() {
  const roles = [
    { emoji: "🏢", title: "Owners", desc: "Full control. See every property, every dollar, every request. Manage your entire portfolio from one screen." },
    { emoji: "🧑‍💼", title: "Property Managers", desc: "Manage day-to-day operations — assign maintenance, approve requests, track rent, communicate with tenants." },
    { emoji: "🤝", title: "Leasing Agents", desc: "View listings, handle tenant inquiries, and assist with onboarding. Read-only access to financials." },
    { emoji: "🏠", title: "Tenants", desc: "Submit and track maintenance requests, access lease documents, and communicate with management — all from a dedicated portal." },
    { emoji: "🔧", title: "Vendors", desc: "Receive job assignments, update status, upload completion photos, and manage your availability schedule." },
  ];

  return (
    <section className="py-20 px-6 bg-slate-50">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-10">
          <h2 className="text-3xl font-bold text-slate-900 mb-3">Built for every person in your operation</h2>
          <p className="text-slate-500">One platform, five roles — each with the tools they actually need.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {roles.map((r) => (
            <div key={r.title} className="bg-white rounded-2xl border border-slate-100 p-5">
              <div className="text-2xl mb-3">{r.emoji}</div>
              <h3 className="text-sm font-semibold text-slate-900 mb-1.5">{r.title}</h3>
              <p className="text-xs text-slate-500 leading-relaxed">{r.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── CTA ──────────────────────────────────────────────────────────────────────

function CTA() {
  return (
    <section className="py-24 px-6">
      <div className="max-w-2xl mx-auto text-center">
        <h2 className="text-4xl font-bold text-slate-900 mb-4 tracking-tight">
          Ready to simplify your property management?
        </h2>
        <p className="text-slate-500 mb-8 text-lg">
          Join property managers who use Property Copilot to save hours every week.
        </p>
        <Link href="/register"
          className="inline-flex items-center gap-2 px-8 py-3.5 bg-black text-white font-semibold rounded-xl hover:bg-slate-800 transition-colors text-sm shadow-lg shadow-black/10">
          Create your free account →
        </Link>
        <p className="text-xs text-slate-400 mt-4">No credit card · Cancel anytime</p>
      </div>
    </section>
  );
}

// ─── Footer ───────────────────────────────────────────────────────────────────

function Footer() {
  return (
    <footer className="border-t border-slate-100 py-8 px-6">
      <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-blue-600 flex items-center justify-center text-white font-bold text-[10px]">PC</div>
          <span className="text-sm font-semibold text-slate-700">Property Copilot</span>
        </div>
        <div className="flex items-center gap-5 text-xs text-slate-400">
          <Link href="/login" className="hover:text-slate-700 transition-colors">Sign in</Link>
          <Link href="/register" className="hover:text-slate-700 transition-colors">Register</Link>
          <Link href="/forgot-password" className="hover:text-slate-700 transition-colors">Reset password</Link>
        </div>
        <p className="text-xs text-slate-400">© {new Date().getFullYear()} Property Copilot</p>
      </div>
    </footer>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function HomePage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user) router.replace("/dashboard");
  }, [user, loading, router]);

  if (loading || user) return null;

  return (
    <div className="min-h-screen bg-white text-slate-900">
      <Nav />
      <main>
        <Hero />
        <Features />
        <HowItWorks />
        <Roles />
        <CTA />
      </main>
      <Footer />
    </div>
  );
}
