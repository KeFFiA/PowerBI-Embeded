import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import { resolveAllowedReport, AllowlistError } from '../allowlist';
import { getPowerBiAccessToken } from '../auth';
import { getReport, generateReportEmbedToken, type EffectiveIdentity } from '../powerbi';
import { config } from '../config';
import { logger } from '../logger';

export const embedRouter = Router();

/** Wrap async handlers so thrown/rejected errors reach the error middleware. */
const asyncHandler =
  (fn: RequestHandler): RequestHandler =>
  (req, res, next) =>
    Promise.resolve(fn(req, res, next)).catch(next);

/**
 * GET /api/embed/reports
 * Returns the *non-sensitive* catalog of embeddable reports so the frontend can
 * offer a picker without hard-coding GUIDs. No tokens, no secrets.
 */
embedRouter.get('/reports', (_req, res) => {
  res.json({
    reports: config.allowlist.reports.map((r) => ({
      key: r.key ?? r.reportId,
      name: r.name ?? r.key ?? r.reportId,
      pages: r.pages,
      visuals: r.visuals,
      rlsEnabled: r.rls.enabled,
    })),
  });
});

const tokenRequestSchema = z
  .object({
    // Identify the report either by friendly key OR by raw ids.
    key: z.string().optional(),
    workspaceId: z.string().optional(),
    reportId: z.string().optional(),
    pageName: z.string().optional(),
    visualNames: z.array(z.string()).optional(),
    // Optional Row-Level Security request. SEE SECURITY NOTE below.
    rls: z
      .object({
        username: z.string().min(1),
        roles: z.array(z.string()).min(1),
      })
      .optional(),
  })
  .refine((v) => Boolean(v.key) || (Boolean(v.workspaceId) && Boolean(v.reportId)), {
    message: 'Provide either "key" or both "workspaceId" and "reportId".',
  });

/**
 * POST /api/embed/token
 * The only endpoint the browser needs. It returns a safe embed configuration:
 * { reportId, embedUrl, accessToken (embed token), tokenType, expiration, datasetId, pageName }.
 *
 * SECURITY NOTE on RLS:
 *   In this scaffold the RLS identity arrives in the request body for clarity.
 *   In production you MUST derive the effective identity from a server-trusted
 *   source (validated session / signed JWT / your IdP), NEVER from values the
 *   browser can set freely — otherwise a user could impersonate any identity.
 *   The allowlist still constrains which roles may be requested.
 */
embedRouter.post(
  '/token',
  asyncHandler(async (req, res) => {
    const input = tokenRequestSchema.parse(req.body);

    const report = resolveAllowedReport({
      key: input.key,
      workspaceId: input.workspaceId,
      reportId: input.reportId,
      pageName: input.pageName,
      visualNames: input.visualNames,
    });

    // Build effective identity only if RLS is both requested and allowed.
    let identities: EffectiveIdentity[] | undefined;
    if (input.rls) {
      if (!report.rls.enabled) {
        throw new AllowlistError('RLS is not enabled for this report.');
      }
      const disallowed = input.rls.roles.filter((r) => !report.rls.roles.includes(r));
      if (report.rls.roles.length > 0 && disallowed.length > 0) {
        throw new AllowlistError(`RLS role(s) not allowed: ${disallowed.join(', ')}`);
      }
      identities = [{ username: input.rls.username, roles: input.rls.roles }];
    }

    const aadToken = await getPowerBiAccessToken();
    const reportInfo = await getReport(report, aadToken);
    const datasetId = report.datasetId ?? reportInfo.datasetId;

    const embed = await generateReportEmbedToken({
      report,
      datasetId,
      accessToken: aadToken,
      identities,
    });

    logger.debug({ reportId: report.reportId, rls: Boolean(identities) }, 'Issued embed token');

    res.json({
      reportId: reportInfo.id,
      reportName: reportInfo.name,
      embedUrl: reportInfo.embedUrl,
      datasetId,
      pageName: input.pageName ?? null,
      tokenType: 'Embed',
      accessToken: embed.token,
      tokenId: embed.tokenId,
      // ISO timestamp; the frontend schedules a refresh before this moment.
      expiration: embed.expiration,
    });
  }),
);
