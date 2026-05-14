const TENANT_ID     = (process.env.PBI_TENANT_ID    ?? "").trim();
const CLIENT_ID     = (process.env.PBI_CLIENT_ID    ?? "").trim();
const CLIENT_SECRET = (process.env.PBI_CLIENT_SECRET ?? "").trim();
const WORKSPACE_ID  = (process.env.PBI_WORKSPACE_ID ?? "").trim();
const DATASET_ID    = (process.env.PBI_DATASET_ID   ?? "").trim();

let cachedToken: string | null = null;
let tokenExpiry = 0;

export async function getToken(): Promise<string> {
  if (cachedToken && Date.now() < tokenExpiry) return cachedToken;
  const res = await fetch(
    `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        scope: "https://analysis.windows.net/powerbi/api/.default",
      }),
    },
  );
  const data = (await res.json()) as { access_token: string; expires_in: number };
  if (!data.access_token) throw new Error("Failed to obtain PBI token");
  cachedToken = data.access_token;
  tokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
  return cachedToken;
}

export async function dax(query: string): Promise<any[]> {
  const token = await getToken();
  const res = await fetch(
    `https://api.powerbi.com/v1.0/myorg/groups/${WORKSPACE_ID}/datasets/${DATASET_ID}/executeQueries`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ queries: [{ query }], serializerSettings: { includeNulls: true } }),
    },
  );
  const data = (await res.json()) as any;
  if (data.error) throw new Error(data.error.message ?? JSON.stringify(data.error));
  return data.results?.[0]?.tables?.[0]?.rows ?? [];
}
