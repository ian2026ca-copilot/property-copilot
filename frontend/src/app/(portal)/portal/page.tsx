"use client";

import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { profileApi } from "@/lib/api";

type Tab = "home" | "profile" | "payments" | "maintenance" | "documents" | "messages";

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "home",        label: "Home",        icon: "🏠" },
  { id: "profile",     label: "Profile",     icon: "👤" },
  { id: "payments",    label: "Payments",    icon: "💳" },
  { id: "maintenance", label: "Maintenance", icon: "🔧" },
  { id: "documents",   label: "Documents",   icon: "📄" },
  { id: "messages",    label: "Messages",    icon: "💬" },
];

// ─── Mock data ────────────────────────────────────────────────────────────────

const paymentHistory = [
  { id: "p1", month: "June 2026",     amount: 1950, status: "Due",  dueDate: "2026-06-15", paid: null },
  { id: "p2", month: "May 2026",      amount: 1950, status: "Paid", dueDate: "2026-05-01", paid: "2026-04-30" },
  { id: "p3", month: "April 2026",    amount: 1950, status: "Paid", dueDate: "2026-04-01", paid: "2026-03-29" },
  { id: "p4", month: "March 2026",    amount: 1950, status: "Paid", dueDate: "2026-03-01", paid: "2026-03-01" },
  { id: "p5", month: "February 2026", amount: 1950, status: "Paid", dueDate: "2026-02-01", paid: "2026-02-01" },
];

const maintenanceRequests = [
  { id: "m1", title: "HVAC unit not cooling",         category: "HVAC",      status: "In Progress", submitted: "2026-06-09", update: "Technician dispatched. ETA tomorrow." },
  { id: "m2", title: "Bathroom faucet dripping",      category: "Plumbing",  status: "Open",        submitted: "2026-06-05", update: null },
  { id: "m3", title: "Kitchen light bulb replacement", category: "Electrical", status: "Resolved",   submitted: "2026-05-20", update: "Fixed on May 22." },
];

const documents = [
  { id: "d1", name: "Lease Agreement",       type: "PDF",  date: "2026-01-15", size: "1.2 MB", tag: "lease" },
  { id: "d2", name: "Move-In Checklist",     type: "PDF",  date: "2026-01-15", size: "420 KB", tag: "checklist" },
  { id: "d3", name: "Community Rules",       type: "PDF",  date: "2026-01-15", size: "215 KB", tag: "rules" },
  { id: "d4", name: "Renters Insurance Form", type: "PDF", date: "2026-02-01", size: "98 KB",  tag: "insurance" },
  { id: "d5", name: "May 2026 Receipt",      type: "PDF",  date: "2026-05-01", size: "55 KB",  tag: "receipt" },
  { id: "d6", name: "April 2026 Receipt",    type: "PDF",  date: "2026-04-01", size: "55 KB",  tag: "receipt" },
];

const messages = [
  { id: "msg1", from: "Alex Morgan", avatar: "AM", role: "Property Manager", text: "Hi Emma! Just confirming that the HVAC technician is scheduled for tomorrow between 9–11am. Please ensure someone is home to grant access.", time: "Jun 10, 11:42 AM", mine: false },
  { id: "msg2", from: "Emma Jones", avatar: "EJ", role: "You", text: "Thanks Alex, I'll be home. Will the technician need access to the roof unit as well?", time: "Jun 10, 12:05 PM", mine: true },
  { id: "msg3", from: "Alex Morgan", avatar: "AM", role: "Property Manager", text: "Yes, they'll need roof access. I'll let them know to coordinate with you. Let us know if you have any other questions!", time: "Jun 10, 12:18 PM", mine: false },
];

// ─── Sub-components ──────────────────────────────────────────────────────────

function PayModal({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState<"form" | "confirm" | "done">("form");
  const [method, setMethod] = useState("bank");
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
        {step === "done" ? (
          <div className="p-8 text-center">
            <div className="w-14 h-14 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4 text-2xl">✓</div>
            <h3 className="text-base font-bold text-slate-900">Payment submitted!</h3>
            <p className="text-sm text-slate-500 mt-1">$1,950.00 for June 2026</p>
            <button onClick={onClose} className="mt-6 w-full py-2.5 bg-black text-white text-sm rounded-xl font-medium">Done</button>
          </div>
        ) : step === "confirm" ? (
          <>
            <div className="px-6 py-5 border-b border-slate-100">
              <h2 className="text-sm font-semibold text-slate-900">Confirm payment</h2>
            </div>
            <div className="px-6 py-5 space-y-3">
              <div className="bg-slate-50 rounded-xl p-4 space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-slate-500">Amount</span><span className="font-semibold">$1,950.00</span></div>
                <div className="flex justify-between"><span className="text-slate-500">For</span><span className="font-medium">June 2026 rent</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Method</span><span className="font-medium">{method === "bank" ? "Bank transfer (ACH)" : "Credit/Debit card"}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Processed</span><span className="font-medium">1–2 business days</span></div>
              </div>
            </div>
            <div className="flex gap-2 px-6 pb-5">
              <button onClick={() => setStep("form")} className="flex-1 py-2 text-sm border border-slate-200 rounded-lg text-slate-600">Back</button>
              <button onClick={() => setStep("done")} className="flex-1 py-2 text-sm bg-black text-white rounded-lg font-medium">Confirm & pay</button>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h2 className="text-sm font-semibold text-slate-900">Pay rent</h2>
              <button onClick={onClose} className="text-slate-400 hover:text-slate-700">✕</button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div className="bg-black text-white rounded-xl p-4">
                <p className="text-xs text-white/60">Amount due</p>
                <p className="text-2xl font-bold mt-0.5">$1,950.00</p>
                <p className="text-xs text-white/60 mt-1">June 2026 · Due Jun 15</p>
              </div>
              <div>
                <p className="text-xs font-medium text-slate-700 mb-2">Payment method</p>
                <div className="space-y-2">
                  {[
                    { id: "bank", label: "Bank transfer (ACH)", sub: "Free · 1–2 business days" },
                    { id: "card", label: "Credit / Debit card",  sub: "2.9% processing fee" },
                  ].map(m => (
                    <button key={m.id} onClick={() => setMethod(m.id)}
                      className={`w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-colors ${method === m.id ? "border-black bg-black/5" : "border-slate-200 hover:border-slate-300"}`}>
                      <span className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${method === m.id ? "border-black" : "border-slate-300"}`}>
                        {method === m.id && <span className="w-2 h-2 bg-black rounded-full" />}
                      </span>
                      <div>
                        <p className="text-xs font-medium text-slate-900">{m.label}</p>
                        <p className="text-[11px] text-slate-500">{m.sub}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="px-6 pb-5">
              <button onClick={() => setStep("confirm")} className="w-full py-2.5 bg-black text-white text-sm rounded-xl font-medium hover:bg-slate-800 transition-colors">
                Continue →
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function NewRequestModal({ onClose }: { onClose: () => void }) {
  const [form, setForm] = useState({ category: "HVAC", title: "", priority: "Medium", description: "" });
  const set = (f: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(v => ({ ...v, [f]: e.target.value }));
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="text-sm font-semibold text-slate-900">Submit maintenance request</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700">✕</button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Category</label>
            <select value={form.category} onChange={set("category")} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-black bg-white">
              {["HVAC", "Plumbing", "Electrical", "Appliance", "Security", "Ventilation", "Other"].map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Issue title</label>
            <input value={form.title} onChange={set("title")} placeholder="e.g. AC not working" className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-black" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Priority</label>
            <div className="flex gap-2">
              {["Low", "Medium", "High", "Emergency"].map(p => (
                <button key={p} onClick={() => setForm(v => ({ ...v, priority: p }))}
                  className={`flex-1 py-1.5 text-xs rounded-lg border font-medium transition-colors ${form.priority === p ? "bg-black text-white border-black" : "border-slate-200 text-slate-600 hover:border-slate-400"}`}>
                  {p}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Description</label>
            <textarea value={form.description} onChange={set("description")} rows={3} placeholder="Describe the issue…" className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-black resize-none" />
          </div>
          <div className="border-2 border-dashed border-slate-200 rounded-lg p-3 text-center cursor-pointer hover:border-slate-400 transition-colors">
            <p className="text-xs text-slate-400">📎 Attach photos</p>
          </div>
        </div>
        <div className="flex gap-3 px-6 pb-5">
          <button onClick={onClose} className="flex-1 py-2 text-sm border border-slate-200 rounded-lg text-slate-600">Cancel</button>
          <button onClick={onClose} className="flex-1 py-2 text-sm bg-black text-white rounded-lg font-medium">Submit</button>
        </div>
      </div>
    </div>
  );
}

// ─── Tab panels ───────────────────────────────────────────────────────────────

function HomeTab({ setTab, onPay }: { setTab: (t: Tab) => void; onPay: () => void }) {
  const daysUntilDue = 4;
  return (
    <div className="space-y-4">
      {/* Rent card */}
      <div className="bg-black rounded-2xl p-5 text-white">
        <p className="text-xs text-white/60 uppercase tracking-wider font-medium">Rent due</p>
        <p className="text-3xl font-bold mt-1">$1,950</p>
        <p className="text-sm text-white/60 mt-0.5">June 2026 · Due in {daysUntilDue} days</p>
        <button onClick={onPay} className="mt-4 px-5 py-2 bg-white text-black text-xs font-bold rounded-xl hover:bg-slate-100 transition-colors">
          Pay now →
        </button>
      </div>

      {/* Lease info */}
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <p className="text-[11px] uppercase tracking-wider text-slate-400 font-medium mb-3">Your lease</p>
        <div className="grid grid-cols-2 gap-y-3 text-sm">
          <div><p className="text-[11px] text-slate-400">Unit</p><p className="font-semibold text-slate-900">102 · Sunset Towers</p></div>
          <div><p className="text-[11px] text-slate-400">Monthly rent</p><p className="font-semibold text-slate-900">$1,950 / mo</p></div>
          <div><p className="text-[11px] text-slate-400">Lease start</p><p className="font-semibold text-slate-900">Feb 1, 2026</p></div>
          <div><p className="text-[11px] text-slate-400">Lease end</p><p className="font-semibold text-slate-900">Jan 31, 2027</p></div>
          <div><p className="text-[11px] text-slate-400">Security deposit</p><p className="font-semibold text-slate-900">$1,950</p></div>
          <div><p className="text-[11px] text-slate-400">Status</p><span className="text-[11px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-medium">Active</span></div>
        </div>
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-2 gap-3">
        {[
          { label: "Submit request",   icon: "🔧", tab: "maintenance" as Tab },
          { label: "View documents",   icon: "📄", tab: "documents" as Tab },
          { label: "Message manager",  icon: "💬", tab: "messages" as Tab },
          { label: "Payment history",  icon: "🧾", tab: "payments" as Tab },
        ].map(a => (
          <button key={a.label} onClick={() => setTab(a.tab)}
            className="bg-white rounded-xl border border-slate-200 p-4 text-left hover:border-slate-400 hover:shadow-sm transition-all">
            <span className="text-xl">{a.icon}</span>
            <p className="text-xs font-semibold text-slate-900 mt-2">{a.label}</p>
          </button>
        ))}
      </div>

      {/* Active maintenance notice */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex gap-3">
        <span className="text-lg shrink-0">🔧</span>
        <div>
          <p className="text-xs font-semibold text-amber-900">Open maintenance request</p>
          <p className="text-xs text-amber-700 mt-0.5">HVAC unit not cooling — technician scheduled for tomorrow 9–11am.</p>
          <button onClick={() => setTab("maintenance")} className="text-[11px] text-amber-900 underline underline-offset-2 mt-1">View details</button>
        </div>
      </div>
    </div>
  );
}

function PaymentsTab({ onPay }: { onPay: () => void }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-900">Payment history</h2>
        <button onClick={onPay} className="px-3 py-1.5 bg-black text-white text-xs font-medium rounded-lg">Pay rent</button>
      </div>
      <div className="space-y-2">
        {paymentHistory.map(p => (
          <div key={p.id} className="bg-white rounded-xl border border-slate-200 px-4 py-3.5 flex items-center gap-3">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm shrink-0 ${p.status === "Paid" ? "bg-emerald-100" : "bg-amber-100"}`}>
              {p.status === "Paid" ? "✓" : "!"}
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-slate-900">{p.month}</p>
              <p className="text-[11px] text-slate-500">
                {p.status === "Paid" ? `Paid ${p.paid}` : `Due ${p.dueDate}`}
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm font-bold text-slate-900">${p.amount.toLocaleString()}</p>
              <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${p.status === "Paid" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                {p.status}
              </span>
            </div>
          </div>
        ))}
      </div>
      <p className="text-[11px] text-slate-400 text-center">Showing last 5 payments</p>
    </div>
  );
}

function MaintenanceTab({ onNew }: { onNew: () => void }) {
  const STATUS_STYLES: Record<string, string> = {
    "Open":        "bg-blue-100 text-blue-700",
    "In Progress": "bg-violet-100 text-violet-700",
    "Resolved":    "bg-emerald-100 text-emerald-700",
  };
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-900">My requests</h2>
        <button onClick={onNew} className="px-3 py-1.5 bg-black text-white text-xs font-medium rounded-lg">+ New request</button>
      </div>
      <div className="space-y-3">
        {maintenanceRequests.map(r => (
          <div key={r.id} className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="flex items-start justify-between gap-2 mb-2">
              <div>
                <p className="text-sm font-semibold text-slate-900">{r.title}</p>
                <p className="text-[11px] text-slate-500">Submitted {r.submitted}</p>
              </div>
              <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium shrink-0 ${STATUS_STYLES[r.status]}`}>{r.status}</span>
            </div>
            <span className="text-[11px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded font-medium">{r.category}</span>
            {r.update && (
              <div className="mt-3 bg-slate-50 rounded-lg px-3 py-2 text-xs text-slate-600 leading-relaxed">
                <span className="font-medium text-slate-900">Update: </span>{r.update}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function DocumentsTab() {
  const TAG_COLORS: Record<string, string> = {
    lease:     "bg-black text-white",
    checklist: "bg-slate-100 text-slate-600",
    rules:     "bg-slate-100 text-slate-600",
    insurance: "bg-blue-100 text-blue-700",
    receipt:   "bg-emerald-100 text-emerald-700",
  };
  return (
    <div className="space-y-4">
      <h2 className="text-sm font-semibold text-slate-900">My documents</h2>
      <div className="space-y-2">
        {documents.map(d => (
          <div key={d.id} className="bg-white rounded-xl border border-slate-200 px-4 py-3.5 flex items-center gap-3 hover:border-slate-400 transition-colors cursor-pointer">
            <div className="w-9 h-9 bg-slate-100 rounded-lg flex items-center justify-center text-base shrink-0">📄</div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-900 truncate">{d.name}</p>
              <p className="text-[11px] text-slate-500">{d.date} · {d.size}</p>
            </div>
            <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium shrink-0 ${TAG_COLORS[d.tag]}`}>{d.tag}</span>
            <button className="text-[11px] text-slate-400 hover:text-black shrink-0">↓</button>
          </div>
        ))}
      </div>
    </div>
  );
}

function MessagesTab() {
  const [text, setText] = useState("");
  return (
    <div className="flex flex-col h-[calc(100vh-200px)] min-h-[400px]">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-8 h-8 rounded-full bg-black text-white text-[11px] font-bold flex items-center justify-center">AM</div>
        <div>
          <p className="text-xs font-semibold text-slate-900">Alex Morgan</p>
          <p className="text-[11px] text-slate-500">Property Manager · Sunset Towers</p>
        </div>
        <span className="ml-auto flex items-center gap-1.5 text-[11px] text-emerald-600">
          <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
          Online
        </span>
      </div>

      <div className="flex-1 overflow-y-auto space-y-3 mb-4">
        {messages.map(m => (
          <div key={m.id} className={`flex gap-2.5 ${m.mine ? "flex-row-reverse" : ""}`}>
            {!m.mine && (
              <div className="w-7 h-7 rounded-full bg-black text-white text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">{m.avatar}</div>
            )}
            <div className={`max-w-[80%] ${m.mine ? "items-end" : "items-start"} flex flex-col gap-0.5`}>
              <div className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${m.mine ? "bg-black text-white rounded-tr-sm" : "bg-white border border-slate-200 text-slate-800 rounded-tl-sm"}`}>
                {m.text}
              </div>
              <p className="text-[10px] text-slate-400 px-1">{m.time}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="flex gap-2 mt-auto">
        <input
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="Type a message…"
          className="flex-1 text-sm border border-slate-200 rounded-xl px-4 py-2.5 outline-none focus:border-black bg-white"
        />
        <button onClick={() => setText("")} className="px-4 py-2.5 bg-black text-white rounded-xl text-sm font-medium hover:bg-slate-800 transition-colors">Send</button>
      </div>
    </div>
  );
}

function ProfileTab() {
  const { user, refresh } = useAuth();
  const [editing, setEditing] = useState(false);
  const [fullName, setFullName] = useState(user?.full_name ?? "");
  const [phone, setPhone] = useState(user?.phone ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function startEditing() {
    setFullName(user?.full_name ?? "");
    setPhone(user?.phone ?? "");
    setError("");
    setEditing(true);
  }

  async function handleSave() {
    setSaving(true);
    setError("");
    try {
      await profileApi.update({ full_name: fullName, phone });
      await refresh();
      setEditing(false);
    } catch (err: any) {
      setError(err.message ?? "Failed to update profile");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <h2 className="text-sm font-semibold text-slate-900">My profile</h2>
      <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-black text-white text-sm font-bold flex items-center justify-center shrink-0">
            {(user?.full_name ?? "T").split(" ").map(p => p[0]).join("").slice(0, 2).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-900 truncate">{user?.full_name}</p>
            <p className="text-[11px] text-slate-500">Tenant</p>
          </div>
        </div>

        {editing ? (
          <div className="space-y-3">
            <div>
              <label className="block text-[11px] font-medium text-slate-500 mb-1">Full name</label>
              <input
                value={fullName}
                onChange={e => setFullName(e.target.value)}
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-black"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-500 mb-1">Phone</label>
              <input
                value={phone}
                onChange={e => setPhone(e.target.value)}
                placeholder="+15550001234"
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-black"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-500 mb-1">Email</label>
              <p className="text-sm text-slate-400 px-3 py-2 bg-slate-50 rounded-lg">{user?.email}</p>
            </div>
            {error && <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
            <div className="flex gap-2 pt-1">
              <button onClick={handleSave} disabled={saving}
                className="flex-1 py-2 bg-black text-white text-sm rounded-lg font-medium hover:bg-slate-800 disabled:opacity-50">
                {saving ? "Saving…" : "Save changes"}
              </button>
              <button onClick={() => setEditing(false)} disabled={saving}
                className="px-4 py-2 text-sm text-slate-500 hover:text-slate-700 disabled:opacity-50">
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Email</span>
              <span className="text-slate-900 font-medium">{user?.email}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Phone</span>
              <span className="text-slate-900 font-medium">{user?.phone || "Not set"}</span>
            </div>
            <button onClick={startEditing}
              className="w-full py-2 border border-slate-200 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50">
              Edit profile
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function PortalPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>("home");
  const [showPay, setShowPay] = useState(false);
  const [showNewRequest, setShowNewRequest] = useState(false);

  return (
    <div className="max-w-lg mx-auto px-4 py-6">
      {showPay && <PayModal onClose={() => setShowPay(false)} />}
      {showNewRequest && <NewRequestModal onClose={() => setShowNewRequest(false)} />}

      {/* Greeting */}
      <div className="mb-5">
        <p className="text-[11px] uppercase tracking-widest text-slate-400 font-medium">Welcome back</p>
        <h1 className="text-xl font-bold text-slate-900 mt-0.5">{user?.full_name ?? "Tenant"}</h1>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 bg-slate-100 rounded-xl p-1 mb-6">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 flex flex-col items-center gap-0.5 py-2 rounded-lg text-[10px] font-medium transition-colors ${tab === t.id ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
          >
            <span className="text-base leading-none">{t.icon}</span>
            <span className="hidden sm:block">{t.label}</span>
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === "home"        && <HomeTab setTab={setTab} onPay={() => setShowPay(true)} />}
      {tab === "profile"     && <ProfileTab />}
      {tab === "payments"    && <PaymentsTab onPay={() => setShowPay(true)} />}
      {tab === "maintenance" && <MaintenanceTab onNew={() => setShowNewRequest(true)} />}
      {tab === "documents"   && <DocumentsTab />}
      {tab === "messages"    && <MessagesTab />}
    </div>
  );
}
