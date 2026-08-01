const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";
export const UPLOADS_BASE = BASE_URL.replace("/api/v1", "");

function getToken(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(/(?:^|; )token=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : null;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init.headers as Record<string, string>),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${BASE_URL}${path}`, { ...init, headers });
  if (!res.ok) {
    if (res.status === 401 && typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
      window.location.href = "/login";
      return undefined as T;
    }
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail ?? "Request failed");
  }
  if (res.status === 204 || res.headers.get("content-length") === "0") return undefined as T;
  return res.json();
}

async function upload<T>(path: string, file: File): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const body = new FormData();
  body.append("file", file);
  const res = await fetch(`${BASE_URL}${path}`, { method: "POST", headers, body });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail ?? "Upload failed");
  }
  return res.json();
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "POST", body: JSON.stringify(body) }),
  put: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "PUT", body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "PATCH", body: JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};

// ─── Typed resource helpers ────────────────────────────────────────────────

export interface PropertyOut {
  id: string;
  name: string;
  address: string;
  city: string;
  state: string;
  zip_code: string;
  property_type: string;
  year_built: number | null;
  unit_count: number;
  occupied_count: number;
  cover_url: string | null;
}

export interface UnitTenantInfo {
  tenant_user_id: string;
  tenant_name: string | null;
  tenant_avatar_url: string | null;
  lease_id: string;
  lease_start: string | null;
  lease_end: string | null;
  outstanding_balance: number;
}

export interface ContactPhone {
  number: string;
  extension?: string | null;
}

export interface UnitOut {
  id: string;
  property_id: string;
  unit_number: string;
  bedrooms: number;
  bathrooms: number;
  square_feet: number | null;
  monthly_rent: number;
  status: string;
  contact_methods?: string[];
  contact_phones?: ContactPhone[];
  contact_emails?: string[];
  security_deposit?: string | null;
  utilities_included?: string[];
  furnishing?: string | null;
  lease_term?: string | null;
  availability_date?: string | null;
  smoking_policy?: string | null;
  dogs_policy?: string | null;
  cats_policy?: string | null;
  pet_fee?: number | null;
  parking_available?: boolean | null;
  property_heading?: string | null;
  hidden_notes?: string | null;
  description?: string | null;
  home_features?: string[];
  neighborhood_features?: string[];
  property_name?: string | null;
  tenant_name?: string | null;
  tenant_user_id?: string | null;
  tenant_avatar_url?: string | null;
  lease_id?: string | null;
  lease_start?: string | null;
  lease_end?: string | null;
  outstanding_balance?: number;
  tenants?: UnitTenantInfo[];
}

export interface TenantDocumentOut {
  id: string;
  doc_type: "id_document" | "reference_letter" | "paystub" | "bank_statement" | "other";
  filename: string;
  original_name: string;
  url: string;
}

export interface TenantOut {
  id: string;
  first_name: string | null;
  last_name: string | null;
  full_name: string;
  email: string;
  phone: string;
  date_of_birth: string | null;
  avatar_url: string | null;
  street_address: string | null;
  city: string | null;
  province: string | null;
  postal_code: string | null;
  country: string | null;
  documents: TenantDocumentOut[];
}

export interface LeaseOut {
  id: string;
  unit_id: string;
  tenant_user_id: string;
  start_date: string;
  end_date: string;
  monthly_rent: number;
  security_deposit: number;
  status: string;
  lease_type: "FIXED" | "MONTH_TO_MONTH";
  document_url: string | null;
  landlord_name: string | null;
  landlord_email: string | null;
  docusign_envelope_id: string | null;
  signature_status: string | null;
  notes: string | null;
  tenant: TenantOut | null;
  co_tenants: TenantOut[];
  unit_number: string | null;
  property_name: string | null;
}

export interface PaymentNoteOut {
  id: string;
  note: string;
  author_name: string;
  author_user_id: string;
  created_at: string | null;
}

export interface PaymentOut {
  id: string;
  lease_id: string;
  amount: number;
  due_date: string;
  paid_date: string | null;
  status: "PENDING" | "PAID" | "OVERDUE" | "VOIDED" | string;
  payment_type: "RENT" | "SECURITY_DEPOSIT" | "LATE_FEE" | "MAINTENANCE_CHARGE" | "OTHER" | string;
  description: string | null;
  notes: PaymentNoteOut[];
  tenant_name: string | null;
  tenant_avatar_url: string | null;
  tenant_email: string | null;
  tenant_phone: string | null;
  unit_number: string | null;
  property_name: string | null;
  status_updated_by_name: string | null;
  status_updated_at: string | null;
}

export interface PaymentNoticeAIGenerateOut {
  subject: string;
  message: string;
}

export interface PaymentNoticeSendOut {
  email_sent: boolean;
  sms_sent: boolean;
  skipped_channels: string[];
  payment: PaymentOut;
}

export interface MaintenanceAttachmentOut {
  id: string;
  filename: string;
  original_name: string;
  url: string;
}

export interface MaintenanceNoteOut {
  id: string;
  note: string;
  author_name: string;
  author_user_id: string;
  created_at: string | null;
}

export type MaintenanceStatus = "SUBMITTED" | "UNDER_REVIEW" | "SCHEDULED" | "IN_PROGRESS" | "COMPLETED" | "CLOSED" | "CANCELLED";
export type MaintenancePriority = "LOW" | "MEDIUM" | "HIGH" | "EMERGENCY";
export type PaymentStatus = "UNPAID" | "PAID";

export interface MaintenanceOut {
  id: string;
  unit_id: string;
  title: string;
  description: string;
  category: string;
  priority: MaintenancePriority;
  status: MaintenanceStatus;
  assignee_name: string | null;
  price: number | null;
  tax: number | null;
  total: number | null;
  payment_status: PaymentStatus;
  submitted_by_name: string | null;
  submitted_by_user_id: string | null;
  tenant_email: string | null;
  tenant_phone: string | null;
  unit_number: string | null;
  property_name: string | null;
  created_at: string | null;
  preferred_time_start: string | null;
  preferred_time_end: string | null;
  est_hours_min: number | null;
  est_hours_max: number | null;
  est_cost_min: number | null;
  est_cost_max: number | null;
  vendor_id: string | null;
  vendor_name: string | null;
  scheduled_start: string | null;
  scheduled_end: string | null;
  attachments: MaintenanceAttachmentOut[];
  notes: MaintenanceNoteOut[];
}

export interface VendorOut {
  id: string;
  user_id: string;
  business_name: string;
  service_categories: string[];
  is_public: boolean;
  street_address: string | null;
  city: string | null;
  province: string | null;
  postal_code: string | null;
  country: string | null;
  full_name: string;
  email: string;
  phone: string;
  avatar_url: string | null;
}

export interface VendorAvailabilityOut {
  id: string;
  date: string;
  start_time: string;
  end_time: string;
}

export interface VendorAvailabilitySlotSuggestion {
  date: string;
  start_time: string;
  end_time: string;
}

export interface VendorAvailabilityAIGenerateOut {
  slots: VendorAvailabilitySlotSuggestion[];
}

export interface UnitDetailOut {
  id: string;
  unit_number: string;
  property_id: string;
  property_name: string;
  property_address: string;
  status: string;
  monthly_rent: number;
  bedrooms: number;
  bathrooms: number;
  square_feet: number | null;
  tenant_name: string | null;
  tenant_user_id: string | null;
  tenant_email: string | null;
  lease_id: string | null;
}

export const unitsApi = {
  listAll: () => api.get<UnitDetailOut[]>("/units"),
};

export const propertiesApi = {
  list: () => api.get<PropertyOut[]>("/properties"),
  create: (body: Omit<PropertyOut, "id" | "unit_count" | "occupied_count">) =>
    api.post<PropertyOut>("/properties", body),
  update: (id: string, body: Partial<Omit<PropertyOut, "id" | "unit_count" | "occupied_count">>) =>
    api.put<PropertyOut>(`/properties/${id}`, body),
  delete: (id: string) => api.delete<void>(`/properties/${id}`),
  listUnits: (propertyId: string) => api.get<UnitOut[]>(`/properties/${propertyId}/units`),
  createUnit: (propertyId: string, body: Omit<UnitOut, "id" | "property_id">) =>
    api.post<UnitOut>(`/properties/${propertyId}/units`, body),
  updateUnit: (propertyId: string, unitId: string, body: Partial<Omit<UnitOut, "id" | "property_id">>) =>
    api.put<UnitOut>(`/properties/${propertyId}/units/${unitId}`, body),
  deleteUnit: (propertyId: string, unitId: string) =>
    api.delete<void>(`/properties/${propertyId}/units/${unitId}`),
  setCover: (propertyId: string, imageId: string | null) =>
    api.patch<PropertyOut>(`/properties/${propertyId}/cover`, { image_id: imageId }),
};

export interface ImageOut {
  id: string;
  filename: string;
  original_name: string;
  url: string;
  sort_order: number;
}

export const imagesApi = {
  listProperty: (propertyId: string) => api.get<ImageOut[]>(`/properties/${propertyId}/images`),
  uploadProperty: (propertyId: string, file: File) => upload<ImageOut>(`/properties/${propertyId}/images`, file),
  deleteProperty: (propertyId: string, imageId: string) => api.delete<void>(`/properties/${propertyId}/images/${imageId}`),
  listUnit: (propertyId: string, unitId: string) => api.get<ImageOut[]>(`/properties/${propertyId}/units/${unitId}/images`),
  uploadUnit: (propertyId: string, unitId: string, file: File) => upload<ImageOut>(`/properties/${propertyId}/units/${unitId}/images`, file),
  deleteUnit: (propertyId: string, unitId: string, imageId: string) => api.delete<void>(`/properties/${propertyId}/units/${unitId}/images/${imageId}`),
};

export interface LeaseTemplateOut {
  id: string;
  name: string;
  original_name: string;
  description: string | null;
  url: string;
  created_at: string;
}

export const leasesApi = {
  list: () => api.get<LeaseOut[]>("/leases"),
  create: (body: object) => api.post<LeaseOut>("/leases", body),
  get: (id: string) => api.get<LeaseOut>(`/leases/${id}`),
  update: (id: string, body: object) => api.put<LeaseOut>(`/leases/${id}`, body),
  terminate: (id: string) => api.delete<void>(`/leases/${id}`),
  deleteDocument: (leaseId: string) => api.delete<void>(`/leases/${leaseId}/document`),
  listTemplates: () => api.get<LeaseTemplateOut[]>("/leases/templates"),
  aiGenerateTemplate: (params: { province: string; lease_type: string; property_type: string; bedrooms: string; notes: string }) => {
    const token = typeof document !== "undefined"
      ? (document.cookie.match(/(?:^|; )token=([^;]*)/) || [])[1]
      : null;
    const headers: Record<string, string> = {};
    if (token) headers["Authorization"] = `Bearer ${decodeURIComponent(token)}`;
    const body = new FormData();
    Object.entries(params).forEach(([k, v]) => body.append(k, v));
    return fetch(`${BASE_URL}/leases/templates/ai-generate`, { method: "POST", headers, body })
      .then(async r => {
        if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.detail ?? "Generation failed"); }
        return r.json() as Promise<LeaseTemplateOut>;
      });
  },
  deleteTemplate: (id: string) => api.delete<void>(`/leases/templates/${id}`),
  uploadTemplate: (name: string, description: string, file: File) => {
    const token = typeof document !== "undefined"
      ? (document.cookie.match(/(?:^|; )token=([^;]*)/) || [])[1]
      : null;
    const headers: Record<string, string> = {};
    if (token) headers["Authorization"] = `Bearer ${decodeURIComponent(token)}`;
    const body = new FormData();
    body.append("file", file);
    body.append("name", name);
    body.append("description", description);
    return fetch(`${BASE_URL}/leases/templates`, { method: "POST", headers, body })
      .then(async r => {
        if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.detail ?? "Upload failed"); }
        return r.json() as Promise<LeaseTemplateOut>;
      });
  },
  generateDocument: (leaseId: string, templateId: string) =>
    api.post<LeaseOut>(`/leases/${leaseId}/generate-document`, { template_id: templateId }),
  deletePermanent: (id: string) => api.delete<void>(`/leases/${id}/permanent`),
  renew: (id: string, body: {
    start_date: string;
    end_date: string;
    unit_id?: string;
    tenant_user_id?: string;
    co_tenant_ids?: string[];
    monthly_rent?: number;
    security_deposit?: number;
    lease_type?: string;
    landlord_name?: string | null;
    landlord_email?: string | null;
    notes?: string | null;
  }) => api.post<LeaseOut>(`/leases/${id}/renew`, body),
  sendForSignature: (id: string) => api.post<LeaseOut>(`/leases/${id}/send-for-signature`, {}),
  checkSignatureStatus: (id: string) => api.post<LeaseOut>(`/leases/${id}/signature-status`, {}),
  uploadDocument: (leaseId: string, file: File) => {
    const token = typeof document !== "undefined"
      ? (document.cookie.match(/(?:^|; )token=([^;]*)/) || [])[1]
      : null;
    const headers: Record<string, string> = {};
    if (token) headers["Authorization"] = `Bearer ${decodeURIComponent(token)}`;
    const body = new FormData();
    body.append("file", file);
    return fetch(`${BASE_URL}/leases/${leaseId}/document`, { method: "POST", headers, body })
      .then(async (r) => {
        if (!r.ok) {
          const err = await r.json().catch(() => ({ detail: r.statusText }));
          throw new Error(err.detail ?? "Upload failed");
        }
        return r.json() as Promise<LeaseOut>;
      });
  },
};

export const tenantsApi = {
  list: () => api.get<LeaseOut[]>("/tenants"),
  create: (body: object) => api.post<LeaseOut>("/tenants", body),
  update: (id: string, body: object) => api.put<LeaseOut>(`/tenants/${id}`, body),
  delete: (id: string) => api.delete<void>(`/tenants/${id}`),
  availableUnits: () => api.get<UnitOut[]>("/tenants/units/available"),
  // Person-only (decoupled)
  listPersons: () => api.get<TenantOut[]>("/tenants/persons"),
  getPerson: (id: string) => api.get<TenantOut>(`/tenants/person/${id}`),
  getApplication: (id: string) => api.get<Record<string, any>>(`/tenants/person/${id}/application`),
  aiExtract: (file: File) => upload<Record<string, string | null>>("/tenants/ai-extract", file),
  createPerson: (body: object) => api.post<TenantOut>("/tenants/person", body),
  updatePerson: (id: string, body: object) => api.put<TenantOut>(`/tenants/person/${id}`, body),
  deactivatePerson: (id: string) => api.delete<void>(`/tenants/person/${id}`),
  listDocuments: (tenantUserId: string) =>
    api.get<TenantDocumentOut[]>(`/tenants/${tenantUserId}/documents`),
  deleteDocument: (tenantUserId: string, docId: string) =>
    api.delete<void>(`/tenants/${tenantUserId}/documents/${docId}`),
  uploadAvatar: (tenantUserId: string, file: File) => {
    const token = typeof document !== "undefined"
      ? (document.cookie.match(/(?:^|; )token=([^;]*)/) || [])[1]
      : null;
    const headers: Record<string, string> = {};
    if (token) headers["Authorization"] = `Bearer ${decodeURIComponent(token)}`;
    const body = new FormData();
    body.append("file", file);
    return fetch(`${BASE_URL}/tenants/${tenantUserId}/avatar`, { method: "POST", headers, body })
      .then(async (r) => {
        if (!r.ok) {
          const err = await r.json().catch(() => ({ detail: r.statusText }));
          throw new Error(err.detail ?? "Upload failed");
        }
        return r.json() as Promise<TenantOut>;
      });
  },
  deleteAvatar: (tenantUserId: string) => api.delete<void>(`/tenants/${tenantUserId}/avatar`),
  uploadDocument: (tenantUserId: string, docType: string, file: File) => {
    const token = typeof document !== "undefined"
      ? (document.cookie.match(/(?:^|; )token=([^;]*)/) || [])[1]
      : null;
    const headers: Record<string, string> = {};
    if (token) headers["Authorization"] = `Bearer ${decodeURIComponent(token)}`;
    const body = new FormData();
    body.append("file", file);
    return fetch(
      `${BASE_URL}/tenants/${tenantUserId}/documents?doc_type=${docType}`,
      { method: "POST", headers, body }
    ).then(async (r) => {
      if (!r.ok) {
        const err = await r.json().catch(() => ({ detail: r.statusText }));
        throw new Error(err.detail ?? "Upload failed");
      }
      return r.json() as Promise<TenantDocumentOut>;
    });
  },
  uploadMyDocument: (docType: string, file: File) => {
    const token = typeof document !== "undefined"
      ? (document.cookie.match(/(?:^|; )token=([^;]*)/) || [])[1]
      : null;
    const headers: Record<string, string> = {};
    if (token) headers["Authorization"] = `Bearer ${decodeURIComponent(token)}`;
    const body = new FormData();
    body.append("file", file);
    return fetch(
      `${BASE_URL}/tenants/me/documents?doc_type=${docType}`,
      { method: "POST", headers, body }
    ).then(async (r) => {
      if (!r.ok) {
        const err = await r.json().catch(() => ({ detail: r.statusText }));
        throw new Error(err.detail ?? "Upload failed");
      }
      return r.json() as Promise<TenantDocumentOut>;
    });
  },
};

export const paymentsApi = {
  list: () => api.get<PaymentOut[]>("/payments"),
  create: (body: object) => api.post<PaymentOut>("/payments", body),
  update: (id: string, body: object) => api.patch<PaymentOut>(`/payments/${id}`, body),
  void: (id: string) => api.delete<void>(`/payments/${id}`),
  addNote: (id: string, note: string) => api.post<PaymentOut>(`/payments/${id}/notes`, { note }),
  removeNote: (id: string, noteId: string) => api.delete<void>(`/payments/${id}/notes/${noteId}`),
  aiGenerateNotice: (id: string, extra_instructions?: string) =>
    api.post<PaymentNoticeAIGenerateOut>(`/payments/${id}/ai-generate-notice`, { extra_instructions: extra_instructions || null }),
  sendNotice: (id: string, body: { subject: string; message: string; channels: string[] }) =>
    api.post<PaymentNoticeSendOut>(`/payments/${id}/send-notice`, body),
};

export interface MaintenanceAIGenerateOut {
  title: string;
  description: string;
}

export const maintenanceApi = {
  list: () => api.get<MaintenanceOut[]>("/maintenance"),
  aiGenerate: (body: { unit_id?: string; category?: string; priority?: string; extra_instructions?: string }) =>
    api.post<MaintenanceAIGenerateOut>("/maintenance/ai-generate", body),
  listAssigned: () => api.get<MaintenanceOut[]>("/maintenance/assigned/me"),
  get: (id: string) => api.get<MaintenanceOut>(`/maintenance/${id}`),
  create: (body: object) => api.post<MaintenanceOut>("/maintenance", body),
  update: (id: string, body: object) => api.patch<MaintenanceOut>(`/maintenance/${id}`, body),
  review: (id: string, body: object) => api.put<MaintenanceOut>(`/maintenance/${id}/review`, body),
  schedule: (id: string, body: object) => api.put<MaintenanceOut>(`/maintenance/${id}/schedule`, body),
  remove: (id: string) => api.delete<void>(`/maintenance/${id}`),
  uploadAttachment: (id: string, file: File) => {
    const token = typeof document !== "undefined"
      ? (document.cookie.match(/(?:^|; )token=([^;]*)/) || [])[1] : null;
    const headers: Record<string, string> = {};
    if (token) headers["Authorization"] = `Bearer ${decodeURIComponent(token)}`;
    const body = new FormData();
    body.append("file", file);
    return fetch(`${BASE_URL}/maintenance/${id}/attachments`, { method: "POST", headers, body })
      .then(async r => {
        if (!r.ok) { const e = await r.json().catch(() => ({ detail: r.statusText })); throw new Error(e.detail); }
        return r.json() as Promise<MaintenanceOut>;
      });
  },
  deleteAttachment: (id: string, attId: string) => api.delete<void>(`/maintenance/${id}/attachments/${attId}`),
  addNote: (id: string, note: string) => api.post<MaintenanceOut>(`/maintenance/${id}/notes`, { note }),
  removeNote: (id: string, noteId: string) => api.delete<void>(`/maintenance/${id}/notes/${noteId}`),
};

export const vendorsApi = {
  list: () => api.get<VendorOut[]>("/vendors"),
  create: (body: object) => api.post<VendorOut>("/vendors", body),
  update: (id: string, body: object) => api.put<VendorOut>(`/vendors/${id}`, body),
  remove: (id: string) => api.delete<void>(`/vendors/${id}`),
  me: () => api.get<VendorOut>("/vendors/me/profile"),
  listAvailability: (vendorId: string) => api.get<VendorAvailabilityOut[]>(`/vendors/${vendorId}/availability`),
  addAvailability: (vendorId: string, body: object) => api.post<VendorAvailabilityOut>(`/vendors/${vendorId}/availability`, body),
  updateAvailability: (vendorId: string, slotId: string, body: object) => api.patch<VendorAvailabilityOut>(`/vendors/${vendorId}/availability/${slotId}`, body),
  deleteAvailability: (vendorId: string, slotId: string) => api.delete<void>(`/vendors/${vendorId}/availability/${slotId}`),
  aiGenerateAvailability: (vendorId: string, description: string) =>
    api.post<VendorAvailabilityAIGenerateOut>(`/vendors/${vendorId}/availability/ai-generate`, { description }),
};

export interface TeamMemberOut {
  member_id: string;
  user_id: string;
  full_name: string;
  email: string;
  phone: string;
  role: "OWNER" | "TENANT" | "VENDOR";
  business_name: string | null;
  service_categories: string[];
  is_public: boolean | null;
  street_address: string | null;
  city: string | null;
  province: string | null;
  postal_code: string | null;
  country: string | null;
}

export interface TeamMemberUpdateIn {
  full_name?: string;
  phone?: string;
  business_name?: string;
  service_categories?: string[];
  is_public?: boolean;
  street_address?: string;
  city?: string;
  province?: string;
  postal_code?: string;
  country?: string;
}

export const teamApi = {
  list: () => api.get<TeamMemberOut[]>("/team"),
  invite: (body: { full_name: string; email: string; role: string }) =>
    api.post<TeamMemberOut>("/team", body),
  update: (memberId: string, body: TeamMemberUpdateIn) =>
    api.patch<TeamMemberOut>(`/team/${memberId}`, body),
  remove: (memberId: string) => api.delete<void>(`/team/${memberId}`),
};

export interface UserOut {
  id: string;
  email: string;
  full_name: string;
  phone: string;
  org_id: string;
  org_name: string;
  org_slug: string;
  role: string;
}

export const profileApi = {
  me: () => api.get<UserOut>("/auth/me"),
  update: (body: { full_name?: string; phone?: string }) =>
    api.patch<UserOut>("/auth/me", body),
  updateOrg: (body: { name?: string; slug?: string }) => api.patch<UserOut>("/auth/org", body),
};

export interface OrganizationPublicOut {
  name: string;
  slug: string;
}

export const orgsApi = {
  bySlug: (slug: string) => api.get<OrganizationPublicOut>(`/auth/org-by-slug/${encodeURIComponent(slug)}`),
};

export type CampaignStatus = "DRAFT" | "PUBLISHED" | "ARCHIVED";

export interface CampaignOut {
  id: string;
  organization_id: string;
  unit_id: string | null;
  title: string;
  description: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  available_from: string | null;
  monthly_rent: number | null;
  security_deposit: number | null;
  lease_term: string | null;
  furnishing: string | null;
  smoking_policy: string | null;
  pets_policy: string | null;
  utilities_included: string[];
  parking_available: boolean | null;
  parking_details: {
    total_spaces?: number | null;
    types?: string[];
    tenant_options?: string[];
    garage_monthly_fee?: number | null;
    notes?: string | null;
  } | null;
  home_features: string[];
  neighborhood_features: string[];
  status: CampaignStatus;
  photos: string[];
  fb_post_id: string | null;
  fb_posted_at: string | null;
  created_at: string | null;
  unit_number: string | null;
  property_name: string | null;
  property_address: string | null;
}

export interface OrgFbSettingsOut {
  fb_page_id: string | null;
  fb_page_token_set: boolean;
}

export interface CampaignAIGenerateOut {
  title: string;
  description: string;
  suggested_rent: number | null;
}

export interface MarketingSiteOut {
  id: string;
  name: string;
  url: string;
}

export const campaignsApi = {
  list: () => api.get<CampaignOut[]>("/campaigns"),
  create: (body: object) => api.post<CampaignOut>("/campaigns", body),
  aiGenerate: (params: {
    unit_id?: string; extra_instructions?: string; monthly_rent?: number; available_from?: string;
    contact_name?: string; contact_phone?: string; contact_email?: string;
    existing_photo_filenames?: string[]; files?: File[];
  }) => {
    const token = typeof document !== "undefined"
      ? (document.cookie.match(/(?:^|; )token=([^;]*)/) || [])[1] : null;
    const headers: Record<string, string> = {};
    if (token) headers["Authorization"] = `Bearer ${decodeURIComponent(token)}`;
    const body = new FormData();
    const { existing_photo_filenames, files, ...fields } = params;
    Object.entries(fields).forEach(([k, v]) => { if (v !== undefined) body.append(k, String(v)); });
    if (existing_photo_filenames?.length) body.append("existing_photo_filenames", existing_photo_filenames.join(","));
    files?.forEach(f => body.append("files", f));
    return fetch(`${BASE_URL}/campaigns/ai-generate`, { method: "POST", headers, body })
      .then(async r => {
        if (!r.ok) { const e = await r.json().catch(() => ({ detail: r.statusText })); throw new Error(e.detail); }
        return r.json() as Promise<CampaignAIGenerateOut>;
      });
  },
  update: (id: string, body: object) => api.put<CampaignOut>(`/campaigns/${id}`, body),
  remove: (id: string) => api.delete<void>(`/campaigns/${id}`),
  publish: (id: string) => api.post<CampaignOut>(`/campaigns/${id}/publish`, {}),
  archive: (id: string) => api.post<CampaignOut>(`/campaigns/${id}/archive`, {}),
  uploadPhoto: (id: string, file: File) => {
    const token = typeof document !== "undefined"
      ? (document.cookie.match(/(?:^|; )token=([^;]*)/) || [])[1] : null;
    const headers: Record<string, string> = {};
    if (token) headers["Authorization"] = `Bearer ${decodeURIComponent(token)}`;
    const body = new FormData();
    body.append("file", file);
    return fetch(`${BASE_URL}/campaigns/${id}/photos`, { method: "POST", headers, body })
      .then(async r => {
        if (!r.ok) { const e = await r.json().catch(() => ({ detail: r.statusText })); throw new Error(e.detail); }
        return r.json() as Promise<CampaignOut>;
      });
  },
  deletePhoto: (id: string, filename: string) => api.delete<CampaignOut>(`/campaigns/${id}/photos/${encodeURIComponent(filename)}`),
  getFbSettings: () => api.get<OrgFbSettingsOut>("/campaigns/fb-settings"),
  saveFbSettings: (body: { fb_page_id?: string; fb_page_token?: string }) =>
    api.put<OrgFbSettingsOut>("/campaigns/fb-settings", body),
  listMarketingSites: () => api.get<MarketingSiteOut[]>("/campaigns/marketing-sites"),
  addMarketingSite: (body: { name: string; url: string }) =>
    api.post<MarketingSiteOut>("/campaigns/marketing-sites", body),
  updateMarketingSite: (id: string, body: { name: string; url: string }) =>
    api.put<MarketingSiteOut>(`/campaigns/marketing-sites/${id}`, body),
  removeMarketingSite: (id: string) => api.delete<void>(`/campaigns/marketing-sites/${id}`),
};
