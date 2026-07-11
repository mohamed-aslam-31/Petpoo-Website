/**
 * Demo-mode auth helpers.
 *
 * There is no real server-side auth yet — roles are stored in localStorage.
 * "admin" role = email address contains "admin" at login time.
 * A proper auth system (users table, sessions, JWT) is tracked as a follow-up task.
 */

interface AuthData {
  role: "admin" | "user";
  email: string;
}

export function getAuthData(): AuthData | null {
  const raw = localStorage.getItem("shopflow_auth");
  if (!raw) return null;
  // Legacy format: "true" (before role tracking was added)
  if (raw === "true") return { role: "user", email: "" };
  try {
    const parsed = JSON.parse(raw) as AuthData;
    if (parsed && parsed.role) return parsed;
    return { role: "user", email: "" };
  } catch {
    return null;
  }
}

export function isAuthenticated(): boolean {
  return getAuthData() !== null;
}

/** Returns true if the current session has the "admin" role */
export function isAdmin(): boolean {
  return getAuthData()?.role === "admin";
}

/** Persist a login session; role is derived from email. */
export function setAuthData(email: string): void {
  const role: "admin" | "user" = email.toLowerCase().includes("admin") ? "admin" : "user";
  localStorage.setItem("shopflow_auth", JSON.stringify({ role, email }));
}

export function clearAuthData(): void {
  localStorage.removeItem("shopflow_auth");
}
