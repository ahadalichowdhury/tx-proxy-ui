import { getDataApiBaseUrl, getDataApiSecret } from "@/lib/data-api/config";

type DataFetchOptions = RequestInit & {
  auth?: boolean;
};

export async function dataFetch<T>(
  path: string,
  options: DataFetchOptions = {},
): Promise<T> {
  const { auth = false, headers: initHeaders, ...init } = options;
  const headers = new Headers(initHeaders);

  if (!headers.has("Content-Type") && init.body) {
    headers.set("Content-Type", "application/json");
  }

  if (auth) {
    const secret = getDataApiSecret();
    if (secret) {
      headers.set("Authorization", `Bearer ${secret}`);
    }
  }

  const response = await fetch(`${getDataApiBaseUrl()}${path}`, {
    ...init,
    headers,
  });

  if (!response.ok) {
    let message = `Data API request failed (${response.status})`;
    try {
      const payload = (await response.json()) as { error?: string };
      if (payload.error) {
        message = payload.error;
      }
    } catch {
      // Ignore invalid error bodies.
    }
    throw new Error(message);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}
