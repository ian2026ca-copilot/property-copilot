export interface AdminUser {
  id: string;
  email: string;
  full_name: string;
}

export function setAdminToken(token: string) {
  document.cookie = `admin_token=${encodeURIComponent(token)}; path=/; max-age=${60 * 60 * 24 * 7}; SameSite=Strict`;
}

export function clearAdminToken() {
  document.cookie = "admin_token=; path=/; max-age=0";
}

export function getAdminToken(): string | null {
  const match = document.cookie.match(/(?:^|; )admin_token=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : null;
}
