"use client";

import { useEffect, useState } from "react";
import { adminApi, AISettingsOut, AISettingsIn, AIProvider, AITestOut } from "@/lib/adminApi";
import { AdminUser } from "@/lib/adminAuth";

type ApiKeyField = "openai_api_key" | "deepseek_api_key" | "gemini_api_key" | "grok_api_key";
type BaseUrlField = "openai_base_url" | "deepseek_base_url" | "gemini_base_url" | "grok_base_url";
type ModelField = "openai_model" | "deepseek_model" | "gemini_model" | "grok_model";

const AI_PROVIDERS: {
  key: ApiKeyField;
  setField: keyof AISettingsOut;
  baseUrlField: BaseUrlField;
  modelField: ModelField;
  provider: AIProvider;
  label: string;
  placeholder: string;
  defaultBaseUrl: string;
  defaultModel: string;
}[] = [
  { key: "openai_api_key", setField: "openai_key_set", baseUrlField: "openai_base_url", modelField: "openai_model", provider: "openai", label: "OpenAI", placeholder: "sk-...", defaultBaseUrl: "https://api.openai.com/v1", defaultModel: "gpt-4o-mini" },
  { key: "deepseek_api_key", setField: "deepseek_key_set", baseUrlField: "deepseek_base_url", modelField: "deepseek_model", provider: "deepseek", label: "DeepSeek", placeholder: "sk-...", defaultBaseUrl: "https://api.deepseek.com", defaultModel: "deepseek-chat" },
  { key: "gemini_api_key", setField: "gemini_key_set", baseUrlField: "gemini_base_url", modelField: "gemini_model", provider: "gemini", label: "Gemini", placeholder: "AIza...", defaultBaseUrl: "(default Google endpoint)", defaultModel: "gemini-2.5-flash" },
  { key: "grok_api_key", setField: "grok_key_set", baseUrlField: "grok_base_url", modelField: "grok_model", provider: "grok", label: "Grok (xAI)", placeholder: "xai-...", defaultBaseUrl: "https://api.x.ai/v1", defaultModel: "grok-4" },
];

function AIProvidersCard() {
  const [settings, setSettings] = useState<AISettingsOut | null>(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [switchingProvider, setSwitchingProvider] = useState(false);
  const [testingProvider, setTestingProvider] = useState<AIProvider | null>(null);
  const [testResults, setTestResults] = useState<Partial<Record<AIProvider, AITestOut>>>({});
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function load() {
    setLoading(true);
    try {
      setSettings(await adminApi.getAiSettings());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load AI settings");
    } finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setError(""); setSuccess("");
    try {
      const body: AISettingsIn = {};
      for (const { key, baseUrlField, modelField } of AI_PROVIDERS) {
        const keyValue = form[key]?.trim();
        if (keyValue) body[key] = keyValue;
        const baseUrlValue = form[baseUrlField]?.trim();
        if (baseUrlValue) body[baseUrlField] = baseUrlValue;
        const modelValue = form[modelField]?.trim();
        if (modelValue) body[modelField] = modelValue;
      }
      const updated = await adminApi.updateAiSettings(body);
      setSettings(updated);
      setForm({});
      setSuccess("Saved.");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to save AI settings");
    } finally { setSaving(false); }
  }

  async function handleRemove(key: ApiKeyField) {
    setSaving(true); setError(""); setSuccess("");
    try {
      const updated = await adminApi.updateAiSettings({ [key]: "" });
      setSettings(updated);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to remove key");
    } finally { setSaving(false); }
  }

  async function handleResetOverride(field: BaseUrlField | ModelField) {
    setSaving(true); setError(""); setSuccess("");
    try {
      const updated = await adminApi.updateAiSettings({ [field]: "" });
      setSettings(updated);
      setForm((f) => ({ ...f, [field]: "" }));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to reset");
    } finally { setSaving(false); }
  }

  async function handleTest(provider: AIProvider, key: ApiKeyField, baseUrlField: BaseUrlField, modelField: ModelField) {
    setTestingProvider(provider);
    setTestResults((r) => ({ ...r, [provider]: undefined }));
    try {
      const apiKey = form[key]?.trim();
      const baseUrl = form[baseUrlField]?.trim();
      const model = form[modelField]?.trim();
      const result = await adminApi.testAiProvider({
        provider,
        ...(apiKey ? { api_key: apiKey } : {}),
        ...(baseUrl ? { base_url: baseUrl } : {}),
        ...(model ? { model } : {}),
      });
      setTestResults((r) => ({ ...r, [provider]: result }));
    } catch (e: unknown) {
      setTestResults((r) => ({ ...r, [provider]: { ok: false, message: e instanceof Error ? e.message : "Test failed" } }));
    } finally {
      setTestingProvider(null);
    }
  }

  async function handleProviderChange(provider: AIProvider) {
    setSwitchingProvider(true); setError(""); setSuccess("");
    try {
      const updated = await adminApi.updateAiSettings({ active_provider: provider });
      setSettings(updated);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to switch provider");
    } finally { setSwitchingProvider(false); }
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-5">
      <div>
        <h3 className="text-sm font-semibold text-slate-900">AI provider API keys</h3>
        <p className="text-xs text-slate-400 mt-0.5">
          Used platform-wide for every AI feature (screening, drafting, the copilot). OpenAI, DeepSeek,
          and Grok all use the same OpenAI-compatible API; Gemini uses its own.
        </p>
      </div>

      {loading ? (
        <p className="text-xs text-slate-400">Loading…</p>
      ) : (
        <>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-2">Active provider</label>
            <div className="flex flex-wrap gap-4">
              {AI_PROVIDERS.map(({ provider, label }) => (
                <label key={provider} className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                  <input
                    type="radio"
                    name="active_provider"
                    value={provider}
                    checked={(settings?.active_provider ?? "gemini") === provider}
                    onChange={() => handleProviderChange(provider)}
                    disabled={switchingProvider}
                    className="accent-black disabled:opacity-50"
                  />
                  {label}
                </label>
              ))}
            </div>
            <p className="text-[11px] text-slate-400 mt-2">
              Every AI call in the app uses whichever provider is selected here. Make sure that
              provider's key is saved below before switching.
            </p>
          </div>

          <form onSubmit={handleSave} className="space-y-4 pt-1 border-t border-slate-100">
          {AI_PROVIDERS.filter(({ provider }) => provider === (settings?.active_provider ?? "gemini")).map(({ key, setField, baseUrlField, modelField, provider, label, placeholder, defaultBaseUrl, defaultModel }) => {
            const isSet = settings?.[setField];
            const currentBaseUrl = settings?.[baseUrlField];
            const currentModel = settings?.[modelField];
            const testResult = testResults[provider];
            const isTesting = testingProvider === provider;
            return (
              <div key={key} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">
                    {label} API key {isSet && <span className="text-emerald-600 font-normal">(already on file — enter a new one to replace it)</span>}
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="password"
                      value={form[key] ?? ""}
                      onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                      placeholder={isSet ? "•••••••• (unchanged)" : placeholder}
                      className="flex-1 text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-black"
                    />
                    {isSet && (
                      <button type="button" onClick={() => handleRemove(key)} disabled={saving}
                        className="text-xs text-slate-400 hover:text-red-600 disabled:opacity-50 whitespace-nowrap">
                        Remove
                      </button>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Base URL</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={form[baseUrlField] ?? currentBaseUrl ?? ""}
                        onChange={(e) => setForm((f) => ({ ...f, [baseUrlField]: e.target.value }))}
                        placeholder={defaultBaseUrl}
                        className="flex-1 text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-black"
                      />
                      {currentBaseUrl && (
                        <button type="button" onClick={() => handleResetOverride(baseUrlField)} disabled={saving}
                          className="text-xs text-slate-400 hover:text-red-600 disabled:opacity-50 whitespace-nowrap">
                          Reset
                        </button>
                      )}
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Model name</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={form[modelField] ?? currentModel ?? ""}
                        onChange={(e) => setForm((f) => ({ ...f, [modelField]: e.target.value }))}
                        placeholder={defaultModel}
                        className="flex-1 text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-black"
                      />
                      {currentModel && (
                        <button type="button" onClick={() => handleResetOverride(modelField)} disabled={saving}
                          className="text-xs text-slate-400 hover:text-red-600 disabled:opacity-50 whitespace-nowrap">
                          Reset
                        </button>
                      )}
                    </div>
                  </div>
                </div>
                <p className="text-[11px] text-slate-400 -mt-2">Leave blank to use the default shown above.</p>

                <div>
                  <button
                    type="button"
                    onClick={() => handleTest(provider, key, baseUrlField, modelField)}
                    disabled={isTesting}
                    className="px-3 py-1.5 text-xs font-medium border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50"
                  >
                    {isTesting ? "Testing…" : "Test connection"}
                  </button>
                  {testResult && (
                    <p className={`text-xs mt-2 rounded-lg px-3 py-2 ${testResult.ok ? "text-emerald-600 bg-emerald-50" : "text-red-600 bg-red-50"}`}>
                      {testResult.ok ? "✓ Connected — " : "✗ Failed — "}{testResult.message}
                    </p>
                  )}
                </div>
              </div>
            );
          })}

          {error && <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
          {success && <p className="text-xs text-emerald-600 bg-emerald-50 rounded-lg px-3 py-2">{success}</p>}

          <button type="submit" disabled={saving}
            className="px-4 py-2 text-sm bg-black text-white rounded-lg hover:bg-slate-800 font-medium disabled:opacity-50">
            {saving ? "Saving…" : "Save keys"}
          </button>
          </form>
        </>
      )}
    </div>
  );
}

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

const SETTINGS_TABS = [
  { key: "api-provider", label: "API Provider" },
  { key: "new-admin", label: "New Admin" },
] as const;

type SettingsTab = (typeof SETTINGS_TABS)[number]["key"];

export default function AdminSettingsPage() {
  const [tab, setTab] = useState<SettingsTab>("api-provider");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Settings</h1>
        <p className="text-sm text-slate-500 mt-0.5">Manage AI providers and platform admin access.</p>
      </div>

      <div className="flex items-center gap-1 border-b border-slate-200">
        {SETTINGS_TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t.key
                ? "border-black text-slate-900"
                : "border-transparent text-slate-400 hover:text-slate-700"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "api-provider" && <AIProvidersCard />}
      {tab === "new-admin" && <AdminsCard />}
    </div>
  );
}
