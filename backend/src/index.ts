import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { pinoHttp } from 'pino-http';
import { config } from './config';
import { logger } from './logger';
import { embedRouter } from './routes/embed';
import { adminRouter } from './routes/admin';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';

const app = express();

// Behind a reverse proxy (nginx/ingress) we trust X-Forwarded-* for rate limiting.
app.set('trust proxy', 1);

app.use(helmet());
app.use(pinoHttp({ logger }));
app.use(express.json({ limit: '64kb' }));

// CORS: explicit allowlist of origins. No wildcard with credentials.
app.use(
  cors({
    origin(origin, cb) {
      // Allow same-origin / server-to-server (no Origin header) and listed origins.
      if (!origin || config.corsOrigins.includes(origin)) return cb(null, true);
      return cb(new Error(`Origin not allowed by CORS: ${origin}`));
    },
    methods: ['GET', 'POST'],
    maxAge: 600,
  }),
);

app.use(
  rateLimit({
    windowMs: config.env.RATE_LIMIT_WINDOW_MS,
    max: config.env.RATE_LIMIT_MAX,
    standardHeaders: true,
    legacyHeaders: false,
  }),
);

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

app.use('/api/embed', embedRouter);
app.use('/api/admin', adminRouter);

app.use(notFoundHandler);
app.use(errorHandler);

const server = app.listen(config.env.PORT, () => {
  logger.info(
    {
      port: config.env.PORT,
      env: config.env.NODE_ENV,
      devMode: config.isDevMode,
      reports: config.allowlist.reports.length,
    },
    config.isDevMode ? 'Power BI embed backend started [DEV MODE]' : 'Power BI embed backend started',
  );
});

// Graceful shutdown for clean container stops.
const shutdown = (signal: string) => {
  logger.info({ signal }, 'Shutting down');
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000).unref();
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
