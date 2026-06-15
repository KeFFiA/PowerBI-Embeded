import { config, type AllowedReport } from './config';
import { logger } from './logger';

const API = config.env.POWERBI_API_BASE.replace(/\/$/, '');

export class PowerBiApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = 'PowerBiApiError';
  }
}

async function pbiFetch<T>(path: string, accessToken: string, init?: RequestInit): Promise<T> {
  const url = `${API}/v1.0/myorg${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });

  const text = await res.text();
  const body = text ? safeJson(text) : undefined;

  if (!res.ok) {
    // Surface the Power BI request id to make support tickets traceable.
    const requestId = res.headers.get('requestid') ?? res.headers.get('x-ms-request-id') ?? undefined;
    logger.warn({ status: res.status, path, requestId, body }, 'Power BI REST call failed');
    throw new PowerBiApiError(res.status, `Power BI API error (${res.status}) for ${path}`, body);
  }

  return body as T;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export interface ReportInfo {
  id: string;
  name: string;
  embedUrl: string;
  datasetId: string;
}

/** GET the report metadata (embed URL, dataset id) for a report in a workspace. */
export async function getReport(report: AllowedReport, accessToken: string): Promise<ReportInfo> {
  const data = await pbiFetch<{ id: string; name: string; embedUrl: string; datasetId: string }>(
    `/groups/${report.workspaceId}/reports/${report.reportId}`,
    accessToken,
  );
  return { id: data.id, name: data.name, embedUrl: data.embedUrl, datasetId: data.datasetId };
}

export interface EffectiveIdentity {
  username: string;
  roles: string[];
  /** Dataset ids the identity applies to. Defaults to the report's dataset. */
  datasets?: string[];
}

export interface EmbedToken {
  token: string;
  tokenId: string;
  expiration: string; // ISO 8601
}

/**
 * Generates a short-lived embed token for a single report.
 *
 * Supports Row-Level Security via `identities` (effective identity). When RLS
 * is used, the access level still comes from server config — the browser cannot
 * escalate it.
 */
export interface PageInfo {
  name: string;
  displayName: string;
  order: number;
}

export interface VisualInfo {
  name: string;
  title: string;
  type: string;
  layout?: { x: number; y: number; width: number; height: number };
}

export async function getReportPages(report: AllowedReport, accessToken: string): Promise<PageInfo[]> {
  const data = await pbiFetch<{ value: Array<{ name: string; displayName: string; order: number }> }>(
    `/groups/${report.workspaceId}/reports/${report.reportId}/pages`,
    accessToken,
  );
  return data.value.slice().sort((a, b) => a.order - b.order);
}

export async function getPageVisuals(
  report: AllowedReport,
  pageName: string,
  accessToken: string,
): Promise<VisualInfo[]> {
  const data = await pbiFetch<{
    value: Array<{
      name: string;
      title: string;
      type: string;
      layout?: { x: number; y: number; width: number; height: number };
    }>;
  }>(
    `/groups/${report.workspaceId}/reports/${report.reportId}/pages/${encodeURIComponent(pageName)}/visuals`,
    accessToken,
  );
  return data.value;
}

export async function generateReportEmbedToken(args: {
  report: AllowedReport;
  datasetId: string;
  accessToken: string;
  identities?: EffectiveIdentity[];
}): Promise<EmbedToken> {
  const { report, datasetId, accessToken, identities } = args;

  const body: Record<string, unknown> = {
    accessLevel: config.env.EMBED_ACCESS_LEVEL,
  };

  if (identities && identities.length > 0) {
    body.identities = identities.map((i) => ({
      username: i.username,
      roles: i.roles,
      datasets: i.datasets && i.datasets.length > 0 ? i.datasets : [datasetId],
    }));
  }

  return pbiFetch<EmbedToken>(
    `/groups/${report.workspaceId}/reports/${report.reportId}/GenerateToken`,
    accessToken,
    { method: 'POST', body: JSON.stringify(body) },
  );
}
