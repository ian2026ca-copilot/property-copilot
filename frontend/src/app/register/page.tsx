"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { setToken } from "@/lib/auth";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const ROLES = [
  { value: "OWNER", label: "Owner", description: "Full control — manages properties, team, and billing" },
  { value: "TENANT", label: "Tenant", description: "Access to personal portal, maintenance requests, and payments" },
  { value: "VENDOR", label: "Vendor / Contractor", description: "Receive assigned maintenance jobs and manage your schedule" },
] as const;

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
const selectClass = "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50";

export default function RegisterPage() {
  const [form, setForm] = useState({
    first_name: "", last_name: "", email: "", password: "", org_name: "", role: "OWNER", phone: "",
    business_name: "", service_categories: [] as string[],
    street_address: "", city: "", postal_code: "", country: "", province: "",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { refresh } = useAuth();

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
    if (form.role === "VENDOR" && form.service_categories.length === 0) {
      setError("Please select at least one service category.");
      return;
    }
    setLoading(true);
    try {
      const full_name = `${form.first_name.trim()} ${form.last_name.trim()}`.trim();
      const res = await api.post<{ access_token: string }>("/auth/register", {
        ...form,
        phone,
        full_name,
        org_name: form.role === "VENDOR" ? (form.business_name || full_name) : form.org_name,
      });
      setToken(res.access_token);
      await refresh();
      router.push(form.role === "VENDOR" ? "/vendor" : form.role === "OWNER" ? "/settings?tab=billing&welcome=1" : "/dashboard");
    } catch (err: any) {
      setError(err.message ?? "Registration failed");
    } finally {
      setLoading(false);
    }
  }

  const isVendor = form.role === "VENDOR";

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 py-10">
      <div className="w-full max-w-md px-4">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white font-bold text-sm">PC</div>
            <span className="text-xl font-semibold text-slate-900">Property Copilot</span>
          </div>
          <p className="text-slate-500 text-sm">AI-powered property management</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Create your account</CardTitle>
            <CardDescription>Set up your organization and get started</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Role selector */}
              <div className="space-y-1.5">
                <Label>Your role</Label>
                <div className="grid grid-cols-2 gap-2">
                  {ROLES.map((r) => (
                    <button
                      key={r.value}
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, role: r.value }))}
                      className={`text-left px-3 py-2.5 rounded-lg border text-sm transition-colors ${
                        form.role === r.value
                          ? "border-black bg-black text-white"
                          : "border-slate-200 hover:border-slate-400 text-slate-700"
                      }`}
                    >
                      <p className="font-medium">{r.label}</p>
                      <p className={`text-[11px] mt-0.5 leading-snug ${form.role === r.value ? "text-white/70" : "text-slate-400"}`}>
                        {r.description}
                      </p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Vendor-specific fields */}
              {isVendor ? (
                <>
                  <div className="space-y-1.5">
                    <Label htmlFor="business_name">Business name</Label>
                    <Input id="business_name" placeholder="Smith Plumbing Co." value={form.business_name}
                      onChange={set("business_name")} required={isVendor} />
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
                </>
              ) : (
                <div className="space-y-1.5">
                  <Label htmlFor="org_name">Company / Organization name</Label>
                  <Input id="org_name" placeholder="Acme Properties LLC" value={form.org_name} onChange={set("org_name")} required={!isVendor} />
                </div>
              )}

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
                <Input id="email" type="email" placeholder="you@company.com" value={form.email} onChange={set("email")} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="phone">Phone number</Label>
                <Input id="phone" type="tel" placeholder="6041234567" value={form.phone} onChange={set("phone")} required />
                <p className="text-[11px] text-slate-400">10-digit number (e.g. 6041234567) or international format (+15550001234)</p>
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
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Creating account…" : "Create account"}
              </Button>
            </form>
            <p className="text-center text-sm text-slate-500 mt-4">
              Already have an account?{" "}
              <Link href="/login" className="text-blue-600 hover:underline font-medium">
                Sign in
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
