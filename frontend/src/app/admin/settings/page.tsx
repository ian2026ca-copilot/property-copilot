"use client";

import { useEffect, useState } from "react";
import { adminApi } from "@/lib/adminApi";
import { AdminUser } from "@/lib/adminAuth";

function AdminsCard() {
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ email: "", full_name: "", password: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    try {
      setAdmins(await adminApi.listAdmins());
    } catch {
      // non-fatal — owners table is the primary content
    } finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setError("");
    try {
      await adminApi.createAdmin(form.email.trim(), form.full_name.trim(), form.password);
      setForm({ email: "", full_name: "", password: "" });
      setShowForm(false);
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to create admin");
    } finally { setSaving(false); }
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Platform admins</h3>
          <p className="text-xs text-slate-400 mt-0.5">Accounts with full access to this page.</p>
        </div>
        <button type="button" onClick={() => setShowForm((v) => !v)}
          className="px-3 py-1.5 text-xs font-medium bg-black text-white rounded-lg hover:bg-slate-800">
          {showForm ? "Cancel" : "+ New admin"}
        </button>
      </div>

      {loading ? (
        <p className="text-xs text-slate-400">Loading…</p>
      ) : (
        <ul className="space-y-1">
          {admins.map((a) => (
            <li key={a.id} className="text-sm text-slate-700 flex items-baseline gap-2">
              <span className="font-medium">{a.full_name}</span>
              <span className="text-xs text-slate-400">{a.email}</span>
            </li>
          ))}
        </ul>
      )}

      {showForm && (
        <form onSubmit={handleCreate} className="space-y-3 pt-2 border-t border-slate-100">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Full name</label>
              <input required value={form.full_name} onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))}
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-black" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Email</label>
              <input required type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-black" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Password</label>
            <input required type="password" minLength={8} value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
              placeholder="At least 8 characters"
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-black" />
          </div>
          {error && <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
          <button type="submit" disabled={saving}
            className="px-4 py-2 text-sm bg-black text-white rounded-lg hover:bg-slate-800 font-medium disabled:opacity-50">
            {saving ? "Creating…" : "Create admin"}
          </button>
        </form>
      )}
    </div>
  );
}

export default function AdminSettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Settings</h1>
        <p className="text-sm text-slate-500 mt-0.5">Manage who has platform admin access.</p>
      </div>

      <AdminsCard />
    </div>
  );
}
