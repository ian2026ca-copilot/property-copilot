export interface AuthUser {
  id: string;
  email: string;
  full_name: string;
  phone: string;
  org_id: string;
  org_name: string;
  org_slug: string;
  role: "OWNER" | "TENANT" | "VENDOR";
  screening_criminal_record_enabled?: boolean;
  screening_rental_history_enabled?: boolean;
  reference_reply_email?: string | null;
  impersonated?: boolean;
}

/** Token is now an HttpOnly cookie set by the server — JS cannot read or write it. */
export function setToken(_token: string) {
  // No-op: backend sets the HttpOnly cookie via Set-Cookie header on login/register.
}

export function clearToken() {
  // No-op: backend clears the cookie via /auth/logout. Use AuthContext.logout() instead.
}

export function getToken(): string | null {
  // No-op: token is HttpOnly and not readable by JS. Returns null so legacy guards still pass.
  return "cookie";  // truthy sentinel so "if (!token)" guards don't redirect before /auth/me runs
}
