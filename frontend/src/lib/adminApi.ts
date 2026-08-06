import { AdminUser, getAdminToken } from "./adminAuth";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getAdminToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init.headers as Record<string, string>),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${BASE_URL}${path}`, { ...init, headers });
  if (!res.ok) {
    if (res.status === 401 && typeof window !== "undefined" && !window.location.pathname.startsWith("/admin/login")) {
      window.location.href = "/admin/login";
      return undefined as T;
    }
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail ?? "Request failed");
  }
  if (res.status === 204 || res.headers.get("content-length") === "0") return undefined as T;
  return res.json();
}

const adminRequest = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body: body !== undefined ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PATCH", body: body !== undefined ? JSON.stringify(body) : undefined }),
};

export interface OwnerRowOut {
  organization_id: string;
  organization_name: string;
  owner_email: string | null;
  owner_name: string | null;
  subscription_status: string | null;
  trial_ends_at: string | null;
  cancel_at_period_end: boolean;
  billing_exempt: boolean;
  is_suspended: boolean;
  property_count: number;
  tenant_count: number;
}

export interface OwnerPropertyOut {
  id: string;
  name: string;
  address: string;
  city: string;
  state: string;
  unit_count: number;
}

export interface OwnerTeamMemberOut {
  user_id: string;
  name: string;
  email: string;
  role: string;
}

export interface OwnerPaymentOut {
  id: string;
  tenant_name: string | null;
  amount: number;
  due_date: string;
  paid_date: string | null;
  status: string;
  payment_type: string;
}

export interface OwnerDetailOut {
  organization_id: string;
  organization_name: string;
  organization_slug: string;
  created_at: string;
  owner_name: string | null;
  owner_email: string | null;
  owner_phone: string | null;
  subscription_status: string | null;
  trial_ends_at: string | null;
  cancel_at_period_end: boolean;
  billing_exempt: boolean;
  is_suspended: boolean;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  property_count: number;
  tenant_count: number;
  vendor_count: number;
  properties: OwnerPropertyOut[];
  team: OwnerTeamMemberOut[];
  payments_collected_total: number;
  payments_overdue_total: number;
  payments_pending_total: number;
  payments_overdue_count: number;
  recent_payments: OwnerPaymentOut[];
}

export type AIProvider = "openai" | "deepseek" | "gemini" | "grok";

export interface AISettingsOut {
  openai_key_set: boolean;
  deepseek_key_set: boolean;
  gemini_key_set: boolean;
  grok_key_set: boolean;
  active_provider: AIProvider;
}

export interface AISettingsIn {
  openai_api_key?: string;
  deepseek_api_key?: string;
  gemini_api_key?: string;
  grok_api_key?: string;
  active_provider?: AIProvider;
}

export const adminAuthApi = {
  login: (email: string, password: string) =>
    adminRequest.post<{ access_token: string; token_type: string }>("/admin/login", { email, password }),
  me: () => adminRequest.get<AdminUser>("/admin/me"),
};

export const adminApi = {
  listOwners: () => adminRequest.get<OwnerRowOut[]>("/admin/owners"),
  getOwnerDetail: (orgId: string) => adminRequest.get<OwnerDetailOut>(`/admin/owners/${orgId}`),
  suspend: (orgId: string) => adminRequest.post<void>(`/admin/owners/${orgId}/suspend`),
  reactivate: (orgId: string) => adminRequest.post<void>(`/admin/owners/${orgId}/reactivate`),
  comp: (orgId: string) => adminRequest.post<void>(`/admin/owners/${orgId}/comp`),
  uncomp: (orgId: string) => adminRequest.post<void>(`/admin/owners/${orgId}/uncomp`),
  refund: (orgId: string) => adminRequest.post<{ refunded: boolean; refund_id: string }>(`/admin/owners/${orgId}/refund`),
  listAdmins: () => adminRequest.get<AdminUser[]>("/admin/admins"),
  createAdmin: (email: string, full_name: string, password: string) =>
    adminRequest.post<AdminUser>("/admin/admins", { email, full_name, password }),
  impersonate: (orgId: string) =>
    adminRequest.post<{ access_token: string; token_type: string; owner_name: string | null }>(`/admin/owners/${orgId}/impersonate`),
  getAiSettings: () => adminRequest.get<AISettingsOut>("/admin/ai-settings"),
  updateAiSettings: (body: AISettingsIn) => adminRequest.patch<AISettingsOut>("/admin/ai-settings", body),
};
