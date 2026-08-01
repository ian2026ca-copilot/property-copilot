"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { api, orgsApi, tenantsApi, type OrganizationPublicOut } from "@/lib/api";
import { setToken } from "@/lib/auth";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Section, Field, selectClass, useRentalApplicationState, buildRentalApplicationPayload,
  RentalApplicationSections, updateAt, removeAt, COUNTRIES, PROVINCES, type Country,
} from "@/components/rental-application/RentalApplicationFields";

type Role = "TENANT" | "VENDOR";

const SERVICE_OPTIONS = [
  "Plumbing", "Electrical", "HVAC", "Carpentry", "Painting",
  "Cleaning", "Landscaping", "Roofing", "Appliance Repair", "General Maintenance",
];

interface StagedDoc { file: File; doc_type: string }

const DOC_TYPE_OPTIONS = [
  { value: "id_document", label: "ID document" },
  { value: "paystub", label: "Paystub" },
  { value: "bank_statement", label: "Bank statement" },
  { value: "other", label: "Other" },
];

export default function JoinLandlordPage() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;
  const router = useRouter();
  const { refresh } = useAuth();

  const [org, setOrg] = useState<OrganizationPublicOut | null>(null);
  const [orgError, setOrgError] = useState("");
  const [loadingOrg, setLoadingOrg] = useState(true);
  const [role, setRole] = useState<Role | null>(null);

  // Account + personal details
  const [form, setForm] = useState({
    first_name: "", middle_name: "", last_name: "", email: "", password: "", phone: "",
    date_of_birth: "", drivers_licence: "",
    business_name: "", service_categories: [] as string[],
    street_address: "", city: "", postal_code: "", country: "" as Country | "", province: "",
  });
  const [unitId, setUnitId] = useState("");

  const app = useRentalApplicationState();
  const [docs, setDocs] = useState<StagedDoc[]>([]);

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    orgsApi.bySlug(slug)
      .then(setOrg)
      .catch((e: Error) => setOrgError(e.message || "This sign-up link is invalid or has expired."))
      .finally(() => setLoadingOrg(false));
  }, [slug]);

  const set = (field: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [field]: e.target.value }));

  function setField(field: string, value: string) {
    setForm((f) => ({ ...f, [field]: value, ...(field === "country" ? { province: "" } : {}) }));
  }
  const provinceList = form.country ? PROVINCES[form.country as Country] ?? [] : [];

  function toggleCategory(cat: string) {
    setForm(f => ({
      ...f,
      service_categories: f.service_categories.includes(cat)
        ? f.service_categories.filter(c => c !== cat)
        : [...f.service_categories, cat],
    }));
  }

  function normalizePhone(raw: string): string {
    const digits = raw.replace(/\D/g, "");
    if (digits.length === 10) return `+1${digits}`;
    if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
    if (raw.trim().startsWith("+")) return raw.trim();
    return raw.trim();
  }
  const E164_RE = /^\+[1-9]\d{7,14}$/;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const phone = normalizePhone(form.phone);
    if (!E164_RE.test(phone)) {
      setError("Phone must be 10 digits (e.g. 6041234567) or E.164 format (+15550001234)");
      return;
    }
    if (role === "VENDOR" && form.service_categories.length === 0) {
      setError("Please select at least one service category.");
      return;
    }
    setLoading(true);
    try {
      const full_name = `${form.first_name.trim()} ${form.last_name.trim()}`.trim();

      const body: Record<string, unknown> = {
        first_name: form.first_name,
        last_name: form.last_name,
        email: form.email,
        password: form.password,
        phone,
        full_name,
        role,
        org_slug: slug,
      };

      if (role === "VENDOR") {
        body.business_name = form.business_name;
        body.service_categories = form.service_categories;
        body.street_address = form.street_address || null;
        body.city = form.city || null;
        body.province = form.province || null;
        body.postal_code = form.postal_code || null;
        body.country = form.country || null;
      }

      if (role === "TENANT") {
        Object.assign(body, {
          middle_name: form.middle_name || null,
          date_of_birth: form.date_of_birth || null,
          drivers_licence: form.drivers_licence || null,
          unit_id: unitId || null,
          ...buildRentalApplicationPayload(app),
        });
      }

      const res = await api.post<{ access_token: string }>("/auth/register", body);
      setToken(res.access_token);

      if (role === "TENANT" && docs.length > 0) {
        for (const d of docs) {
          try { await tenantsApi.uploadMyDocument(d.doc_type, d.file); } catch { /* best-effort */ }
        }
      }

      await refresh();
      router.push(role === "VENDOR" ? "/vendor" : "/portal");
    } catch (err: any) {
      setError(err.message ?? "Registration failed");
    } finally {
      setLoading(false);
    }
  }

  if (loadingOrg) {
    return <div className="min-h-screen flex items-center justify-center bg-slate-50 text-sm text-slate-400">Loading…</div>;
  }

  if (orgError || !org) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 py-10">
        <div className="w-full max-w-md px-4 text-center">
          <p className="text-sm text-red-600 bg-red-50 rounded-lg px-4 py-3">{orgError || "Sign-up link not found."}</p>
          <Link href="/login" className="text-blue-600 hover:underline text-sm mt-4 inline-block">Back to sign in</Link>
        </div>
      </div>
    );
  }

  // ── Step 1: choose role ───────────────────────────────────────────────────
  if (!role) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 py-10">
        <div className="w-full max-w-md px-4">
          <div className="text-center mb-8">
            <div className="inline-flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white font-bold text-sm">PC</div>
              <span className="text-xl font-semibold text-slate-900">Property Copilot</span>
            </div>
            <p className="text-slate-500 text-sm">You've been invited to join</p>
            <p className="text-slate-900 text-lg font-semibold mt-1">{org.name}</p>
          </div>
          <Card>
            <CardHeader>
              <CardTitle>How would you like to join?</CardTitle>
              <CardDescription>Choose the option that describes you</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <button type="button" onClick={() => setRole("TENANT")}
                className="w-full text-left px-4 py-3.5 rounded-lg border border-slate-200 hover:border-black transition-colors">
                <p className="font-medium text-sm text-slate-900">I'm a Tenant</p>
                <p className="text-[12px] text-slate-400 mt-0.5">Fill out a rental application and access your lease, maintenance, and payments</p>
              </button>
              <button type="button" onClick={() => setRole("VENDOR")}
                className="w-full text-left px-4 py-3.5 rounded-lg border border-slate-200 hover:border-black transition-colors">
                <p className="font-medium text-sm text-slate-900">I'm a Vendor / Contractor</p>
                <p className="text-[12px] text-slate-400 mt-0.5">Receive assigned maintenance jobs and manage your schedule</p>
              </button>
              <p className="text-center text-sm text-slate-500 pt-2">
                Already have an account?{" "}
                <Link href="/login" className="text-blue-600 hover:underline font-medium">Sign in</Link>
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // ── Step 2a: Vendor — simple sign-up form ────────────────────────────────
  if (role === "VENDOR") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 py-10">
        <div className="w-full max-w-md px-4">
          <div className="text-center mb-8">
            <div className="inline-flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white font-bold text-sm">PC</div>
              <span className="text-xl font-semibold text-slate-900">Property Copilot</span>
            </div>
            <p className="text-slate-500 text-sm">Joining</p>
            <p className="text-slate-900 text-lg font-semibold mt-1">{org.name}</p>
          </div>
          <Card>
            <CardHeader>
              <CardTitle>Register as a vendor</CardTitle>
              <CardDescription>Joining {org.name}</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="business_name">Business name</Label>
                  <Input id="business_name" placeholder="Smith Plumbing Co." value={form.business_name}
                    onChange={set("business_name")} required />
                </div>
                <div className="space-y-1.5">
                  <Label>Service categories <span className="text-slate-400 font-normal">(select all that apply)</span></Label>
                  <div className="flex flex-wrap gap-2">
                    {SERVICE_OPTIONS.map(cat => (
                      <button key={cat} type="button" onClick={() => toggleCategory(cat)}
                        className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                          form.service_categories.includes(cat)
                            ? "bg-black text-white border-black"
                            : "border-slate-300 text-slate-600 hover:border-slate-500"
                        }`}>
                        {cat}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="first_name">First name</Label>
                    <Input id="first_name" placeholder="Jane" value={form.first_name} onChange={set("first_name")} required />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="last_name">Last name</Label>
                    <Input id="last_name" placeholder="Smith" value={form.last_name} onChange={set("last_name")} required />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" type="email" placeholder="you@example.com" value={form.email} onChange={set("email")} required />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="phone">Phone number</Label>
                  <Input id="phone" type="tel" placeholder="6041234567" value={form.phone} onChange={set("phone")} required />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="password">Password</Label>
                  <Input id="password" type="password" placeholder="At least 8 characters" value={form.password} onChange={set("password")} required minLength={8} />
                </div>

                <div className="space-y-1.5">
                  <Label>Address <span className="text-slate-400 font-normal">(optional)</span></Label>
                  <Input placeholder="Street address" value={form.street_address} onChange={set("street_address")} />
                  <div className="grid grid-cols-2 gap-2">
                    <Input placeholder="City" value={form.city} onChange={set("city")} />
                    <Input placeholder="Postal / ZIP code" value={form.postal_code} onChange={set("postal_code")} />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <select className={selectClass} value={form.country} onChange={(e) => setField("country", e.target.value)}>
                      <option value="">— select country —</option>
                      {COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <select className={selectClass} value={form.province} disabled={!form.country} onChange={(e) => setField("province", e.target.value)}>
                      <option value="">— select province/state —</option>
                      {provinceList.map((p) => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </div>
                </div>

                {error && <p className="text-sm text-red-600">{error}</p>}
                <div className="flex gap-2">
                  <Button type="button" variant="outline" onClick={() => setRole(null)} disabled={loading}>Back</Button>
                  <Button type="submit" className="flex-1" disabled={loading}>{loading ? "Creating account…" : "Create account"}</Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // ── Step 2b: Tenant — full rental application ────────────────────────────
  return (
    <div className="min-h-screen bg-slate-50 py-10 px-4">
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white font-bold text-sm">PC</div>
            <span className="text-xl font-semibold text-slate-900">Property Copilot</span>
          </div>
          <p className="text-slate-500 text-sm">Rental application for</p>
          <p className="text-slate-900 text-lg font-semibold mt-1">{org.name}</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-4 py-3">{error}</p>}

          {/* Personal details */}
          <Section title="Personal details">
            <div className="grid grid-cols-2 gap-3">
              <Field label="First name *"><Input value={form.first_name} onChange={set("first_name")} required /></Field>
              <Field label="Middle name"><Input value={form.middle_name} onChange={set("middle_name")} /></Field>
              <Field label="Last name *"><Input value={form.last_name} onChange={set("last_name")} required /></Field>
              <Field label="Date of birth"><Input type="date" value={form.date_of_birth} onChange={set("date_of_birth")} /></Field>
              <Field label="Driver's licence"><Input value={form.drivers_licence} onChange={set("drivers_licence")} placeholder="Optional" /></Field>
              <Field label="Email *"><Input type="email" value={form.email} onChange={set("email")} required /></Field>
              <Field label="Phone number *"><Input type="tel" value={form.phone} onChange={set("phone")} placeholder="6041234567" required /></Field>
              <Field label="Password *" className="col-span-2"><Input type="password" value={form.password} onChange={set("password")} minLength={8} required /></Field>
              {org.vacant_units.length > 0 && (
                <Field label="Which unit are you applying for?" className="col-span-2">
                  <select className={selectClass} value={unitId} onChange={(e) => setUnitId(e.target.value)}>
                    <option value="">— not sure yet / general application —</option>
                    {org.vacant_units.map((u) => (
                      <option key={u.id} value={u.id}>{u.label} — ${u.monthly_rent.toLocaleString()}/mo</option>
                    ))}
                  </select>
                </Field>
              )}
            </div>
          </Section>

          <RentalApplicationSections
            state={app}
            askCriminalRecord={org.screening_criminal_record_enabled}
            askRentalHistory={org.screening_rental_history_enabled}
          />

          {/* Documents */}
          <Section title="Supporting documents" subtitle="Optional — ID, paystubs, bank statements">
            {docs.length > 0 && (
              <div className="space-y-2">
                {docs.map((d, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <span className="flex-1 text-sm text-slate-700 truncate border border-slate-200 rounded-lg px-2.5 py-1.5">{d.file.name}</span>
                    <select className={`${selectClass} w-40`} value={d.doc_type} onChange={e => updateAt<StagedDoc>(setDocs, idx, { doc_type: e.target.value })}>
                      {DOC_TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                    <button type="button" onClick={() => removeAt<StagedDoc>(setDocs, idx)} className="text-slate-400 hover:text-red-500 text-lg shrink-0">×</button>
                  </div>
                ))}
              </div>
            )}
            <label className="w-full flex items-center justify-center px-3 py-2 border border-dashed border-slate-300 rounded-lg text-sm text-slate-500 hover:border-slate-500 hover:text-slate-700 transition-colors cursor-pointer">
              + Add files
              <input type="file" multiple className="hidden" onChange={e => {
                const files = Array.from(e.target.files ?? []);
                setDocs(l => [...l, ...files.map(f => ({ file: f, doc_type: "other" }))]);
                e.target.value = "";
              }} />
            </label>
          </Section>

          {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-4 py-3">{error}</p>}

          <div className="flex gap-2 pb-6">
            <Button type="button" variant="outline" onClick={() => setRole(null)} disabled={loading}>Back</Button>
            <Button type="submit" className="flex-1" disabled={loading}>{loading ? "Submitting application…" : "Submit application"}</Button>
          </div>
        </form>
      </div>
    </div>
  );
}
