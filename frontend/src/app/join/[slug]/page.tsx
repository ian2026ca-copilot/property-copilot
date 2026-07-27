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
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type Role = "TENANT" | "VENDOR";

const SERVICE_OPTIONS = [
  "Plumbing", "Electrical", "HVAC", "Carpentry", "Painting",
  "Cleaning", "Landscaping", "Roofing", "Appliance Repair", "General Maintenance",
];

const COUNTRIES = ["Canada", "USA"] as const;
type Country = typeof COUNTRIES[number];
const PROVINCES: Record<Country, string[]> = {
  Canada: ["AB","BC","MB","NB","NL","NS","NT","NU","ON","PE","QC","SK","YT"],
  USA: ["AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY"],
};
const RESIDENTIAL_STATUSES = ["Rent", "Own", "Live with family", "Other"];
const EMPLOYMENT_TYPES = ["Full time employment", "Part time employment", "Self-employed", "Student", "Unemployed", "Retired"];

const selectClass = "h-9 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50";

// ─── Section card shell (mirrors the SingleKey rental-application layout) ──────

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-50">
        <p className="text-sm font-semibold text-slate-900">{title}</p>
        {subtitle && <p className="text-[11px] text-slate-400 mt-0.5">{subtitle}</p>}
      </div>
      <div className="p-5 space-y-4">{children}</div>
    </div>
  );
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label className="block text-xs font-medium text-slate-500 mb-1">{label}</label>
      {children}
    </div>
  );
}

const rowInputClass = "text-sm border border-slate-200 rounded-lg px-2.5 py-1.5 outline-none focus:border-black w-full";

// ─── Repeatable-list types ──────────────────────────────────────────────────

interface AddressEntry {
  is_current: boolean;
  residential_status: string;
  street_address: string; city: string; postal_code: string; country: string; province: string;
  move_in_date: string; move_out_date: string;
  monthly_rent: string; reason_for_moving: string;
  landlord_name: string; landlord_phone: string; landlord_email: string;
}
const emptyAddress = (isCurrent: boolean): AddressEntry => ({
  is_current: isCurrent, residential_status: "Rent",
  street_address: "", city: "", postal_code: "", country: "", province: "",
  move_in_date: "", move_out_date: "",
  monthly_rent: "", reason_for_moving: "",
  landlord_name: "", landlord_phone: "", landlord_email: "",
});

interface EmploymentEntry {
  is_current: boolean;
  employment_type: string; company: string; position: string; employment_length: string;
  company_website: string; company_linkedin_url: string; additional_notes: string;
  employer_reference_name: string; employer_reference_phone: string; employer_reference_email: string;
}
const emptyEmployment = (isCurrent: boolean): EmploymentEntry => ({
  is_current: isCurrent, employment_type: "Full time employment", company: "", position: "", employment_length: "",
  company_website: "", company_linkedin_url: "", additional_notes: "",
  employer_reference_name: "", employer_reference_phone: "", employer_reference_email: "",
});

interface IncomeSourceEntry { source_name: string; amount_annual: string }
interface OccupantEntry { name: string; relationship_label: string; email: string; phone: string; share_of_rent: string; is_dependent: boolean }
interface CosignerEntry { name: string; relationship_label: string; email: string; phone: string }
interface PetEntry { animal_type: string; breed: string; weight_lbs: string; sex: string; age: string; is_fixed: boolean }
interface VehicleEntry { make: string; model: string; year: string; license_plate: string }
interface StagedDoc { file: File; doc_type: string }

const DOC_TYPE_OPTIONS = [
  { value: "id_document", label: "ID document" },
  { value: "paystub", label: "Paystub" },
  { value: "bank_statement", label: "Bank statement" },
  { value: "other", label: "Other" },
];

const SCREENING_QUESTIONS = [
  { key: "smoke_vape", label: "Do you smoke or vape?" },
  { key: "given_notice_to_landlord", label: "Have you given notice to your current landlord?" },
  { key: "refused_rent", label: "Have you ever refused to pay rent?" },
  { key: "evicted", label: "Have you ever been evicted?" },
  { key: "criminal_record", label: "Do you have a criminal record?" },
] as const;

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
    date_of_birth: "", ssn_sin: "", drivers_licence: "",
    business_name: "", service_categories: [] as string[],
  });

  // Address history — index 0 is always "current"
  const [addresses, setAddresses] = useState<AddressEntry[]>([emptyAddress(true)]);
  // Employment history — index 0 is always "current"
  const [employments, setEmployments] = useState<EmploymentEntry[]>([emptyEmployment(true)]);
  const [personalIncome, setPersonalIncome] = useState("");
  const [householdIncome, setHouseholdIncome] = useState("");
  const [incomeSources, setIncomeSources] = useState<IncomeSourceEntry[]>([]);
  const [occupants, setOccupants] = useState<OccupantEntry[]>([]);
  const [hasCosigner, setHasCosigner] = useState(false);
  const [cosigners, setCosigners] = useState<CosignerEntry[]>([]);
  const [hasPets, setHasPets] = useState(false);
  const [pets, setPets] = useState<PetEntry[]>([]);
  const [hasVehicle, setHasVehicle] = useState(false);
  const [vehicles, setVehicles] = useState<VehicleEntry[]>([]);
  const [screening, setScreening] = useState<Record<string, boolean | null>>({
    smoke_vape: null, given_notice_to_landlord: null, refused_rent: null, evicted: null, criminal_record: null,
  });
  const [screeningNotes, setScreeningNotes] = useState("");
  const [personalMessage, setPersonalMessage] = useState("");
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

  // Generic helpers for repeatable-row state
  function updateAt<T>(setList: (fn: (l: T[]) => T[]) => void, idx: number, patch: Partial<T>) {
    setList(l => l.map((row, i) => (i === idx ? { ...row, ...patch } : row)));
  }
  function removeAt<T>(setList: (fn: (l: T[]) => T[]) => void, idx: number) {
    setList(l => l.filter((_, i) => i !== idx));
  }

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
      const anyYes = Object.values(screening).some(v => v === true);

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
      }

      if (role === "TENANT") {
        Object.assign(body, {
          middle_name: form.middle_name || null,
          date_of_birth: form.date_of_birth || null,
          ssn_sin: form.ssn_sin || null,
          drivers_licence: form.drivers_licence || null,
          personal_income_annual: personalIncome ? parseFloat(personalIncome) : null,
          household_income_annual: householdIncome ? parseFloat(householdIncome) : null,
          personal_message: personalMessage || null,
          smoke_vape: screening.smoke_vape,
          given_notice_to_landlord: screening.given_notice_to_landlord,
          refused_rent: screening.refused_rent,
          evicted: screening.evicted,
          criminal_record: screening.criminal_record,
          screening_notes: anyYes ? (screeningNotes || null) : null,
          address_history: addresses
            .filter(a => a.street_address || a.city)
            .map(a => ({
              ...a,
              move_in_date: a.move_in_date || null,
              move_out_date: a.move_out_date || null,
              monthly_rent: a.monthly_rent ? parseFloat(a.monthly_rent) : null,
            })),
          employment_history: employments
            .filter(emp => emp.company || emp.position)
            .map(emp => ({ ...emp })),
          income_sources: incomeSources
            .filter(s => s.source_name && s.amount_annual)
            .map(s => ({ source_name: s.source_name, amount_annual: parseFloat(s.amount_annual) || 0 })),
          occupants: occupants
            .filter(o => o.name)
            .map(o => ({ ...o, share_of_rent: o.share_of_rent ? parseFloat(o.share_of_rent) : null })),
          cosigners: hasCosigner ? cosigners.filter(c => c.name) : [],
          pets: hasPets ? pets.filter(p => p.animal_type).map(p => ({
            ...p,
            weight_lbs: p.weight_lbs ? parseFloat(p.weight_lbs) : null,
            age: p.age ? parseInt(p.age, 10) : null,
          })) : [],
          vehicles: hasVehicle ? vehicles.filter(v => v.make).map(v => ({
            ...v,
            year: v.year ? parseInt(v.year, 10) : null,
          })) : [],
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
  const anyScreeningYes = Object.values(screening).some(v => v === true);

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
              <Field label="SSN / SIN"><Input value={form.ssn_sin} onChange={set("ssn_sin")} placeholder="Optional" /></Field>
              <Field label="Driver's licence"><Input value={form.drivers_licence} onChange={set("drivers_licence")} placeholder="Optional" /></Field>
              <Field label="Email *"><Input type="email" value={form.email} onChange={set("email")} required /></Field>
              <Field label="Phone number *"><Input type="tel" value={form.phone} onChange={set("phone")} placeholder="6041234567" required /></Field>
              <Field label="Password *" className="col-span-2"><Input type="password" value={form.password} onChange={set("password")} minLength={8} required /></Field>
            </div>
          </Section>

          {/* Address history */}
          <Section title="Address history" subtitle="Start with your current address">
            {addresses.map((a, idx) => (
              <div key={idx} className="border border-slate-200 rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{a.is_current ? "Current address" : `Previous address ${idx}`}</p>
                  {idx > 0 && <button type="button" onClick={() => removeAt<AddressEntry>(setAddresses, idx)} className="text-xs text-red-500 hover:text-red-700">Remove</button>}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Residential status">
                    <select className={selectClass} value={a.residential_status} onChange={e => updateAt<AddressEntry>(setAddresses, idx, { residential_status: e.target.value })}>
                      {RESIDENTIAL_STATUSES.map(s => <option key={s}>{s}</option>)}
                    </select>
                  </Field>
                  <Field label="Monthly rent ($)"><Input type="number" min="0" value={a.monthly_rent} onChange={e => updateAt<AddressEntry>(setAddresses, idx, { monthly_rent: e.target.value })} /></Field>
                  <Field label="Street address" className="col-span-2"><Input value={a.street_address} onChange={e => updateAt<AddressEntry>(setAddresses, idx, { street_address: e.target.value })} /></Field>
                  <Field label="City"><Input value={a.city} onChange={e => updateAt<AddressEntry>(setAddresses, idx, { city: e.target.value })} /></Field>
                  <Field label="Postal / ZIP code"><Input value={a.postal_code} onChange={e => updateAt<AddressEntry>(setAddresses, idx, { postal_code: e.target.value })} /></Field>
                  <Field label="Country">
                    <select className={selectClass} value={a.country} onChange={e => updateAt<AddressEntry>(setAddresses, idx, { country: e.target.value, province: "" })}>
                      <option value="">— select —</option>
                      {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </Field>
                  <Field label="Province / State">
                    <select className={selectClass} value={a.province} disabled={!a.country} onChange={e => updateAt<AddressEntry>(setAddresses, idx, { province: e.target.value })}>
                      <option value="">— select —</option>
                      {(a.country ? PROVINCES[a.country as Country] ?? [] : []).map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </Field>
                  <Field label={a.is_current ? "Length of stay — from" : "Move-in date"}><Input type="date" value={a.move_in_date} onChange={e => updateAt<AddressEntry>(setAddresses, idx, { move_in_date: e.target.value })} /></Field>
                  {!a.is_current && (
                    <Field label="Move-out date"><Input type="date" value={a.move_out_date} onChange={e => updateAt<AddressEntry>(setAddresses, idx, { move_out_date: e.target.value })} /></Field>
                  )}
                  {!a.is_current && (
                    <Field label="Reason for moving" className="col-span-2"><Input value={a.reason_for_moving} onChange={e => updateAt<AddressEntry>(setAddresses, idx, { reason_for_moving: e.target.value })} /></Field>
                  )}
                </div>
                <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wide pt-1">Landlord reference (optional)</p>
                <div className="grid grid-cols-3 gap-3">
                  <Field label="Name"><Input value={a.landlord_name} onChange={e => updateAt<AddressEntry>(setAddresses, idx, { landlord_name: e.target.value })} /></Field>
                  <Field label="Phone"><Input type="tel" value={a.landlord_phone} onChange={e => updateAt<AddressEntry>(setAddresses, idx, { landlord_phone: e.target.value })} /></Field>
                  <Field label="Email"><Input type="email" value={a.landlord_email} onChange={e => updateAt<AddressEntry>(setAddresses, idx, { landlord_email: e.target.value })} /></Field>
                </div>
              </div>
            ))}
            <button type="button" onClick={() => setAddresses(l => [...l, emptyAddress(false)])}
              className="w-full px-3 py-2 border border-dashed border-slate-300 rounded-lg text-sm text-slate-500 hover:border-slate-500 hover:text-slate-700 transition-colors">
              + Add previous address
            </button>
          </Section>

          {/* Employment */}
          <Section title="Employment">
            {employments.map((emp, idx) => (
              <div key={idx} className="border border-slate-200 rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{emp.is_current ? "Current employment" : `Previous employment ${idx}`}</p>
                  {idx > 0 && <button type="button" onClick={() => removeAt<EmploymentEntry>(setEmployments, idx)} className="text-xs text-red-500 hover:text-red-700">Remove</button>}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Employment type">
                    <select className={selectClass} value={emp.employment_type} onChange={e => updateAt<EmploymentEntry>(setEmployments, idx, { employment_type: e.target.value })}>
                      {EMPLOYMENT_TYPES.map(t => <option key={t}>{t}</option>)}
                    </select>
                  </Field>
                  <Field label="Length of employment"><Input placeholder="e.g. 3 years" value={emp.employment_length} onChange={e => updateAt<EmploymentEntry>(setEmployments, idx, { employment_length: e.target.value })} /></Field>
                  <Field label="Company"><Input value={emp.company} onChange={e => updateAt<EmploymentEntry>(setEmployments, idx, { company: e.target.value })} /></Field>
                  <Field label="Position"><Input value={emp.position} onChange={e => updateAt<EmploymentEntry>(setEmployments, idx, { position: e.target.value })} /></Field>
                  <Field label="Company website"><Input value={emp.company_website} onChange={e => updateAt<EmploymentEntry>(setEmployments, idx, { company_website: e.target.value })} /></Field>
                  <Field label="Company LinkedIn URL"><Input value={emp.company_linkedin_url} onChange={e => updateAt<EmploymentEntry>(setEmployments, idx, { company_linkedin_url: e.target.value })} /></Field>
                  <Field label="Additional notes" className="col-span-2"><Textarea rows={2} value={emp.additional_notes} onChange={e => updateAt<EmploymentEntry>(setEmployments, idx, { additional_notes: e.target.value })} /></Field>
                </div>
                <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wide pt-1">Employer reference (optional)</p>
                <div className="grid grid-cols-3 gap-3">
                  <Field label="Name"><Input value={emp.employer_reference_name} onChange={e => updateAt<EmploymentEntry>(setEmployments, idx, { employer_reference_name: e.target.value })} /></Field>
                  <Field label="Phone"><Input type="tel" value={emp.employer_reference_phone} onChange={e => updateAt<EmploymentEntry>(setEmployments, idx, { employer_reference_phone: e.target.value })} /></Field>
                  <Field label="Email"><Input type="email" value={emp.employer_reference_email} onChange={e => updateAt<EmploymentEntry>(setEmployments, idx, { employer_reference_email: e.target.value })} /></Field>
                </div>
              </div>
            ))}
            <button type="button" onClick={() => setEmployments(l => [...l, emptyEmployment(false)])}
              className="w-full px-3 py-2 border border-dashed border-slate-300 rounded-lg text-sm text-slate-500 hover:border-slate-500 hover:text-slate-700 transition-colors">
              + Add previous employment
            </button>
          </Section>

          {/* Income */}
          <Section title="Income">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Personal income (annually, pre-tax)"><Input type="number" min="0" value={personalIncome} onChange={e => setPersonalIncome(e.target.value)} /></Field>
              <Field label="Household income (annually, pre-tax)"><Input type="number" min="0" value={householdIncome} onChange={e => setHouseholdIncome(e.target.value)} /></Field>
            </div>
            {incomeSources.length > 0 && (
              <div className="space-y-2">
                {incomeSources.map((s, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <input className={rowInputClass} placeholder="Income source (e.g. employer, commission)" value={s.source_name}
                      onChange={e => updateAt<IncomeSourceEntry>(setIncomeSources, idx, { source_name: e.target.value })} />
                    <input className={`${rowInputClass} w-36`} type="number" min="0" placeholder="Amount / yr" value={s.amount_annual}
                      onChange={e => updateAt<IncomeSourceEntry>(setIncomeSources, idx, { amount_annual: e.target.value })} />
                    <button type="button" onClick={() => removeAt<IncomeSourceEntry>(setIncomeSources, idx)} className="text-slate-400 hover:text-red-500 text-lg shrink-0">×</button>
                  </div>
                ))}
              </div>
            )}
            <button type="button" onClick={() => setIncomeSources(l => [...l, { source_name: "", amount_annual: "" }])}
              className="text-xs font-medium text-blue-600 hover:underline">+ Add income source</button>
          </Section>

          {/* Occupants */}
          <Section title="Occupants" subtitle="Anyone else who will live in the unit">
            {occupants.length > 0 && (
              <div className="space-y-2">
                {occupants.map((o, idx) => (
                  <div key={idx} className="grid grid-cols-[1.2fr_1fr_1fr_1fr_0.7fr_auto] gap-2 items-center">
                    <input className={rowInputClass} placeholder="Name" value={o.name} onChange={e => updateAt<OccupantEntry>(setOccupants, idx, { name: e.target.value })} />
                    <input className={rowInputClass} placeholder="Relationship" value={o.relationship_label} onChange={e => updateAt<OccupantEntry>(setOccupants, idx, { relationship_label: e.target.value })} />
                    <input className={rowInputClass} placeholder="Email" value={o.email} onChange={e => updateAt<OccupantEntry>(setOccupants, idx, { email: e.target.value })} />
                    <input className={rowInputClass} placeholder="Phone" value={o.phone} onChange={e => updateAt<OccupantEntry>(setOccupants, idx, { phone: e.target.value })} />
                    <input className={rowInputClass} type="number" min="0" placeholder="Rent $" value={o.share_of_rent} onChange={e => updateAt<OccupantEntry>(setOccupants, idx, { share_of_rent: e.target.value })} />
                    <button type="button" onClick={() => removeAt<OccupantEntry>(setOccupants, idx)} className="text-slate-400 hover:text-red-500 text-lg shrink-0">×</button>
                    <label className="col-span-6 flex items-center gap-1.5 text-[11px] text-slate-500 -mt-1">
                      <input type="checkbox" checked={o.is_dependent} onChange={e => updateAt<OccupantEntry>(setOccupants, idx, { is_dependent: e.target.checked })} />
                      Dependant (child)
                    </label>
                  </div>
                ))}
              </div>
            )}
            <button type="button" onClick={() => setOccupants(l => [...l, { name: "", relationship_label: "", email: "", phone: "", share_of_rent: "", is_dependent: false }])}
              className="text-xs font-medium text-blue-600 hover:underline">+ Add occupant</button>
          </Section>

          {/* Co-signer */}
          <Section title="Co-signer / Guarantor">
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" checked={hasCosigner} onChange={e => { setHasCosigner(e.target.checked); if (e.target.checked && cosigners.length === 0) setCosigners([{ name: "", relationship_label: "", email: "", phone: "" }]); }} />
              I have a co-signer / guarantor
            </label>
            {hasCosigner && (
              <div className="space-y-2">
                {cosigners.map((c, idx) => (
                  <div key={idx} className="grid grid-cols-[1.2fr_1fr_1fr_1fr_auto] gap-2 items-center">
                    <input className={rowInputClass} placeholder="Name" value={c.name} onChange={e => updateAt<CosignerEntry>(setCosigners, idx, { name: e.target.value })} />
                    <input className={rowInputClass} placeholder="Relationship" value={c.relationship_label} onChange={e => updateAt<CosignerEntry>(setCosigners, idx, { relationship_label: e.target.value })} />
                    <input className={rowInputClass} placeholder="Email" value={c.email} onChange={e => updateAt<CosignerEntry>(setCosigners, idx, { email: e.target.value })} />
                    <input className={rowInputClass} placeholder="Phone" value={c.phone} onChange={e => updateAt<CosignerEntry>(setCosigners, idx, { phone: e.target.value })} />
                    <button type="button" onClick={() => removeAt<CosignerEntry>(setCosigners, idx)} className="text-slate-400 hover:text-red-500 text-lg shrink-0">×</button>
                  </div>
                ))}
                <button type="button" onClick={() => setCosigners(l => [...l, { name: "", relationship_label: "", email: "", phone: "" }])}
                  className="text-xs font-medium text-blue-600 hover:underline">+ Add another co-signer</button>
              </div>
            )}
          </Section>

          {/* Pets */}
          <Section title="Pets">
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" checked={hasPets} onChange={e => { setHasPets(e.target.checked); if (e.target.checked && pets.length === 0) setPets([{ animal_type: "", breed: "", weight_lbs: "", sex: "", age: "", is_fixed: false }]); }} />
              I have pets
            </label>
            {hasPets && (
              <div className="space-y-2">
                {pets.map((p, idx) => (
                  <div key={idx} className="grid grid-cols-[1fr_1fr_0.7fr_0.6fr_0.6fr_auto_auto] gap-2 items-center">
                    <input className={rowInputClass} placeholder="Type (e.g. Cat)" value={p.animal_type} onChange={e => updateAt<PetEntry>(setPets, idx, { animal_type: e.target.value })} />
                    <input className={rowInputClass} placeholder="Breed" value={p.breed} onChange={e => updateAt<PetEntry>(setPets, idx, { breed: e.target.value })} />
                    <input className={rowInputClass} type="number" min="0" placeholder="Weight (lbs)" value={p.weight_lbs} onChange={e => updateAt<PetEntry>(setPets, idx, { weight_lbs: e.target.value })} />
                    <select className={selectClass} value={p.sex} onChange={e => updateAt<PetEntry>(setPets, idx, { sex: e.target.value })}>
                      <option value="">Sex</option><option value="M">M</option><option value="F">F</option>
                    </select>
                    <input className={rowInputClass} type="number" min="0" placeholder="Age" value={p.age} onChange={e => updateAt<PetEntry>(setPets, idx, { age: e.target.value })} />
                    <label className="flex items-center gap-1 text-[11px] text-slate-500 whitespace-nowrap">
                      <input type="checkbox" checked={p.is_fixed} onChange={e => updateAt<PetEntry>(setPets, idx, { is_fixed: e.target.checked })} /> Fixed
                    </label>
                    <button type="button" onClick={() => removeAt<PetEntry>(setPets, idx)} className="text-slate-400 hover:text-red-500 text-lg shrink-0">×</button>
                  </div>
                ))}
                <button type="button" onClick={() => setPets(l => [...l, { animal_type: "", breed: "", weight_lbs: "", sex: "", age: "", is_fixed: false }])}
                  className="text-xs font-medium text-blue-600 hover:underline">+ Add another pet</button>
              </div>
            )}
          </Section>

          {/* Vehicles */}
          <Section title="Vehicles">
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" checked={hasVehicle} onChange={e => { setHasVehicle(e.target.checked); if (e.target.checked && vehicles.length === 0) setVehicles([{ make: "", model: "", year: "", license_plate: "" }]); }} />
              I have a vehicle
            </label>
            {hasVehicle && (
              <div className="space-y-2">
                {vehicles.map((v, idx) => (
                  <div key={idx} className="grid grid-cols-[1fr_1fr_0.7fr_1fr_auto] gap-2 items-center">
                    <input className={rowInputClass} placeholder="Make" value={v.make} onChange={e => updateAt<VehicleEntry>(setVehicles, idx, { make: e.target.value })} />
                    <input className={rowInputClass} placeholder="Model" value={v.model} onChange={e => updateAt<VehicleEntry>(setVehicles, idx, { model: e.target.value })} />
                    <input className={rowInputClass} type="number" placeholder="Year" value={v.year} onChange={e => updateAt<VehicleEntry>(setVehicles, idx, { year: e.target.value })} />
                    <input className={rowInputClass} placeholder="Licence plate" value={v.license_plate} onChange={e => updateAt<VehicleEntry>(setVehicles, idx, { license_plate: e.target.value })} />
                    <button type="button" onClick={() => removeAt<VehicleEntry>(setVehicles, idx)} className="text-slate-400 hover:text-red-500 text-lg shrink-0">×</button>
                  </div>
                ))}
                <button type="button" onClick={() => setVehicles(l => [...l, { make: "", model: "", year: "", license_plate: "" }])}
                  className="text-xs font-medium text-blue-600 hover:underline">+ Add another vehicle</button>
              </div>
            )}
          </Section>

          {/* Additional information */}
          <Section title="Additional information">
            <div className="divide-y divide-slate-100">
              {SCREENING_QUESTIONS.map(q => (
                <div key={q.key} className="flex items-center justify-between py-2.5 first:pt-0 last:pb-0">
                  <p className="text-sm text-slate-700">{q.label}</p>
                  <div className="flex gap-1.5 shrink-0">
                    {[["Yes", true], ["No", false]].map(([label, val]) => (
                      <button key={label as string} type="button"
                        onClick={() => setScreening(s => ({ ...s, [q.key]: val as boolean }))}
                        className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                          screening[q.key] === val ? "bg-black text-white border-black" : "border-slate-300 text-slate-600 hover:border-slate-500"
                        }`}>
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            {anyScreeningYes && (
              <Field label="Please explain">
                <Textarea rows={3} value={screeningNotes} onChange={e => setScreeningNotes(e.target.value)} placeholder="Add any context the landlord should know" />
              </Field>
            )}
          </Section>

          {/* Personal message */}
          <Section title="Personal message" subtitle="Optional note to the landlord">
            <Textarea rows={3} value={personalMessage} onChange={e => setPersonalMessage(e.target.value)} placeholder="Tell the landlord a bit about yourself…" />
          </Section>

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
