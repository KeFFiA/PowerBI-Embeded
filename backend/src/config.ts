import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { z } from 'zod';

/**
 * Allowlist schema.
 *
 * A request from the frontend may ONLY embed a (workspace, report) pair that
 * appears here. Optionally you can also pin down which pages / visuals are
 * allowed. An empty (or omitted) `pages` / `visuals` array means "all pages /
 * visuals of this report are allowed".
 *
 * This is the single source of truth for "what is a client allowed to ask for".
 * Never trust report/workspace/page/visual identifiers coming from the browser
 * without checking them against this allowlist.
 */
const rlsSchema = z.object({
  enabled: z.boolean().default(false),
  // Roles that the backend is permitted to request for this report's dataset.
  roles: z.array(z.string()).default([]),
});

const allowedReportSchema = z.object({
  // Friendly key the frontend uses instead of raw GUIDs (optional but recommended).
  key: z.string().optional(),
  // Display name shown on the home page cards.
  name: z.string().optional(),
  workspaceId: z.string().min(1),
  reportId: z.string().min(1),
  datasetId: z.string().optional(),
  pages: z.array(z.string()).default([]),
  visuals: z.array(z.string()).default([]),
  rls: rlsSchema.default({ enabled: false, roles: [] }),
});

const allowlistSchema = z.object({
  reports: z.array(allowedReportSchema).min(1),
});

export type AllowedReport = z.infer<typeof allowedReportSchema>;
export type Allowlist = z.infer<typeof allowlistSchema>;

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  LOG_LEVEL: z.string().optional(),

  // Microsoft Entra ID (service principal / app registration).
  AAD_TENANT_ID: z.string().min(1, 'AAD_TENANT_ID is required'),
  AAD_CLIENT_ID: z.string().min(1, 'AAD_CLIENT_ID is required'),
  AAD_CLIENT_SECRET: z.string().min(1, 'AAD_CLIENT_SECRET is required'),

  // Endpoints (overridable for sovereign clouds, e.g. US Gov / China).
  AAD_AUTHORITY_HOST: z.string().url().default('https://login.microsoftonline.com'),
  POWERBI_API_BASE: z.string().url().default('https://api.powerbi.com'),
  POWERBI_SCOPE: z.string().default('https://analysis.windows.net/powerbi/api/.default'),

  // CORS: comma-separated list of allowed origins, e.g. "http://localhost:5173,https://app.example.com".
  CORS_ALLOWED_ORIGINS: z.string().default('http://localhost:5173'),

  // Embed token lifetime hint surfaced to the client (Power BI decides the real value).
  EMBED_ACCESS_LEVEL: z.enum(['View', 'Edit', 'Create']).default('View'),

  // Allowlist source: provide EITHER inline JSON OR a file path.
  EMBED_ALLOWLIST: z.string().optional(),
  EMBED_ALLOWLIST_FILE: z.string().optional(),

  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(60),
});

function loadAllowlist(env: z.infer<typeof envSchema>): Allowlist {
  let raw: string | undefined;

  if (env.EMBED_ALLOWLIST_FILE) {
    raw = readFileSync(env.EMBED_ALLOWLIST_FILE, 'utf8');
  } else if (env.EMBED_ALLOWLIST) {
    raw = env.EMBED_ALLOWLIST;
  }

  if (!raw) {
    throw new Error(
      'No embed allowlist configured. Set EMBED_ALLOWLIST (inline JSON) or EMBED_ALLOWLIST_FILE (path).',
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`EMBED_ALLOWLIST is not valid JSON: ${(err as Error).message}`);
  }

  return allowlistSchema.parse(parsed);
}

function loadConfig() {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  const env = parsed.data;
  const allowlist = loadAllowlist(env);

  return {
    env,
    allowlist,
    corsOrigins: env.CORS_ALLOWED_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean),
    isProd: env.NODE_ENV === 'production',
  };
}

export const config = loadConfig();
export type AppConfig = typeof config;
