export interface AuthUser {
  id: string;
  email: string;
  full_name: string;
  org_id: string;
  org_name: string;
  org_slug: string;
  role: "OWNER" | "TENANT" | "VENDOR";
}

export function setToken(token: string) {
  document.cookie = `token=${encodeURIComponent(token)}; path=/; max-age=${60 * 60 * 24 * 7}; SameSite=Strict`;
}

export function clearToken() {
  document.cookie = "token=; path=/; max-age=0";
}

export function getToken(): string | null {
  const match = document.cookie.match(/(?:^|; )token=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : null;
}
