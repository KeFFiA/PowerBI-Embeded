import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import { AllowlistError } from '../allowlist';
import { AadAuthError } from '../auth';
import { PowerBiApiError } from '../powerbi';
import { logger } from '../logger';
import { config } from '../config';

export const notFoundHandler: RequestHandler = (_req, res) => {
  res.status(404).json({ error: 'not_found', message: 'Route not found.' });
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof ZodError) {
    res.status(400).json({
      error: 'invalid_request',
      message: 'Request validation failed.',
      issues: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    });
    return;
  }

  if (err instanceof AllowlistError) {
    res.status(err.status).json({ error: 'forbidden', message: err.message });
    return;
  }

  if (err instanceof AadAuthError) {
    res.status(err.status).json({ error: 'aad_auth_failed', message: err.message });
    return;
  }

  if (err instanceof PowerBiApiError) {
    // 401/403 from Power BI usually means the service principal lacks workspace
    // access or the "Service principals can use Power BI APIs" tenant setting is off.
    const status = err.status === 401 || err.status === 403 ? 502 : 502;
    res.status(status).json({
      error: 'powerbi_error',
      message: err.message,
      // Only leak Power BI error details outside production to aid debugging.
      details: config.isProd ? undefined : err.details,
    });
    return;
  }

  logger.error({ err }, 'Unhandled error');
  res.status(500).json({
    error: 'internal_error',
    message: config.isProd ? 'Internal server error.' : (err as Error).message,
  });
};
