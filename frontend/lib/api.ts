const API_BASE = "/api/v1";

/** Error thrown for every non-2xx backend response or network failure. */
export class ApiError extends Error {
  code: string;
  status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
  }
}

type Envelope<T> = {
  data: T | null;
  error: { code: string; message: string } | null;
};

const NETWORK_CODE = "NETWORK_ERROR";

function friendly(status: number, code: string): string {
  const map: Record<string, string> = {
    DOCUMENT_NOT_FOUND: "This document no longer exists.",
    DOCUMENT_BUSY: "The document is busy; try again in a moment.",
    PROCESSING_CAPACITY: "The server is at capacity; try again shortly.",
    HF_NOT_CONFIGURED:
      "AI processing is not configured on the server (missing HF_TOKEN).",
    HF_UNAVAILABLE: "The AI service is temporarily unavailable; retry later.",
    FILE_TOO_LARGE: "This file exceeds the server upload limit.",
    UNSUPPORTED_FILE_TYPE: "This file type is not supported.",
    INVALID_METADATA: "Some document details are invalid.",
    EMBEDDING_CONFIG_MISMATCH: "The server index configuration needs attention.",
    DATABASE_UNAVAILABLE: "The database is unreachable; retry later.",
  };
  if (map[code]) return map[code];
  return status >= 500
    ? "The server hit an unexpected error; retry later."
    : "The request could not be completed.";
}

async function parseError(response: Response): Promise<ApiError> {
  let code = "HTTP_ERROR";
  let message = "";
  try {
    const body = (await response.json()) as Envelope<unknown>;
    if (body.error) {
      code = body.error.code;
      message = body.error.message;
    }
  } catch {
    // Non-JSON error body; fall through to the generic message.
  }
  return new ApiError(code, message || friendly(response.status, code), response.status);
}

async function request<T>(
  path: string,
  init: RequestInit & { signal?: AbortSignal } = {},
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      cache: "no-store",
      ...init,
      headers: init.body
        ? { "Content-Type": "application/json", ...init.headers }
        : init.headers,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new ApiError(NETWORK_CODE, "Cannot reach the OKF server.", 0);
  }
  if (!response.ok) throw await parseError(response);
  const body = (await response.json()) as Envelope<T>;
  if (body.error) {
    throw new ApiError(body.error.code, body.error.message, response.status);
  }
  return body.data as T;
}

export const api = {
  get: <T>(path: string, signal?: AbortSignal) =>
    request<T>(path, { signal }),

  post: <T>(path: string, body?: unknown, signal?: AbortSignal) =>
    request<T>(path, {
      method: "POST",
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    }),

  patch: <T>(path: string, body: unknown, signal?: AbortSignal) =>
    request<T>(path, { method: "PATCH", body: JSON.stringify(body), signal }),

  delete: <T>(path: string, signal?: AbortSignal) =>
    request<T>(path, { method: "DELETE", signal }),

  /** Multipart upload with byte-level progress; resolves with the created document. */
  upload<T>(
    path: string,
    file: File,
    fields: Record<string, string>,
    onProgress: (percent: number) => void,
    signal?: AbortSignal,
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const form = new FormData();
      form.append("file", file);
      for (const [key, value] of Object.entries(fields)) form.append(key, value);
      const xhr = new XMLHttpRequest();
      xhr.open("POST", `${API_BASE}${path}`);
      xhr.responseType = "json";
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          onProgress(Math.round((event.loaded / event.total) * 100));
        }
      };
      xhr.onload = () => {
        const body = xhr.response as Envelope<T> | null;
        if (xhr.status >= 200 && xhr.status < 300 && body?.data) {
          onProgress(100);
          resolve(body.data);
        } else {
          const error = body?.error;
          reject(
            new ApiError(
              error?.code ?? "HTTP_ERROR",
              error?.message ?? friendly(xhr.status, error?.code ?? ""),
              xhr.status,
            ),
          );
        }
      };
      xhr.onerror = () =>
        reject(new ApiError(NETWORK_CODE, "Cannot reach the OKF server.", 0));
      xhr.onabort = () =>
        reject(new DOMException("Upload aborted", "AbortError"));
      signal?.addEventListener("abort", () => xhr.abort());
      xhr.send(form);
    });
  },

  /** Fetch a binary endpoint (e.g. the OKF zip bundle) as a Blob. */
  async download(path: string): Promise<Blob> {
    let response: Response;
    try {
      response = await fetch(`${API_BASE}${path}`, { cache: "no-store" });
    } catch {
      throw new ApiError(NETWORK_CODE, "Cannot reach the OKF server.", 0);
    }
    if (!response.ok) throw await parseError(response);
    return response.blob();
  },
};

/** Trigger a client-side file save for a downloaded Blob. */
export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
