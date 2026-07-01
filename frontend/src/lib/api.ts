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
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail ?? "Request failed");
  }
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

export interface UnitOut {
  id: string;
  property_id: string;
  unit_number: string;
  bedrooms: number;
  bathrooms: number;
  square_feet: number | null;
  monthly_rent: number;
  status: string;
  property_name?: string | null;
  tenant_name?: string | null;
  tenant_user_id?: string | null;
  tenant_avatar_url?: string | null;
  lease_id?: string | null;
  lease_start?: string | null;
  lease_end?: string | null;
  outstanding_balance?: number;
}

export interface TenantDocumentOut {
  id: string;
  doc_type: "id_document" | "reference_letter";
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
  notes: string | null;
  tenant: TenantOut | null;
  unit_number: string | null;
  property_name: string | null;
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
  notes: string | null;
  tenant_name: string | null;
  tenant_avatar_url: string | null;
  unit_number: string | null;
  property_name: string | null;
}

export interface MaintenanceAttachmentOut {
  id: string;
  filename: string;
  original_name: string;
  url: string;
}

export type MaintenanceStatus = "SUBMITTED" | "UNDER_REVIEW" | "SCHEDULED" | "IN_PROGRESS" | "COMPLETED" | "CLOSED" | "CANCELLED";
export type MaintenancePriority = "LOW" | "MEDIUM" | "HIGH" | "EMERGENCY";

export interface MaintenanceOut {
  id: string;
  unit_id: string;
  title: string;
  description: string;
  category: string;
  priority: MaintenancePriority;
  status: MaintenanceStatus;
  assignee_name: string | null;
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
  resolution_notes: string | null;
  attachments: MaintenanceAttachmentOut[];
}

export interface VendorOut {
  id: string;
  user_id: string;
  business_name: string;
  service_categories: string[];
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

export interface UnitDetailOut {
  id: string;
  unit_number: string;
  property_id: string;
  property_name: string;
  property_address: string;
  status: string;
  monthly_rent: number;
  bedrooms: number;
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

export const leasesApi = {
  list: () => api.get<LeaseOut[]>("/leases"),
  create: (body: object) => api.post<LeaseOut>("/leases", body),
  get: (id: string) => api.get<LeaseOut>(`/leases/${id}`),
  update: (id: string, body: object) => api.put<LeaseOut>(`/leases/${id}`, body),
  terminate: (id: string) => api.delete<void>(`/leases/${id}`),
  renew: (id: string, body: { start_date: string; end_date: string; monthly_rent?: number; lease_type?: string }) =>
    api.post<LeaseOut>(`/leases/${id}/renew`, body),
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
};

export const paymentsApi = {
  list: () => api.get<PaymentOut[]>("/payments"),
  create: (body: object) => api.post<PaymentOut>("/payments", body),
  update: (id: string, body: object) => api.patch<PaymentOut>(`/payments/${id}`, body),
  void: (id: string) => api.delete<void>(`/payments/${id}`),
};

export const maintenanceApi = {
  list: () => api.get<MaintenanceOut[]>("/maintenance"),
  listAssigned: () => api.get<MaintenanceOut[]>("/maintenance/assigned/me"),
  get: (id: string) => api.get<MaintenanceOut>(`/maintenance/${id}`),
  create: (body: object) => api.post<MaintenanceOut>("/maintenance", body),
  update: (id: string, body: object) => api.patch<MaintenanceOut>(`/maintenance/${id}`, body),
  review: (id: string, body: object) => api.put<MaintenanceOut>(`/maintenance/${id}/review`, body),
  schedule: (id: string, body: object) => api.put<MaintenanceOut>(`/maintenance/${id}/schedule`, body),
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
};

export const vendorsApi = {
  list: () => api.get<VendorOut[]>("/vendors"),
  create: (body: object) => api.post<VendorOut>("/vendors", body),
  update: (id: string, body: object) => api.put<VendorOut>(`/vendors/${id}`, body),
  remove: (id: string) => api.delete<void>(`/vendors/${id}`),
  me: () => api.get<VendorOut>("/vendors/me/profile"),
  listAvailability: (vendorId: string) => api.get<VendorAvailabilityOut[]>(`/vendors/${vendorId}/availability`),
  addAvailability: (vendorId: string, body: object) => api.post<VendorAvailabilityOut>(`/vendors/${vendorId}/availability`, body),
  deleteAvailability: (vendorId: string, slotId: string) => api.delete<void>(`/vendors/${vendorId}/availability/${slotId}`),
};

export interface TeamMemberOut {
  member_id: string;
  user_id: string;
  full_name: string;
  email: string;
  phone: string;
  role: "OWNER" | "MANAGER" | "AGENT" | "TENANT" | "VENDOR";
}

export const teamApi = {
  list: () => api.get<TeamMemberOut[]>("/team"),
  invite: (body: { full_name: string; email: string; role: string }) =>
    api.post<TeamMemberOut>("/team", body),
  updateRole: (memberId: string, role: string) =>
    api.put<TeamMemberOut>(`/team/${memberId}`, { role }),
  remove: (memberId: string) => api.delete<void>(`/team/${memberId}`),
};

export interface UserOut {
  id: string;
  email: string;
  full_name: string;
  phone: string;
  org_id: string;
  org_name: string;
  role: string;
}

export const profileApi = {
  me: () => api.get<UserOut>("/auth/me"),
  update: (body: { full_name?: string; phone?: string }) =>
    api.patch<UserOut>("/auth/me", body),
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

export const campaignsApi = {
  list: () => api.get<CampaignOut[]>("/campaigns"),
  create: (body: object) => api.post<CampaignOut>("/campaigns", body),
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
};
