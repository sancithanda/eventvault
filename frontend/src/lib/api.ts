
const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:5000/api/v1";

export type ApiError = Error & {
  status?: number;
  fields?: Record<string, string>;
};

type ApiErrorResponse = {
  message?: string;
  errors?: Array<{
    field?: string;
    message?: string;
  }>;
};

export async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
  token?: string,
): Promise<T> {
  const headers = new Headers(options.headers);

  headers.set("Accept", "application/json");

  if (options.body) {
    headers.set("Content-Type", "application/json");
  }

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  let response: Response;

  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers,
      cache: "no-store",
    });
  } catch {
    const error = new Error(
      "Cannot connect to EventVault's API. Check that the backend is running.",
    ) as ApiError;

    throw error;
  }

  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const data: ApiErrorResponse =
      typeof payload === "object" && payload !== null
        ? (payload as ApiErrorResponse)
        : {};

    const fields: Record<string, string> = {};

    for (const item of data.errors ?? []) {
      if (item.field && item.message) {
        fields[item.field] = item.message;
      }
    }

    const error = new Error(
      data.message ?? `Request failed (${response.status}).`,
    ) as ApiError;

    error.status = response.status;
    error.fields = fields;

    throw error;
  }

  return payload as T;
}