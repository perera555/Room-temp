export const AUTH_COOKIE = "rt_auth";

/** Token stored in the cookie: SHA-256 of the password (never the password itself). */
export async function authToken(password: string) {
  const data = new TextEncoder().encode(`room-temp:${password}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

export function passwordEnabled() {
  return Boolean(process.env.DASHBOARD_PASSWORD);
}
