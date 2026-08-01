"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

// ─── Shared constants ───────────────────────────────────────────────────────

export const COUNTRIES = ["Canada", "USA"] as const;
export type Country = typeof COUNTRIES[number];
export const PROVINCES: Record<Country, string[]> = {
  Canada: ["AB","BC","MB","NB","NL","NS","NT","NU","ON","PE","QC","SK","YT"],
  USA: ["AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY"],
};
export const RESIDENTIAL_STATUSES = ["Rent", "Own", "Live with family", "Other"];
export const EMPLOYMENT_TYPES = ["Full time employment", "Part time employment", "Self-employed", "Student", "Unemployed", "Retired"];

export const selectClass = "h-9 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50";
export const rowInputClass = "text-sm border border-slate-200 rounded-lg px-2.5 py-1.5 outline-none focus:border-black w-full";

// ─── Section card shell (mirrors the SingleKey rental-application layout) ──────

export function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
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

export function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label className="block text-xs font-medium text-slate-500 mb-1">{label}</label>
      {children}
    </div>
  );
}

// ─── Repeatable-list types ──────────────────────────────────────────────────

export interface AddressEntry {
  is_current: boolean;
  residential_status: string;
  street_address: string; city: string; postal_code: string; country: string; province: string;
  move_in_date: string; move_out_date: string;
  monthly_rent: string; reason_for_moving: string;
  landlord_name: string; landlord_phone: string; landlord_email: string;
}
export const emptyAddress = (isCurrent: boolean): AddressEntry => ({
  is_current: isCurrent, residential_status: "Rent",
  street_address: "", city: "", postal_code: "", country: "", province: "",
  move_in_date: "", move_out_date: "",
  monthly_rent: "", reason_for_moving: "",
  landlord_name: "", landlord_phone: "", landlord_email: "",
});

export interface EmploymentEntry {
  is_current: boolean;
  employment_type: string; company: string; position: string; employment_length: string;
  company_website: string; company_linkedin_url: string; additional_notes: string;
  employer_reference_name: string; employer_reference_phone: string; employer_reference_email: string;
}
export const emptyEmployment = (isCurrent: boolean): EmploymentEntry => ({
  is_current: isCurrent, employment_type: "Full time employment", company: "", position: "", employment_length: "",
  company_website: "", company_linkedin_url: "", additional_notes: "",
  employer_reference_name: "", employer_reference_phone: "", employer_reference_email: "",
});

export interface IncomeSourceEntry { source_name: string; amount_annual: string }
export interface OccupantEntry { name: string; relationship_label: string; email: string; phone: string; share_of_rent: string; is_dependent: boolean }
export interface CosignerEntry { name: string; relationship_label: string; email: string; phone: string }
export interface PetEntry { animal_type: string; breed: string; weight_lbs: string; sex: string; age: string; is_fixed: boolean }
export interface VehicleEntry { make: string; model: string; year: string; license_plate: string }

export const SCREENING_QUESTIONS = [
  { key: "smoke_vape", label: "Do you smoke or vape?" },
  { key: "given_notice_to_landlord", label: "Have you given notice to your current landlord?" },
  { key: "refused_rent", label: "Have you ever refused to pay rent?" },
  { key: "evicted", label: "Have you ever been evicted?" },
  { key: "criminal_record", label: "Do you have a criminal record?" },
] as const;

// ─── Generic helpers for repeatable-row state ──────────────────────────────

export function updateAt<T>(setList: (fn: (l: T[]) => T[]) => void, idx: number, patch: Partial<T>) {
  setList(l => l.map((row, i) => (i === idx ? { ...row, ...patch } : row)));
}
export function removeAt<T>(setList: (fn: (l: T[]) => T[]) => void, idx: number) {
  setList(l => l.filter((_, i) => i !== idx));
}

// ─── Bundled state hook ─────────────────────────────────────────────────────

export function useRentalApplicationState() {
  const [addresses, setAddresses] = useState<AddressEntry[]>([emptyAddress(true)]);
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

  return {
    addresses, setAddresses, employments, setEmployments,
    personalIncome, setPersonalIncome, householdIncome, setHouseholdIncome, incomeSources, setIncomeSources,
    occupants, setOccupants,
    hasCosigner, setHasCosigner, cosigners, setCosigners,
    hasPets, setHasPets, pets, setPets,
    hasVehicle, setHasVehicle, vehicles, setVehicles,
    screening, setScreening, screeningNotes, setScreeningNotes,
    personalMessage, setPersonalMessage,
  };
}
export type RentalApplicationState = ReturnType<typeof useRentalApplicationState>;

// Assembles the nested payload fields expected by the backend (TenantCreate / RegisterRequest)
export function buildRentalApplicationPayload(s: RentalApplicationState) {
  const anyYes = Object.values(s.screening).some(v => v === true);
  return {
    personal_income_annual: s.personalIncome ? parseFloat(s.personalIncome) : null,
    household_income_annual: s.householdIncome ? parseFloat(s.householdIncome) : null,
    personal_message: s.personalMessage || null,
    smoke_vape: s.screening.smoke_vape,
    given_notice_to_landlord: s.screening.given_notice_to_landlord,
    refused_rent: s.screening.refused_rent,
    evicted: s.screening.evicted,
    criminal_record: s.screening.criminal_record,
    screening_notes: anyYes ? (s.screeningNotes || null) : null,
    address_history: s.addresses
      .filter(a => a.street_address || a.city)
      .map(a => ({
        ...a,
        move_in_date: a.move_in_date || null,
        move_out_date: a.move_out_date || null,
        monthly_rent: a.monthly_rent ? parseFloat(a.monthly_rent) : null,
      })),
    employment_history: s.employments
      .filter(emp => emp.company || emp.position)
      .map(emp => ({ ...emp })),
    income_sources: s.incomeSources
      .filter(src => src.source_name && src.amount_annual)
      .map(src => ({ source_name: src.source_name, amount_annual: parseFloat(src.amount_annual) || 0 })),
    occupants: s.occupants
      .filter(o => o.name)
      .map(o => ({ ...o, share_of_rent: o.share_of_rent ? parseFloat(o.share_of_rent) : null })),
    cosigners: s.hasCosigner ? s.cosigners.filter(c => c.name) : [],
    pets: s.hasPets ? s.pets.filter(p => p.animal_type).map(p => ({
      ...p,
      weight_lbs: p.weight_lbs ? parseFloat(p.weight_lbs) : null,
      age: p.age ? parseInt(p.age, 10) : null,
    })) : [],
    vehicles: s.hasVehicle ? s.vehicles.filter(v => v.make).map(v => ({
      ...v,
      year: v.year ? parseInt(v.year, 10) : null,
    })) : [],
  };
}

// ─── Shared JSX sections: Address history → Personal message ──────────────
// (Personal details and Documents stay page-specific — they differ between
// the public self-registration flow and the owner-driven Add-tenant flow.)

export function RentalApplicationSections({ state: s, askCriminalRecord = true, askRentalHistory = true }: {
  state: RentalApplicationState;
  /** Whether to ask "Do you have a criminal record?" — off by default on the public join page unless the landlord opted in. */
  askCriminalRecord?: boolean;
  /** Whether to ask about eviction / refused-rent history — off by default on the public join page unless the landlord opted in. */
  askRentalHistory?: boolean;
}) {
  const anyScreeningYes = Object.values(s.screening).some(v => v === true);
  const visibleQuestions = SCREENING_QUESTIONS.filter(q => {
    if (q.key === "criminal_record") return askCriminalRecord;
    if (q.key === "evicted" || q.key === "refused_rent") return askRentalHistory;
    return true;
  });

  return (
    <>
      {/* Address history */}
      <Section title="Address history" subtitle="Start with the current address">
        {s.addresses.map((a, idx) => (
          <div key={idx} className="border border-slate-200 rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{a.is_current ? "Current address" : `Previous address ${idx}`}</p>
              {idx > 0 && <button type="button" onClick={() => removeAt<AddressEntry>(s.setAddresses, idx)} className="text-xs text-red-500 hover:text-red-700">Remove</button>}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Residential status">
                <select className={selectClass} value={a.residential_status} onChange={e => updateAt<AddressEntry>(s.setAddresses, idx, { residential_status: e.target.value })}>
                  {RESIDENTIAL_STATUSES.map(r => <option key={r}>{r}</option>)}
                </select>
              </Field>
              <Field label="Monthly rent ($)"><Input type="number" min="0" value={a.monthly_rent} onChange={e => updateAt<AddressEntry>(s.setAddresses, idx, { monthly_rent: e.target.value })} /></Field>
              <Field label="Street address" className="col-span-2"><Input value={a.street_address} onChange={e => updateAt<AddressEntry>(s.setAddresses, idx, { street_address: e.target.value })} /></Field>
              <Field label="City"><Input value={a.city} onChange={e => updateAt<AddressEntry>(s.setAddresses, idx, { city: e.target.value })} /></Field>
              <Field label="Postal / ZIP code"><Input value={a.postal_code} onChange={e => updateAt<AddressEntry>(s.setAddresses, idx, { postal_code: e.target.value })} /></Field>
              <Field label="Country">
                <select className={selectClass} value={a.country} onChange={e => updateAt<AddressEntry>(s.setAddresses, idx, { country: e.target.value, province: "" })}>
                  <option value="">— select —</option>
                  {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </Field>
              <Field label="Province / State">
                <select className={selectClass} value={a.province} disabled={!a.country} onChange={e => updateAt<AddressEntry>(s.setAddresses, idx, { province: e.target.value })}>
                  <option value="">— select —</option>
                  {(a.country ? PROVINCES[a.country as Country] ?? [] : []).map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </Field>
              <Field label={a.is_current ? "Length of stay — from" : "Move-in date"}><Input type="date" value={a.move_in_date} onChange={e => updateAt<AddressEntry>(s.setAddresses, idx, { move_in_date: e.target.value })} /></Field>
              {!a.is_current && (
                <Field label="Move-out date"><Input type="date" value={a.move_out_date} onChange={e => updateAt<AddressEntry>(s.setAddresses, idx, { move_out_date: e.target.value })} /></Field>
              )}
              {!a.is_current && (
                <Field label="Reason for moving" className="col-span-2"><Input value={a.reason_for_moving} onChange={e => updateAt<AddressEntry>(s.setAddresses, idx, { reason_for_moving: e.target.value })} /></Field>
              )}
            </div>
            <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wide pt-1">Landlord reference (optional)</p>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Name"><Input value={a.landlord_name} onChange={e => updateAt<AddressEntry>(s.setAddresses, idx, { landlord_name: e.target.value })} /></Field>
              <Field label="Phone"><Input type="tel" value={a.landlord_phone} onChange={e => updateAt<AddressEntry>(s.setAddresses, idx, { landlord_phone: e.target.value })} /></Field>
              <Field label="Email"><Input type="email" value={a.landlord_email} onChange={e => updateAt<AddressEntry>(s.setAddresses, idx, { landlord_email: e.target.value })} /></Field>
            </div>
          </div>
        ))}
        <button type="button" onClick={() => s.setAddresses(l => [...l, emptyAddress(false)])}
          className="w-full px-3 py-2 border border-dashed border-slate-300 rounded-lg text-sm text-slate-500 hover:border-slate-500 hover:text-slate-700 transition-colors">
          + Add previous address
        </button>
      </Section>

      {/* Employment */}
      <Section title="Employment">
        {s.employments.map((emp, idx) => (
          <div key={idx} className="border border-slate-200 rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{emp.is_current ? "Current employment" : `Previous employment ${idx}`}</p>
              {idx > 0 && <button type="button" onClick={() => removeAt<EmploymentEntry>(s.setEmployments, idx)} className="text-xs text-red-500 hover:text-red-700">Remove</button>}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Employment type">
                <select className={selectClass} value={emp.employment_type} onChange={e => updateAt<EmploymentEntry>(s.setEmployments, idx, { employment_type: e.target.value })}>
                  {EMPLOYMENT_TYPES.map(t => <option key={t}>{t}</option>)}
                </select>
              </Field>
              <Field label="Length of employment"><Input placeholder="e.g. 3 years" value={emp.employment_length} onChange={e => updateAt<EmploymentEntry>(s.setEmployments, idx, { employment_length: e.target.value })} /></Field>
              <Field label="Company"><Input value={emp.company} onChange={e => updateAt<EmploymentEntry>(s.setEmployments, idx, { company: e.target.value })} /></Field>
              <Field label="Position"><Input value={emp.position} onChange={e => updateAt<EmploymentEntry>(s.setEmployments, idx, { position: e.target.value })} /></Field>
              <Field label="Company website"><Input value={emp.company_website} onChange={e => updateAt<EmploymentEntry>(s.setEmployments, idx, { company_website: e.target.value })} /></Field>
              <Field label="Company LinkedIn URL"><Input value={emp.company_linkedin_url} onChange={e => updateAt<EmploymentEntry>(s.setEmployments, idx, { company_linkedin_url: e.target.value })} /></Field>
              <Field label="Additional notes" className="col-span-2"><Textarea rows={2} value={emp.additional_notes} onChange={e => updateAt<EmploymentEntry>(s.setEmployments, idx, { additional_notes: e.target.value })} /></Field>
            </div>
            <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wide pt-1">Employer reference (optional)</p>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Name"><Input value={emp.employer_reference_name} onChange={e => updateAt<EmploymentEntry>(s.setEmployments, idx, { employer_reference_name: e.target.value })} /></Field>
              <Field label="Phone"><Input type="tel" value={emp.employer_reference_phone} onChange={e => updateAt<EmploymentEntry>(s.setEmployments, idx, { employer_reference_phone: e.target.value })} /></Field>
              <Field label="Email"><Input type="email" value={emp.employer_reference_email} onChange={e => updateAt<EmploymentEntry>(s.setEmployments, idx, { employer_reference_email: e.target.value })} /></Field>
            </div>
          </div>
        ))}
        <button type="button" onClick={() => s.setEmployments(l => [...l, emptyEmployment(false)])}
          className="w-full px-3 py-2 border border-dashed border-slate-300 rounded-lg text-sm text-slate-500 hover:border-slate-500 hover:text-slate-700 transition-colors">
          + Add previous employment
        </button>
      </Section>

      {/* Income */}
      <Section title="Income">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Personal income (annually, pre-tax)"><Input type="number" min="0" value={s.personalIncome} onChange={e => s.setPersonalIncome(e.target.value)} /></Field>
          <Field label="Household income (annually, pre-tax)"><Input type="number" min="0" value={s.householdIncome} onChange={e => s.setHouseholdIncome(e.target.value)} /></Field>
        </div>
        {s.incomeSources.length > 0 && (
          <div className="space-y-2">
            {s.incomeSources.map((src, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <input className={rowInputClass} placeholder="Income source (e.g. employer, commission)" value={src.source_name}
                  onChange={e => updateAt<IncomeSourceEntry>(s.setIncomeSources, idx, { source_name: e.target.value })} />
                <input className={`${rowInputClass} w-36`} type="number" min="0" placeholder="Amount / yr" value={src.amount_annual}
                  onChange={e => updateAt<IncomeSourceEntry>(s.setIncomeSources, idx, { amount_annual: e.target.value })} />
                <button type="button" onClick={() => removeAt<IncomeSourceEntry>(s.setIncomeSources, idx)} className="text-slate-400 hover:text-red-500 text-lg shrink-0">×</button>
              </div>
            ))}
          </div>
        )}
        <button type="button" onClick={() => s.setIncomeSources(l => [...l, { source_name: "", amount_annual: "" }])}
          className="text-xs font-medium text-blue-600 hover:underline">+ Add income source</button>
      </Section>

      {/* Occupants */}
      <Section title="Occupants" subtitle="Anyone else who will live in the unit">
        {s.occupants.length > 0 && (
          <div className="space-y-2">
            {s.occupants.map((o, idx) => (
              <div key={idx} className="grid grid-cols-[1.2fr_1fr_1fr_1fr_0.7fr_auto] gap-2 items-center">
                <input className={rowInputClass} placeholder="Name" value={o.name} onChange={e => updateAt<OccupantEntry>(s.setOccupants, idx, { name: e.target.value })} />
                <input className={rowInputClass} placeholder="Relationship" value={o.relationship_label} onChange={e => updateAt<OccupantEntry>(s.setOccupants, idx, { relationship_label: e.target.value })} />
                <input className={rowInputClass} placeholder="Email" value={o.email} onChange={e => updateAt<OccupantEntry>(s.setOccupants, idx, { email: e.target.value })} />
                <input className={rowInputClass} placeholder="Phone" value={o.phone} onChange={e => updateAt<OccupantEntry>(s.setOccupants, idx, { phone: e.target.value })} />
                <input className={rowInputClass} type="number" min="0" placeholder="Rent $" value={o.share_of_rent} onChange={e => updateAt<OccupantEntry>(s.setOccupants, idx, { share_of_rent: e.target.value })} />
                <button type="button" onClick={() => removeAt<OccupantEntry>(s.setOccupants, idx)} className="text-slate-400 hover:text-red-500 text-lg shrink-0">×</button>
                <label className="col-span-6 flex items-center gap-1.5 text-[11px] text-slate-500 -mt-1">
                  <input type="checkbox" checked={o.is_dependent} onChange={e => updateAt<OccupantEntry>(s.setOccupants, idx, { is_dependent: e.target.checked })} />
                  Dependant (child)
                </label>
              </div>
            ))}
          </div>
        )}
        <button type="button" onClick={() => s.setOccupants(l => [...l, { name: "", relationship_label: "", email: "", phone: "", share_of_rent: "", is_dependent: false }])}
          className="text-xs font-medium text-blue-600 hover:underline">+ Add occupant</button>
      </Section>

      {/* Co-signer */}
      <Section title="Co-signer / Guarantor">
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={s.hasCosigner} onChange={e => { s.setHasCosigner(e.target.checked); if (e.target.checked && s.cosigners.length === 0) s.setCosigners([{ name: "", relationship_label: "", email: "", phone: "" }]); }} />
          I have a co-signer / guarantor
        </label>
        {s.hasCosigner && (
          <div className="space-y-2">
            {s.cosigners.map((c, idx) => (
              <div key={idx} className="grid grid-cols-[1.2fr_1fr_1fr_1fr_auto] gap-2 items-center">
                <input className={rowInputClass} placeholder="Name" value={c.name} onChange={e => updateAt<CosignerEntry>(s.setCosigners, idx, { name: e.target.value })} />
                <input className={rowInputClass} placeholder="Relationship" value={c.relationship_label} onChange={e => updateAt<CosignerEntry>(s.setCosigners, idx, { relationship_label: e.target.value })} />
                <input className={rowInputClass} placeholder="Email" value={c.email} onChange={e => updateAt<CosignerEntry>(s.setCosigners, idx, { email: e.target.value })} />
                <input className={rowInputClass} placeholder="Phone" value={c.phone} onChange={e => updateAt<CosignerEntry>(s.setCosigners, idx, { phone: e.target.value })} />
                <button type="button" onClick={() => removeAt<CosignerEntry>(s.setCosigners, idx)} className="text-slate-400 hover:text-red-500 text-lg shrink-0">×</button>
              </div>
            ))}
            <button type="button" onClick={() => s.setCosigners(l => [...l, { name: "", relationship_label: "", email: "", phone: "" }])}
              className="text-xs font-medium text-blue-600 hover:underline">+ Add another co-signer</button>
          </div>
        )}
      </Section>

      {/* Pets */}
      <Section title="Pets">
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={s.hasPets} onChange={e => { s.setHasPets(e.target.checked); if (e.target.checked && s.pets.length === 0) s.setPets([{ animal_type: "", breed: "", weight_lbs: "", sex: "", age: "", is_fixed: false }]); }} />
          I have pets
        </label>
        {s.hasPets && (
          <div className="space-y-2">
            {s.pets.map((p, idx) => (
              <div key={idx} className="grid grid-cols-[1fr_1fr_0.7fr_0.6fr_0.6fr_auto_auto] gap-2 items-center">
                <input className={rowInputClass} placeholder="Type (e.g. Cat)" value={p.animal_type} onChange={e => updateAt<PetEntry>(s.setPets, idx, { animal_type: e.target.value })} />
                <input className={rowInputClass} placeholder="Breed" value={p.breed} onChange={e => updateAt<PetEntry>(s.setPets, idx, { breed: e.target.value })} />
                <input className={rowInputClass} type="number" min="0" placeholder="Weight (lbs)" value={p.weight_lbs} onChange={e => updateAt<PetEntry>(s.setPets, idx, { weight_lbs: e.target.value })} />
                <select className={selectClass} value={p.sex} onChange={e => updateAt<PetEntry>(s.setPets, idx, { sex: e.target.value })}>
                  <option value="">Sex</option><option value="M">M</option><option value="F">F</option>
                </select>
                <input className={rowInputClass} type="number" min="0" placeholder="Age" value={p.age} onChange={e => updateAt<PetEntry>(s.setPets, idx, { age: e.target.value })} />
                <label className="flex items-center gap-1 text-[11px] text-slate-500 whitespace-nowrap">
                  <input type="checkbox" checked={p.is_fixed} onChange={e => updateAt<PetEntry>(s.setPets, idx, { is_fixed: e.target.checked })} /> Fixed
                </label>
                <button type="button" onClick={() => removeAt<PetEntry>(s.setPets, idx)} className="text-slate-400 hover:text-red-500 text-lg shrink-0">×</button>
              </div>
            ))}
            <button type="button" onClick={() => s.setPets(l => [...l, { animal_type: "", breed: "", weight_lbs: "", sex: "", age: "", is_fixed: false }])}
              className="text-xs font-medium text-blue-600 hover:underline">+ Add another pet</button>
          </div>
        )}
      </Section>

      {/* Vehicles */}
      <Section title="Vehicles">
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={s.hasVehicle} onChange={e => { s.setHasVehicle(e.target.checked); if (e.target.checked && s.vehicles.length === 0) s.setVehicles([{ make: "", model: "", year: "", license_plate: "" }]); }} />
          I have a vehicle
        </label>
        {s.hasVehicle && (
          <div className="space-y-2">
            {s.vehicles.map((v, idx) => (
              <div key={idx} className="grid grid-cols-[1fr_1fr_0.7fr_1fr_auto] gap-2 items-center">
                <input className={rowInputClass} placeholder="Make" value={v.make} onChange={e => updateAt<VehicleEntry>(s.setVehicles, idx, { make: e.target.value })} />
                <input className={rowInputClass} placeholder="Model" value={v.model} onChange={e => updateAt<VehicleEntry>(s.setVehicles, idx, { model: e.target.value })} />
                <input className={rowInputClass} type="number" placeholder="Year" value={v.year} onChange={e => updateAt<VehicleEntry>(s.setVehicles, idx, { year: e.target.value })} />
                <input className={rowInputClass} placeholder="Licence plate" value={v.license_plate} onChange={e => updateAt<VehicleEntry>(s.setVehicles, idx, { license_plate: e.target.value })} />
                <button type="button" onClick={() => removeAt<VehicleEntry>(s.setVehicles, idx)} className="text-slate-400 hover:text-red-500 text-lg shrink-0">×</button>
              </div>
            ))}
            <button type="button" onClick={() => s.setVehicles(l => [...l, { make: "", model: "", year: "", license_plate: "" }])}
              className="text-xs font-medium text-blue-600 hover:underline">+ Add another vehicle</button>
          </div>
        )}
      </Section>

      {/* Additional information */}
      <Section title="Additional information">
        <div className="divide-y divide-slate-100">
          {visibleQuestions.map(q => (
            <div key={q.key} className="flex items-center justify-between py-2.5 first:pt-0 last:pb-0">
              <p className="text-sm text-slate-700">{q.label}</p>
              <div className="flex gap-1.5 shrink-0">
                {[["Yes", true], ["No", false]].map(([label, val]) => (
                  <button key={label as string} type="button"
                    onClick={() => s.setScreening(prev => ({ ...prev, [q.key]: val as boolean }))}
                    className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                      s.screening[q.key] === val ? "bg-black text-white border-black" : "border-slate-300 text-slate-600 hover:border-slate-500"
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
            <Textarea rows={3} value={s.screeningNotes} onChange={e => s.setScreeningNotes(e.target.value)} placeholder="Add any context the landlord should know" />
          </Field>
        )}
      </Section>

      {/* Personal message */}
      <Section title="Personal message" subtitle="Optional note to the landlord">
        <Textarea rows={3} value={s.personalMessage} onChange={e => s.setPersonalMessage(e.target.value)} placeholder="Tell the landlord a bit about the tenant…" />
      </Section>
    </>
  );
}
