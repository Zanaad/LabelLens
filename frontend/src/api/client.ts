/** Minimal JSON client. Session cookie is httpOnly; the browser sends it automatically. */

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
  ) {
    super(code);
  }
}

const KNOWN_CODES = new Set([
  "invalid_credentials",
  "email_taken",
  "password_too_short",
  "consent_required",
  "invitation_invalid",
  "too_many_requests",
  "forbidden",
  "not_authenticated",
]);

/** Map an error to an i18n key suffix (error.<code>). */
export function errorCode(err: unknown): string {
  if (err instanceof ApiError) {
    if (KNOWN_CODES.has(err.code)) return err.code;
    if (err.status === 429) return "too_many_requests";
    if (err.status === 0) return "network";
  }
  return "generic";
}

export async function api<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, headers, ...rest } = init;
  let res: Response;
  try {
    res = await fetch(path, {
      credentials: "same-origin",
      ...rest,
      headers: { ...(json !== undefined ? { "Content-Type": "application/json" } : {}), ...headers },
      body: json !== undefined ? JSON.stringify(json) : rest.body,
    });
  } catch {
    throw new ApiError(0, "network");
  }
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const detail = data && typeof data.detail === "string" ? data.detail : `http_${res.status}`;
    throw new ApiError(res.status, detail);
  }
  return data as T;
}
