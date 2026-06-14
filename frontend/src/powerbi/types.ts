import type { models } from 'powerbi-client';

/** Shape returned by POST /api/embed/token on the backend. */
export interface EmbedConfigResponse {
  reportId: string;
  reportName: string;
  embedUrl: string;
  datasetId: string;
  pageName: string | null;
  tokenType: 'Embed';
  accessToken: string;
  tokenId: string;
  expiration: string; // ISO 8601
}

export type WidgetStatus = 'idle' | 'loading' | 'rendered' | 'error';

/**
 * Sync strategy for the analytics page.
 *
 *  - 'shared-canvas': embed ONE report page in a single iframe. Native Power BI
 *    cross-filtering / cross-highlighting between visuals is fully preserved
 *    because every visual lives in the same report instance. Widgets are
 *    arranged inside the report's own page layout. RECOMMENDED.
 *
 *  - 'separate-visuals': embed each visual/slicer as its own `type:'visual'`
 *    embed in its own DOM container. This gives truly independent widget blocks,
 *    but native cross-highlighting does NOT propagate between separate embeds,
 *    so the provider runs a filter-sync coordinator to approximate it. Use only
 *    when you must place visuals in arbitrary, non-adjacent page regions.
 */
export type SyncStrategy = 'shared-canvas' | 'separate-visuals';

export interface VisualRef {
  /** Power BI visual name (the stable internal name, NOT the display title). */
  visualName: string;
  /** Optional page name override; defaults to the provider's page. */
  pageName?: string;
}

/** A registered embed participating in filter synchronization. */
export interface SyncEntry {
  id: string;
  embed: import('powerbi-client').Embed;
  visualName: string;
  /** Slicers drive filters but should not receive cross-filter selections. */
  isSlicer: boolean;
}

export interface PowerBIContextValue {
  status: WidgetStatus;
  error: string | null;
  /** The single shared report instance (null until loaded). */
  report: import('powerbi-client').Report | null;
  config: EmbedConfigResponse | null;
  strategy: SyncStrategy;
  pageName: string | null;
  /** Always-fresh access token (updated on refresh). */
  getAccessToken: () => string | null;
  /** Register a separate-visual embed for filter sync. Returns an unregister fn. */
  registerEmbed: (entry: SyncEntry) => () => void;
  /** Propagate a selection from one embed to the others (separate-visuals mode). */
  broadcastSelection: (sourceId: string, dataPoints: SelectedDataPoint[]) => void;
  /** Subscribe to token refreshes; callback receives the new token. */
  onTokenRefresh: (cb: (token: string) => void) => () => void;
  /** Force a full re-fetch of the embed config + token. */
  reload: () => void;
}

/** Subset of the dataSelected event payload we rely on. */
export interface SelectedDataPoint {
  identity?: Array<{
    target: models.IFilterTarget;
    equals?: string | number | boolean;
  }>;
}
