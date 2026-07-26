"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { api, orgsApi, type OrganizationPublicOut } from "@/lib/api";
import { setToken } from "@/lib/auth";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
const selectClass = "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50";

export default function JoinLandlordPage() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;
  const router = useRouter();
  const { refresh } = useAuth();

  const [org, setOrg] = useState<OrganizationPublicOut | null>(null);
  const [orgError, setOrgError] = useState("");
  const [loadingOrg, setLoadingOrg] = useState(true);
  const [role, setRole] = useState<Role | null>(null);

  const [form, setForm] = useState({
    first_name: "", last_name: "", email: "", password: "", phone: "",
    business_name: "", service_categories: [] as string[],
    street_address: "", city: "", postal_code: "", country: "", province: "",
  });
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
      const res = await api.post<{ access_token: string }>("/auth/register", {
        ...form,
        phone,
        full_name,
        role,
        org_slug: slug,
      });
      setToken(res.access_token);
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

        {!role ? (
          <Card>
            <CardHeader>
              <CardTitle>How would you like to join?</CardTitle>
              <CardDescription>Choose the option that describes you</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <button
                type="button"
                onClick={() => setRole("TENANT")}
                className="w-full text-left px-4 py-3.5 rounded-lg border border-slate-200 hover:border-black transition-colors"
              >
                <p className="font-medium text-sm text-slate-900">I'm a Tenant</p>
                <p className="text-[12px] text-slate-400 mt-0.5">Access your lease, submit maintenance requests, and make payments</p>
              </button>
              <button
                type="button"
                onClick={() => setRole("VENDOR")}
                className="w-full text-left px-4 py-3.5 rounded-lg border border-slate-200 hover:border-black transition-colors"
              >
                <p className="font-medium text-sm text-slate-900">I'm a Vendor / Contractor</p>
                <p className="text-[12px] text-slate-400 mt-0.5">Receive assigned maintenance jobs and manage your schedule</p>
              </button>
              <p className="text-center text-sm text-slate-500 pt-2">
                Already have an account?{" "}
                <Link href="/login" className="text-blue-600 hover:underline font-medium">Sign in</Link>
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>{role === "VENDOR" ? "Register as a vendor" : "Register as a tenant"}</CardTitle>
              <CardDescription>Joining {org.name}</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                {role === "VENDOR" && (
                  <>
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
                  </>
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
                  <Input id="email" type="email" placeholder="you@example.com" value={form.email} onChange={set("email")} required />
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
                <div className="flex gap-2">
                  <Button type="button" variant="outline" onClick={() => setRole(null)} disabled={loading}>
                    Back
                  </Button>
                  <Button type="submit" className="flex-1" disabled={loading}>
                    {loading ? "Creating account…" : "Create account"}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
