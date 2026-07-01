"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { teamApi, profileApi, campaignsApi, type TeamMemberOut, type OrgFbSettingsOut } from "@/lib/api";
import { can, hasMinRole } from "@/lib/roles";
import { MOCK_MODE } from "@/lib/useApiData";

// ─── Mock data ────────────────────────────────────────────────────────────────

const MOCK_TEAM: TeamMemberOut[] = [
  { member_id: "m1", user_id: "u1", full_name: "Jordan Ellis", email: "jordan@propertyco.com", role: "OWNER" },
  { member_id: "m2", user_id: "u2", full_name: "Alex Morgan", email: "alex@propertyco.com", role: "MANAGER" },
  { member_id: "m3", user_id: "u3", full_name: "Taylor Brooks", email: "taylor@propertyco.com", role: "AGENT" },
  { member_id: "m4", user_id: "u4", full_name: "Casey Liu", email: "casey@propertyco.com", role: "AGENT" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ROLE_LABELS: Record<string, string> = {
  OWNER:   "Property Owner",
  MANAGER: "Property Manager",
  AGENT:   "Leasing Agent",
  TENANT:  "Tenant",
  VENDOR:  "Vendor / Contractor",
};

const ROLE_STYLES: Record<string, string> = {
  OWNER:   "bg-violet-100 text-violet-700",
  MANAGER: "bg-blue-100 text-blue-700",
  AGENT:   "bg-emerald-100 text-emerald-700",
  TENANT:  "bg-slate-100 text-slate-600",
  VENDOR:  "bg-orange-100 text-orange-700",
};

const ROLE_DESCRIPTIONS: Record<string, string> = {
  OWNER:   "Full access — can delete properties, manage team roles, and all operations",
  MANAGER: "Can create/edit properties, tenants, payments — cannot delete properties or change roles",
  AGENT:   "Read-only on most data — can view properties, tenants, vacancy, maintenance",
  TENANT:  "Portal access only — sees their own lease, payments, and maintenance requests",
  VENDOR:  "Assigned maintenance portal — receives jobs, updates status, uploads photos, and manages availability",
};

function initials(name: string) {
  return name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
}

// ─── Invite modal ─────────────────────────────────────────────────────────────

function InviteModal({ onClose, onSave }: { onClose: () => void; onSave: (m: TeamMemberOut) => void }) {
  const [form, setForm] = useState({ full_name: "", email: "", role: "AGENT" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const set = (f: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(v => ({ ...v, [f]: e.target.value }));

  async function handleSubmit() {
    if (!form.full_name || !form.email) { setError("Name and email are required."); return; }
    setSaving(true); setError("");
    try {
      const saved = await teamApi.invite(form as { full_name: string; email: string; role: string });
      onSave(saved);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Invite failed");
    } finally { setSaving(false); }
  }

  // Mock mode: fake the save
  async function handleMockSubmit() {
    if (!form.full_name || !form.email) { setError("Name and email are required."); return; }
    onSave({
      member_id: `mock-${Date.now()}`,
      user_id: `mock-u-${Date.now()}`,
      full_name: form.full_name,
      email: form.email,
      role: form.role as TeamMemberOut["role"],
    });
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="text-sm font-semibold text-slate-900">Invite team member</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-lg leading-none">✕</button>
        </div>
        <div className="px-6 py-5 space-y-4">
          {error && <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Full name *</label>
            <input value={form.full_name} onChange={set("full_name")} placeholder="Taylor Brooks" className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-black" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Email *</label>
            <input type="email" value={form.email} onChange={set("email")} placeholder="taylor@company.com" className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-black" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Role</label>
            <select value={form.role} onChange={set("role")} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-black bg-white">
              <option value="MANAGER">Property Manager</option>
              <option value="AGENT">Leasing Agent</option>
              <option value="VENDOR">Vendor / Contractor</option>
            </select>
            <p className="text-[11px] text-slate-400 mt-1">{ROLE_DESCRIPTIONS[form.role]}</p>
          </div>
        </div>
        <div className="flex gap-3 px-6 py-4 border-t border-slate-100">
          <button onClick={onClose} className="flex-1 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">Cancel</button>
          <button
            onClick={MOCK_MODE ? handleMockSubmit : handleSubmit}
            disabled={saving}
            className="flex-1 py-2 text-sm bg-black text-white rounded-lg hover:bg-slate-800 font-medium disabled:opacity-50"
          >
            {saving ? "Inviting…" : "Send invite"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Change role modal ────────────────────────────────────────────────────────

function ChangeRoleModal({ member, onClose, onSave }: {
  member: TeamMemberOut; onClose: () => void; onSave: (m: TeamMemberOut) => void;
}) {
  const [role, setRole] = useState(member.role === "OWNER" ? "MANAGER" : member.role);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit() {
    setSaving(true); setError("");
    if (MOCK_MODE) {
      onSave({ ...member, role: role as TeamMemberOut["role"] });
      return;
    }
    try {
      const saved = await teamApi.updateRole(member.member_id, role);
      onSave(saved);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed");
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="text-sm font-semibold text-slate-900">Change role — {member.full_name}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-lg leading-none">✕</button>
        </div>
        <div className="px-6 py-5 space-y-3">
          {error && <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
          {(["MANAGER", "AGENT"] as const).map((r) => (
            <label key={r} className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${role === r ? "border-black bg-slate-50" : "border-slate-200 hover:bg-slate-50"}`}>
              <input type="radio" className="mt-0.5 shrink-0" checked={role === r} onChange={() => setRole(r)} />
              <div>
                <p className="text-sm font-medium text-slate-900">{ROLE_LABELS[r]}</p>
                <p className="text-[11px] text-slate-500 mt-0.5">{ROLE_DESCRIPTIONS[r]}</p>
              </div>
            </label>
          ))}
        </div>
        <div className="flex gap-3 px-6 py-4 border-t border-slate-100">
          <button onClick={onClose} className="flex-1 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">Cancel</button>
          <button onClick={handleSubmit} disabled={saving} className="flex-1 py-2 text-sm bg-black text-white rounded-lg hover:bg-slate-800 font-medium disabled:opacity-50">
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Confirm dialog ───────────────────────────────────────────────────────────

function ConfirmDialog({ message, onConfirm, onCancel }: { message: string; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
        <p className="text-sm text-slate-700 mb-6">{message}</p>
        <div className="flex gap-3">
          <button onClick={onCancel} className="flex-1 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">Cancel</button>
          <button onClick={onConfirm} className="flex-1 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium">Remove</button>
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

// ─── Profile tab ──────────────────────────────────────────────────────────────

function ProfileTab() {
  const { user, refresh } = useAuth();
  const [form, setForm] = useState({ full_name: user?.full_name ?? "", phone: "" });
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (MOCK_MODE) return;
    profileApi.me().then((me) => setForm({ full_name: me.full_name, phone: me.phone })).catch(() => {});
  }, []);

  const E164_RE = /^\+[1-9]\d{7,14}$/;

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (form.phone && !E164_RE.test(form.phone.trim())) {
      setError("Phone must be in E.164 format, e.g. +15550001234"); return;
    }
    setSaving(true); setError(""); setSuccess(false);
    try {
      await profileApi.update({ full_name: form.full_name, phone: form.phone || undefined });
      await refresh();
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally { setSaving(false); }
  }

  return (
    <div className="max-w-lg space-y-6">
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <h3 className="text-sm font-semibold text-slate-900 mb-5">Personal information</h3>
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Email</label>
            <p className="text-sm text-slate-500 border border-slate-100 bg-slate-50 rounded-lg px-3 py-2">{user?.email}</p>
            <p className="text-[11px] text-slate-400 mt-1">Email cannot be changed</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Full name</label>
            <input
              value={form.full_name}
              onChange={(e) => setForm(v => ({ ...v, full_name: e.target.value }))}
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-black"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Phone number</label>
            <input
              type="tel"
              value={form.phone}
              onChange={(e) => setForm(v => ({ ...v, phone: e.target.value }))}
              placeholder="+15550001234"
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-black"
            />
            <p className="text-[11px] text-slate-400 mt-1">International format, e.g. +15550001234</p>
          </div>
          {error && <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
          {success && <p className="text-xs text-emerald-600 bg-emerald-50 rounded-lg px-3 py-2">Profile updated successfully</p>}
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 text-sm bg-black text-white rounded-lg hover:bg-slate-800 font-medium disabled:opacity-50 transition-colors"
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
        </form>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <h3 className="text-sm font-semibold text-slate-900 mb-1">Organization</h3>
        <p className="text-sm text-slate-500">{user?.org_name}</p>
        <p className="text-[11px] text-slate-400 mt-1">Role: {user?.role}</p>
      </div>
    </div>
  );
}

// ─── Marketing / Facebook Settings Tab ────────────────────────────────────────

function MarketingTab() {
  const [fbSettings, setFbSettings] = useState<OrgFbSettingsOut | null>(null);
  const [form, setForm] = useState({ fb_page_id: "", fb_page_token: "" });
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    campaignsApi.getFbSettings()
      .then(s => { setFbSettings(s); setForm(f => ({ ...f, fb_page_id: s.fb_page_id ?? "" })); })
      .catch(() => {});
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setError(""); setSuccess(false);
    try {
      const body: { fb_page_id?: string; fb_page_token?: string } = { fb_page_id: form.fb_page_id || undefined };
      if (form.fb_page_token) body.fb_page_token = form.fb_page_token;
      const updated = await campaignsApi.saveFbSettings(body);
      setFbSettings(updated);
      setForm(f => ({ ...f, fb_page_token: "" }));
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally { setSaving(false); }
  }

  const inp = "w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-black";

  return (
    <div className="max-w-lg space-y-6">
      <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-5">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Facebook Page</h3>
          <p className="text-xs text-slate-400 mt-0.5">Connect your Facebook Page to post rental campaigns directly from Property Copilot.</p>
        </div>

        <div className="bg-slate-50 rounded-lg p-4 space-y-1 text-xs text-slate-600">
          <p className="font-medium text-slate-700">How to get your Page Access Token</p>
          <ol className="list-decimal list-inside space-y-0.5 text-slate-500">
            <li>Go to <strong>Meta for Developers</strong> → Graph API Explorer</li>
            <li>Select your Facebook Page from the dropdown</li>
            <li>Add permissions: <code className="bg-slate-200 px-1 rounded">pages_manage_posts</code>, <code className="bg-slate-200 px-1 rounded">pages_read_engagement</code></li>
            <li>Click <strong>Generate Access Token</strong> and copy it here</li>
          </ol>
        </div>

        {fbSettings?.fb_page_token_set && (
          <div className="flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2">
            <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
            Page Access Token is set. Paste a new one below to replace it.
          </div>
        )}

        <form onSubmit={handleSave} className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Facebook Page ID</label>
            <input value={form.fb_page_id} onChange={e => setForm(f => ({ ...f, fb_page_id: e.target.value }))}
              placeholder="e.g. 123456789012345" className={inp} />
            <p className="text-[11px] text-slate-400 mt-1">Found in your Page settings → About → Page ID</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Page Access Token {fbSettings?.fb_page_token_set ? "(leave blank to keep existing)" : "*"}
            </label>
            <input type="password" value={form.fb_page_token}
              onChange={e => setForm(f => ({ ...f, fb_page_token: e.target.value }))}
              placeholder={fbSettings?.fb_page_token_set ? "••••••••••••••••" : "Paste token here"}
              className={inp} />
          </div>
          {error && <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
          {success && <p className="text-xs text-emerald-600 bg-emerald-50 rounded-lg px-3 py-2">Facebook settings saved.</p>}
          <button type="submit" disabled={saving}
            className="px-4 py-2 text-sm bg-black text-white rounded-lg hover:bg-slate-800 font-medium disabled:opacity-50">
            {saving ? "Saving…" : "Save Facebook settings"}
          </button>
        </form>
      </div>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

type Modal =
  | { type: "none" }
  | { type: "invite" }
  | { type: "changeRole"; member: TeamMemberOut }
  | { type: "remove"; member: TeamMemberOut };

export default function SettingsPage() {
  const { user } = useAuth();
  const perms = can(user?.role);
  const [tab, setTab] = useState<"profile" | "team" | "roles" | "marketing">("profile");
  const [team, setTeam] = useState<TeamMemberOut[]>(MOCK_TEAM);
  const [modal, setModal] = useState<Modal>({ type: "none" });

  useEffect(() => {
    if (MOCK_MODE) return;
    teamApi.list().then(setTeam).catch(() => {});
  }, []);

  function handleInvited(m: TeamMemberOut) {
    setTeam(prev => [...prev, m]);
    setModal({ type: "none" });
  }

  function handleRoleChanged(m: TeamMemberOut) {
    setTeam(prev => prev.map(x => x.member_id === m.member_id ? m : x));
    setModal({ type: "none" });
  }

  async function handleRemove(m: TeamMemberOut) {
    if (!MOCK_MODE) {
      try { await teamApi.remove(m.member_id); } catch { return; }
    }
    setTeam(prev => prev.filter(x => x.member_id !== m.member_id));
    setModal({ type: "none" });
  }

  return (
    <div className="max-w-[960px] mx-auto px-6 py-6 space-y-6">
      {modal.type === "invite" && (
        <InviteModal onClose={() => setModal({ type: "none" })} onSave={handleInvited} />
      )}
      {modal.type === "changeRole" && (
        <ChangeRoleModal member={modal.member} onClose={() => setModal({ type: "none" })} onSave={handleRoleChanged} />
      )}
      {modal.type === "remove" && (
        <ConfirmDialog
          message={`Remove ${modal.member.full_name} from the team? They will lose all access.`}
          onConfirm={() => handleRemove(modal.member)}
          onCancel={() => setModal({ type: "none" })}
        />
      )}

      {/* Header */}
      <div>
        <p className="text-[11px] uppercase tracking-widest text-slate-400 font-medium">Account</p>
        <h1 className="text-xl font-bold text-slate-900 mt-0.5">Settings</h1>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-200">
        {(["profile", "team", "roles", "marketing"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium capitalize transition-colors border-b-2 -mb-px ${
              tab === t ? "border-black text-slate-900" : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            {t === "profile" ? "My profile" : t === "team" ? "Team members" : t === "roles" ? "Role guide" : "Marketing"}
          </button>
        ))}
      </div>

      {/* Profile tab */}
      {tab === "profile" && <ProfileTab />}

      {/* Marketing tab */}
      {tab === "marketing" && <MarketingTab />}

      {/* Team tab */}
      {tab === "team" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-500">{team.length} member{team.length !== 1 ? "s" : ""}</p>
            {perms.inviteStaff && (
              <button
                onClick={() => setModal({ type: "invite" })}
                className="px-3 py-1.5 bg-black text-white text-xs font-medium rounded-lg hover:bg-slate-800 transition-colors"
              >
                + Invite member
              </button>
            )}
          </div>

          <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
            {team.map((m) => {
              const isCurrentUser = m.user_id === user?.id;
              const isOwner = m.role === "OWNER";
              const isVendor = m.role === "VENDOR";
              return (
                <div key={m.member_id} className="flex items-center gap-4 px-5 py-4">
                  <div className="w-9 h-9 rounded-full bg-black text-white text-xs font-bold flex items-center justify-center shrink-0">
                    {initials(m.full_name)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-slate-900">{m.full_name}</p>
                      {isCurrentUser && <span className="text-[10px] text-slate-400 font-medium">(you)</span>}
                    </div>
                    <p className="text-xs text-slate-500">{m.email}</p>
                    {m.phone && <p className="text-xs text-slate-400">{m.phone}</p>}
                  </div>
                  <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full ${ROLE_STYLES[m.role]}`}>
                    {ROLE_LABELS[m.role]}
                  </span>
                  {perms.changeRoles && !isCurrentUser && !isOwner && !isVendor && (
                    <div className="flex gap-1">
                      <button
                        onClick={() => setModal({ type: "changeRole", member: m })}
                        className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition-colors"
                        title="Change role"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => setModal({ type: "remove", member: m })}
                        className="p-1.5 text-red-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors"
                        title="Remove member"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Role guide tab */}
      {tab === "roles" && (
        <div className="space-y-3">
          {(["OWNER", "MANAGER", "AGENT", "TENANT", "VENDOR"] as const).map((r) => (
            <div key={r} className="bg-white rounded-xl border border-slate-200 p-5">
              <div className="flex items-center gap-3 mb-3">
                <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full ${ROLE_STYLES[r]}`}>
                  {ROLE_LABELS[r]}
                </span>
              </div>
              <p className="text-sm text-slate-600 mb-4">{ROLE_DESCRIPTIONS[r]}</p>
              <div className="grid grid-cols-2 gap-2">
                {PERMISSION_MATRIX[r].map(({ label, allowed }) => (
                  <div key={label} className="flex items-center gap-2 text-xs">
                    <span className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 ${allowed ? "bg-emerald-100 text-emerald-600" : "bg-slate-100 text-slate-400"}`}>
                      {allowed ? "✓" : "✕"}
                    </span>
                    <span className={allowed ? "text-slate-700" : "text-slate-400"}>{label}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const PERMISSION_MATRIX: Record<string, { label: string; allowed: boolean }[]> = {
  OWNER: [
    { label: "Create / edit properties", allowed: true },
    { label: "Delete properties", allowed: true },
    { label: "Add / edit tenants", allowed: true },
    { label: "Terminate leases", allowed: true },
    { label: "Manage payments", allowed: true },
    { label: "Assign maintenance", allowed: true },
    { label: "Invite team members", allowed: true },
    { label: "Change member roles", allowed: true },
    { label: "Remove team members", allowed: true },
    { label: "View all data", allowed: true },
  ],
  MANAGER: [
    { label: "Create / edit properties", allowed: true },
    { label: "Delete properties", allowed: false },
    { label: "Add / edit tenants", allowed: true },
    { label: "Terminate leases", allowed: false },
    { label: "Manage payments", allowed: true },
    { label: "Assign maintenance", allowed: true },
    { label: "Invite team members", allowed: true },
    { label: "Change member roles", allowed: false },
    { label: "Remove team members", allowed: false },
    { label: "View all data", allowed: true },
  ],
  AGENT: [
    { label: "Create / edit properties", allowed: false },
    { label: "Delete properties", allowed: false },
    { label: "Add / edit tenants", allowed: false },
    { label: "Terminate leases", allowed: false },
    { label: "Manage payments", allowed: false },
    { label: "Assign maintenance", allowed: false },
    { label: "Invite team members", allowed: false },
    { label: "Change member roles", allowed: false },
    { label: "Remove team members", allowed: false },
    { label: "View all data", allowed: true },
  ],
  TENANT: [
    { label: "Create / edit properties", allowed: false },
    { label: "Delete properties", allowed: false },
    { label: "Add / edit tenants", allowed: false },
    { label: "Terminate leases", allowed: false },
    { label: "Manage payments", allowed: false },
    { label: "Assign maintenance", allowed: false },
    { label: "Invite team members", allowed: false },
    { label: "Change member roles", allowed: false },
    { label: "Remove team members", allowed: false },
    { label: "View own lease / portal", allowed: true },
  ],
  VENDOR: [
    { label: "View assigned maintenance jobs", allowed: true },
    { label: "Update job status", allowed: true },
    { label: "Upload completion photos", allowed: true },
    { label: "Manage own availability", allowed: true },
    { label: "View tenant contact info", allowed: true },
    { label: "Access property / payment data", allowed: false },
    { label: "Assign or manage maintenance", allowed: false },
    { label: "Invite or manage team members", allowed: false },
    { label: "View organisation-wide data", allowed: false },
    { label: "Access dashboard or reports", allowed: false },
  ],
};
