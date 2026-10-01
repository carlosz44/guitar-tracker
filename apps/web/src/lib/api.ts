import type { AppType } from "@ds/server";
import { queryOptions } from "@tanstack/react-query";
import { type ClientResponse, hc } from "hono/client";

export const api = hc<AppType>("/").api;

export class UnauthorizedError extends Error {
  override name = "UnauthorizedError";
}

export interface ApiErrorBody {
  error?: string;
  issues?: { path: (string | number)[]; message: string }[];
}

export class ApiError extends Error {
  override name = "ApiError";
  constructor(
    readonly status: number,
    readonly body: ApiErrorBody = {},
  ) {
    super(`API request failed with ${status}`);
  }

  get key() {
    return this.body.issues?.[0]?.message ?? this.body.error;
  }
}

export async function ensureOk<T extends ClientResponse<unknown, number, string>>(
  response: T,
): Promise<Ok<T>> {
  if (response.status === 401) throw new UnauthorizedError();
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as ApiErrorBody;
    throw new ApiError(response.status, body);
  }
  return response as Ok<T>;
}

type Ok<T> = [Extract<T, { ok: true }>] extends [never] ? T : Extract<T, { ok: true }>;

export const meQuery = queryOptions({
  queryKey: ["me"],
  queryFn: async () => (await ensureOk(await api.me.$get())).json(),
  staleTime: 60_000,
  retry: (failures, error) => !(error instanceof UnauthorizedError) && failures < 2,
});
