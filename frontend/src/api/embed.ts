import type { EmbedConfigResponse } from '../powerbi/types';

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '/api';

export interface FetchEmbedConfigArgs {
  /** Friendly report key from the backend allowlist, OR raw ids below. */
  key?: string;
  workspaceId?: string;
  reportId?: string;
  pageName?: string;
  visualNames?: string[];
  /** Optional RLS request (must be enabled + allowed server-side). */
  rls?: { username: string; roles: string[] };
  signal?: AbortSignal;
}

/**
 * Asks the backend for a safe embed configuration. The browser never sees the
 * Azure client secret or the AAD token — only a short-lived embed token.
 */
export async function fetchEmbedConfig(args: FetchEmbedConfigArgs): Promise<EmbedConfigResponse> {
  const { signal, ...body } = args;
  const res = await fetch(`${API_BASE}/embed/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok) {
    let message = `Embed config request failed (${res.status})`;
    try {
      const err = await res.json();
      if (err?.message) message = err.message;
    } catch {
      /* ignore parse errors */
    }
    throw new Error(message);
  }

  return (await res.json()) as EmbedConfigResponse;
}
