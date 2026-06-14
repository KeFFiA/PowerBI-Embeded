import { config, type AllowedReport } from './config';

export class AllowlistError extends Error {
  status = 403;
  constructor(message: string) {
    super(message);
    this.name = 'AllowlistError';
  }
}

/**
 * Resolve and validate an embed request against the configured allowlist.
 *
 * The frontend may identify a report by its friendly `key` OR by raw
 * (workspaceId, reportId). Either way, the pair must exist in the allowlist.
 * Page and visual names, when supplied, are validated too (unless the report
 * allows all pages/visuals via an empty list).
 *
 * Returns the trusted, server-side definition of the report — the frontend's
 * values are never used directly for the Power BI REST calls.
 */
export function resolveAllowedReport(input: {
  key?: string;
  workspaceId?: string;
  reportId?: string;
  pageName?: string;
  visualNames?: string[];
}): AllowedReport {
  const match = config.allowlist.reports.find((r) => {
    if (input.key && r.key) return r.key === input.key;
    return r.workspaceId === input.workspaceId && r.reportId === input.reportId;
  });

  if (!match) {
    throw new AllowlistError('Requested report/workspace is not allowed.');
  }

  if (input.pageName && match.pages.length > 0 && !match.pages.includes(input.pageName)) {
    throw new AllowlistError(`Page "${input.pageName}" is not allowed for this report.`);
  }

  if (input.visualNames && match.visuals.length > 0) {
    const forbidden = input.visualNames.filter((v) => !match.visuals.includes(v));
    if (forbidden.length > 0) {
      throw new AllowlistError(`Visual(s) not allowed for this report: ${forbidden.join(', ')}`);
    }
  }

  return match;
}
