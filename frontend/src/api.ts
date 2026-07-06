import type { ApiResponse, ReturnedUserDocument, ServerMeta, UserOptions } from "./types";

const BASE_URL: string = import.meta.env.VITE_API_BASE_URL ?? "";

export class ApiKeyError extends Error {}

function authHeaders(apiKey: string): HeadersInit {
  return {
    Authorization: `Bearer ${apiKey}`,
  };
}

async function parseJson<T>(res: Response): Promise<ApiResponse<T>> {
  // The worker always returns JSON, including on 4xx/5xx, so we parse
  // regardless of res.ok and let callers branch on `success`.
  return (await res.json()) as ApiResponse<T>;
}

export async function getUser(apiKey: string): Promise<ReturnedUserDocument> {
  const res = await fetch(`${BASE_URL}/api/getUser`, {
    method: "GET",
    headers: authHeaders(apiKey),
  });
  const body = await parseJson<{ user: ReturnedUserDocument }>(res);
  if (!body.success) {
    throw new ApiKeyError(extractMessage(body.error) ?? "Api key is invalid.");
  }
  return body.user;
}

export async function updateUser(apiKey: string, options: UserOptions): Promise<void> {
  const res = await fetch(`${BASE_URL}/api/updateUser`, {
    method: "POST",
    headers: {
      ...authHeaders(apiKey),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(options),
  });
  const body = await parseJson<Record<string, never>>(res);
  if (!body.success) {
    throw new ApiKeyError(extractMessage(body.error) ?? "Could not save options.");
  }
}

export async function getMeta(): Promise<ServerMeta> {
  const res = await fetch(`${BASE_URL}/apimeta/`, { method: "GET" });
  const body = await res.json();
  return body;
}

function extractMessage(error: unknown): string | undefined {
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string") return message;
  }
  return undefined;
}
