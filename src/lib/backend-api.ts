const BACKEND_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/backend-api`;

export async function backendFetch(action: string, options: {
  method?: string;
  body?: any;
  params?: Record<string, string>;
  masterSecret?: string;
} = {}) {
  const { method = "GET", body, params, masterSecret } = options;
  
  let url = `${BACKEND_URL}/${action}`;
  if (params) {
    const searchParams = new URLSearchParams(params);
    url += `?${searchParams.toString()}`;
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
  };
  
  if (masterSecret) {
    headers["x-master-secret"] = masterSecret;
  }

  const resp = await fetch(url, {
    method,
    headers,
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  const data = await resp.json();
  if (!resp.ok) throw new Error(data.error || `API error ${resp.status}`);
  return data;
}
