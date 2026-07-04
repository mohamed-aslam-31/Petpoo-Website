/**
 * Dwolla API client — manages authentication and provides helpers for
 * creating customers and fetching Balance funding source amounts.
 *
 * Requires environment variables:
 *   DWOLLA_CLIENT_ID      — your Dwolla application key
 *   DWOLLA_CLIENT_SECRET  — your Dwolla application secret
 *   DWOLLA_ENV            — "sandbox" (default) or "production"
 */

const DWOLLA_CLIENT_ID = process.env["DWOLLA_CLIENT_ID"] ?? "";
const DWOLLA_CLIENT_SECRET = process.env["DWOLLA_CLIENT_SECRET"] ?? "";
const DWOLLA_ENV = process.env["DWOLLA_ENV"] ?? "sandbox";

const BASE_URL =
  DWOLLA_ENV === "production"
    ? "https://api.dwolla.com"
    : "https://api-sandbox.dwolla.com";

let cachedToken: { token: string; expiresAt: number } | null = null;

/** Returns true when both credentials are present in the environment. */
export function isDwollaConfigured(): boolean {
  return Boolean(DWOLLA_CLIENT_ID && DWOLLA_CLIENT_SECRET);
}

/** Obtains (or returns a cached) OAuth app token from Dwolla. */
async function getAppToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt) {
    return cachedToken.token;
  }

  const credentials = Buffer.from(
    `${DWOLLA_CLIENT_ID}:${DWOLLA_CLIENT_SECRET}`,
  ).toString("base64");

  const resp = await fetch(`${BASE_URL}/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  if (!resp.ok) {
    throw new Error(
      `Dwolla authentication failed: ${resp.status} ${await resp.text()}`,
    );
  }

  const data = (await resp.json()) as {
    access_token: string;
    expires_in: number;
  };
  // Subtract 60 s as a safety buffer before expiry
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in - 60) * 1000,
  };
  return cachedToken.token;
}

async function dwollaGet(path: string): Promise<unknown> {
  const token = await getAppToken();
  const resp = await fetch(`${BASE_URL}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.dwolla.v1.hal+json",
    },
  });
  if (!resp.ok) {
    throw new Error(
      `Dwolla GET ${path} failed: ${resp.status} ${await resp.text()}`,
    );
  }
  return resp.json();
}

async function dwollaPost(
  path: string,
  body: object,
): Promise<{ location: string }> {
  const token = await getAppToken();
  const resp = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/vnd.dwolla.v1.hal+json",
      Accept: "application/vnd.dwolla.v1.hal+json",
    },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    throw new Error(
      `Dwolla POST ${path} failed: ${resp.status} ${await resp.text()}`,
    );
  }
  const location = resp.headers.get("Location") ?? "";
  return { location };
}

/**
 * Creates a Dwolla "receive-only" customer and returns their Dwolla Customer ID.
 * Uses the first word of `name` as firstName, the rest as lastName.
 */
export async function createDwollaCustomer(params: {
  name: string;
  email: string;
}): Promise<string> {
  const parts = params.name.trim().split(/\s+/);
  const firstName = parts[0] ?? params.name;
  const lastName = parts.slice(1).join(" ") || firstName;

  const { location } = await dwollaPost("/customers", {
    firstName,
    lastName,
    email: params.email,
    type: "receive-only",
  });

  const dwollaCustomerId = location.split("/").pop();
  if (!dwollaCustomerId) {
    throw new Error(
      "Failed to extract Dwolla customer ID from Location header",
    );
  }
  return dwollaCustomerId;
}

/**
 * Returns the available Balance amount for a Dwolla customer, or null if
 * no Balance funding source exists yet.
 */
export async function getCustomerDwollaBalance(
  dwollaCustomerId: string,
): Promise<{ value: string; currency: string } | null> {
  const sourcesResp = (await dwollaGet(
    `/customers/${dwollaCustomerId}/funding-sources`,
  )) as { _embedded?: { "funding-sources"?: { id: string; type: string }[] } };

  const sources = sourcesResp._embedded?.["funding-sources"] ?? [];
  const balanceSource = sources.find((s) => s.type === "balance");
  if (!balanceSource) return null;

  const balanceResp = (await dwollaGet(
    `/funding-sources/${balanceSource.id}/balance`,
  )) as { balance?: { value: string; currency: string } };

  return balanceResp.balance ?? null;
}
