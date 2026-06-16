import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';

const DATA_DIR = process.env.DASHBOARD_CONFIG_DIR ?? path.join(__dirname, '..', 'data', 'configs');

// Lazy init — only create the directory when it is first needed, not at import time.
let dirEnsured = false;
function ensureDir() {
  if (dirEnsured) return;
  mkdirSync(DATA_DIR, { recursive: true });
  dirEnsured = true;
}

export const widgetConfigSchema = z.object({
  id: z.string().min(1),
  type: z.enum(['visual', 'slicer']),
  visualName: z.string().min(1),
  pageName: z.string().min(1),
  title: z.string(),
  colSpan: z.number().int().min(1).max(12).default(1),
  rowSpan: z.number().int().min(1).default(1),
  order: z.number().int().min(0),
});

// A single button inside a filter control. Applies a Basic filter on the
// control's table/column when toggled on.
export const filterButtonSchema = z.object({
  label: z.string().min(1),
  operator: z.enum(['In', 'NotIn']).default('In'),
  // Accept strings/numbers/booleans — Power BI Basic filters allow all three.
  values: z.array(z.union([z.string(), z.number(), z.boolean()])).default([]),
});

// A configurable "custom slicer": a row of buttons that each apply a Basic
// filter (In/NotIn) on a chosen table[column] to every value visual at once.
export const filterControlSchema = z.object({
  id: z.string().min(1),
  title: z.string().default(''),
  table: z.string().min(1),
  column: z.string().min(1),
  // Allow clearing the active button by clicking it again (toggle behaviour).
  allowToggleOff: z.boolean().default(true),
  buttons: z.array(filterButtonSchema).default([]),
});

export const dashboardConfigSchema = z.object({
  reportKey: z.string().min(1),
  gridColumns: z.number().int().min(1).max(12).default(3),
  widgets: z.array(widgetConfigSchema).default([]),
  filterControls: z.array(filterControlSchema).default([]),
  updatedAt: z.string().optional(),
});

export type WidgetConfig = z.infer<typeof widgetConfigSchema>;
export type DashboardConfig = z.infer<typeof dashboardConfigSchema>;

function safePath(key: string): string {
  const safeKey = key.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 100);
  return path.join(DATA_DIR, `${safeKey}.json`);
}

export function getConfig(key: string): DashboardConfig | null {
  ensureDir();
  const filePath = safePath(key);
  if (!existsSync(filePath)) return null;
  try {
    const raw = readFileSync(filePath, 'utf8');
    return dashboardConfigSchema.parse(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function saveConfig(key: string, cfg: Omit<DashboardConfig, 'updatedAt'>): DashboardConfig {
  ensureDir();
  const filePath = safePath(key);
  const full: DashboardConfig = { ...cfg, reportKey: key, updatedAt: new Date().toISOString() };
  dashboardConfigSchema.parse(full);
  writeFileSync(filePath, JSON.stringify(full, null, 2), 'utf8');
  return full;
}
