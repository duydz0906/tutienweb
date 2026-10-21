export class ApiError extends Error {
  constructor(message: string, readonly status: number) { super(message); this.name = 'ApiError'; }
}

export async function api<T>(url: string, token?: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(url, {
    ...options,
    cache: 'no-store',
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  const data: unknown = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = data && typeof data === 'object' && 'error' in data && typeof data.error === 'string'
      ? data.error : `Lỗi kết nối (${response.status}).`;
    throw new ApiError(error, response.status);
  }
  return data as T;
}
