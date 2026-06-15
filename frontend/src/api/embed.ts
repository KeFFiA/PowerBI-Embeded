import type { DashboardConfig, DiscoverResult } from '../types/dashboard';

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

export async function discoverReportVisuals(key: string): Promise<DiscoverResult> {
  const res = await fetch(`${API_BASE}/embed/reports/${encodeURIComponent(key)}/discover`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { message?: string };
    throw new Error(err?.message ?? `Discovery failed (${res.status})`);
  }
  return (await res.json()) as DiscoverResult;
}

export async function fetchDashboardConfig(key: string): Promise<DashboardConfig> {
  const res = await fetch(`${API_BASE}/admin/configs/${encodeURIComponent(key)}`);
  if (!res.ok) throw new Error(`Failed to fetch dashboard config (${res.status})`);
  return (await res.json()) as DashboardConfig;
}

export async function saveDashboardConfig(key: string, cfg: DashboardConfig): Promise<DashboardConfig> {
  const res = await fetch(`${API_BASE}/admin/configs/${encodeURIComponent(key)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cfg),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { message?: string };
    throw new Error(err?.message ?? `Failed to save config (${res.status})`);
  }
  return (await res.json()) as DashboardConfig;
}
