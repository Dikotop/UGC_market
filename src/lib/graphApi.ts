import { env } from "../config/env.js";
import type { GraphErrorBody, GraphPaging } from "../types/instagram.js";

const BASE_URL = `https://graph.facebook.com/${env.GRAPH_API_VERSION}`;

const RATE_LIMIT_CODES = new Set([4, 17, 32]);
const TOKEN_ERROR_CODE = 190;
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;

export class GraphApiError extends Error {
  code: number;
  subcode?: number;
  isTokenError: boolean;

  constructor(message: string, code: number, subcode?: number) {
    super(message);
    this.name = "GraphApiError";
    this.code = code;
    this.subcode = subcode;
    this.isTokenError = code === TOKEN_ERROR_CODE;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildUrl(pathOrUrl: string, params: Record<string, string | number | undefined>): string {
  const url = pathOrUrl.startsWith("http") ? new URL(pathOrUrl) : new URL(`${BASE_URL}${pathOrUrl}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }
  return url.toString();
}

/**
 * GET against the Graph API with exponential-backoff retry on rate-limit
 * errors (HTTP 429 or Graph error codes 4/17/32). Token errors (code 190)
 * are never retried - they need a fresh token, not a delay.
 */
export async function graphGet<T>(
  pathOrUrl: string,
  params: Record<string, string | number | undefined> = {},
): Promise<T> {
  const url = buildUrl(pathOrUrl, params);
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const res = await fetch(url);
    if (res.ok) {
      return (await res.json()) as T;
    }

    const body = (await res.json().catch(() => undefined)) as GraphErrorBody | undefined;
    const code = body?.error?.code ?? res.status;
    const subcode = body?.error?.error_subcode;
    const message = body?.error?.message ?? `HTTP ${res.status}`;
    const error = new GraphApiError(message, code, subcode);

    if (error.isTokenError) {
      throw error;
    }

    const isRateLimited = res.status === 429 || RATE_LIMIT_CODES.has(code);
    if (!isRateLimited || attempt === MAX_RETRIES) {
      throw error;
    }

    lastError = error;
    const delay = BASE_DELAY_MS * 2 ** attempt;
    console.warn(`Graph API rate-limited (code ${code}), retrying in ${delay}ms (attempt ${attempt + 1}/${MAX_RETRIES})`);
    await sleep(delay);
  }

  throw lastError ?? new Error("graphGet: exhausted retries without a response");
}

/** Follows `paging.next` links, yielding each page's `data` array in turn. */
export async function* graphGetPaginated<T>(
  pathOrUrl: string,
  params: Record<string, string | number | undefined> = {},
): AsyncGenerator<T[]> {
  let nextUrl: string | undefined = buildUrl(pathOrUrl, params);
  while (nextUrl) {
    const page: { data: T[]; paging?: GraphPaging } = await graphGet(nextUrl, {});
    yield page.data;
    nextUrl = page.paging?.next;
  }
}
