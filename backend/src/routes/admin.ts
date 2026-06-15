import { Router, type RequestHandler } from 'express';
import { AllowlistError } from '../allowlist';
import { config } from '../config';
import { getConfig, saveConfig, dashboardConfigSchema } from '../config-store';

export const adminRouter = Router();

const asyncHandler =
  (fn: RequestHandler): RequestHandler =>
  (req, res, next) =>
    Promise.resolve(fn(req, res, next)).catch(next);

/** GET /api/admin/configs/:key — fetch dashboard config for a report */
adminRouter.get(
  '/configs/:key',
  asyncHandler(async (req, res) => {
    const { key } = req.params;
    const cfg = getConfig(key);
    res.json(cfg ?? { reportKey: key, gridColumns: 3, widgets: [] });
  }),
);

/** PUT /api/admin/configs/:key — save dashboard config for a report */
adminRouter.put(
  '/configs/:key',
  asyncHandler(async (req, res) => {
    const { key } = req.params;

    const report = config.allowlist.reports.find((r) => (r.key ?? r.reportId) === key);
    if (!report) throw new AllowlistError('Report not found in allowlist.');

    const body = dashboardConfigSchema.parse({ ...req.body, reportKey: key });
    const saved = saveConfig(key, body);
    res.json(saved);
  }),
);
