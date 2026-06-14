const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '/api';

export interface EmbedConfigResponse {
  reportId: string;
  reportName: string;
  embedUrl: string;
  datasetId: string;
  pageName: string | null;
  tokenType: 'Embed';
  accessToken: string;
  tokenId: string;
  expiration: string;
}

export interface ReportSummary {
  key: string;
  name: string;
  pages: string[];
  visuals: string[];
  rlsEnabled: boolean;
}

export async function fetchReports(): Promise<ReportSummary[]> {
  const res = await fetch(`${API_BASE}/embed/reports`);
  if (!res.ok) throw new Error(`Failed to fetch reports (${res.status})`);
  const data = (await res.json()) as { reports: ReportSummary[] };
  return data.reports;
}

export async function fetchEmbedConfig(args: {
  key?: string;
  workspaceId?: string;
  reportId?: string;
  pageName?: string;
  visualNames?: string[];
  rls?: { username: string; roles: string[] };
  signal?: AbortSignal;
}): Promise<EmbedConfigResponse> {
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
      const err = (await res.json()) as { message?: string };
      if (err?.message) message = err.message;
    } catch {
      /* ignore */
    }
    throw new Error(message);
  }

  return (await res.json()) as EmbedConfigResponse;
}
