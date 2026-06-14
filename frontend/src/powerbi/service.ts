import { service, factories } from 'powerbi-client';

/**
 * A single Power BI service instance for the whole app. The service manages all
 * embeds; we create exactly one and reuse it everywhere.
 */
export const powerbiService = new service.Service(
  factories.hpmFactory,
  factories.wpmpFactory,
  factories.routerFactory,
);
