import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { models, type Report } from 'powerbi-client';
import { powerbiService } from './service';
import { PowerBIContext } from './PowerBIContext';
import { fetchEmbedConfig } from '../api/embed';
import { applyFilters, buildFiltersFromDataPoints, type FilterableEmbed } from './filterSync';
import type {
  EmbedConfigResponse,
  PowerBIContextValue,
  SelectedDataPoint,
  SyncEntry,
  SyncStrategy,
  WidgetStatus,
} from './types';

export interface PowerBIAnalyticsProviderProps {
  /** Friendly report key (from backend allowlist) OR raw ids below. */
  reportKey?: string;
  workspaceId?: string;
  reportId?: string;
  /** Report page to load (the "canvas" page). Falls back to report default. */
  pageName?: string;
  /** Which visuals the page is allowed to expose (sent to backend allowlist). */
  visualNames?: string[];
  /** See SyncStrategy. Defaults to 'separate-visuals' (separate widget blocks). */
  strategy?: SyncStrategy;
  /** Optional RLS request (must be enabled + allowed on the backend). */
  rls?: { username: string; roles: string[] };
  /** Refresh the embed token this many ms BEFORE it expires. */
  tokenRefreshLeadMs?: number;
  className?: string;
  children: React.ReactNode;
}

/**
 * Embeds ONE Power BI report and shares it with all child widgets so they keep a
 * single filter context. This is the heart of the solution: never embed each
 * visual as an isolated report instance.
 *
 *  - strategy 'shared-canvas': the master report (a single report page) is
 *    rendered VISIBLY as the dashboard canvas — native cross-filtering between
 *    its visuals is fully preserved. Lay out widgets inside the report page.
 *
 *  - strategy 'separate-visuals': the master report is kept hidden and acts as
 *    the shared context/source-of-truth; each <PowerBIVisual>/<PowerBISlicer>
 *    renders its own visual into its own card, and this provider synchronizes
 *    filters across them via the dataSelected event.
 */
export function PowerBIAnalyticsProvider({
  reportKey,
  workspaceId,
  reportId,
  pageName,
  visualNames,
  strategy = 'separate-visuals',
  rls,
  tokenRefreshLeadMs = 2 * 60 * 1000,
  className,
  children,
}: PowerBIAnalyticsProviderProps) {
  const [status, setStatus] = useState<WidgetStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [config, setConfig] = useState<EmbedConfigResponse | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const masterRef = useRef<HTMLDivElement | null>(null);
  const reportRef = useRef<Report | null>(null);
  const tokenRef = useRef<string | null>(null);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const registry = useRef<Map<string, SyncEntry>>(new Map());
  const tokenSubscribers = useRef<Set<(token: string) => void>>(new Set());

  const resolvedPage = pageName ?? config?.pageName ?? null;

  const getAccessToken = useCallback(() => tokenRef.current, []);

  const registerEmbed = useCallback((entry: SyncEntry) => {
    registry.current.set(entry.id, entry);
    return () => {
      registry.current.delete(entry.id);
    };
  }, []);

  const onTokenRefresh = useCallback((cb: (token: string) => void) => {
    tokenSubscribers.current.add(cb);
    return () => {
      tokenSubscribers.current.delete(cb);
    };
  }, []);

  /** Cross-filter approximation for 'separate-visuals': replay one selection on the others. */
  const broadcastSelection = useCallback((sourceId: string, dataPoints: SelectedDataPoint[]) => {
    const filters = buildFiltersFromDataPoints(dataPoints);
    for (const entry of registry.current.values()) {
      if (entry.id === sourceId || entry.isSlicer) continue;
      void applyFilters(entry.embed as unknown as FilterableEmbed, filters);
    }
  }, []);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  // ---- Fetch embed config + embed the master report once ----
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    setStatus('loading');
    setError(null);

    (async () => {
      try {
        const cfg = await fetchEmbedConfig({
          key: reportKey,
          workspaceId,
          reportId,
          pageName,
          visualNames,
          rls,
          signal: controller.signal,
        });
        if (cancelled) return;

        tokenRef.current = cfg.accessToken;
        setConfig(cfg);
        scheduleRefresh(cfg.expiration);

        const container = masterRef.current;
        if (!container) return;

        // Reset any prior embed in this container before re-embedding.
        powerbiService.reset(container);

        const embedConfig: models.IReportEmbedConfiguration = {
          type: 'report',
          id: cfg.reportId,
          embedUrl: cfg.embedUrl,
          accessToken: cfg.accessToken,
          tokenType: models.TokenType.Embed,
          permissions: models.Permissions.Read,
          viewMode: models.ViewMode.View,
          pageName: pageName ?? cfg.pageName ?? undefined,
          settings: {
            // Hide Power BI chrome so the report reads as a clean canvas.
            panes: {
              filters: { visible: false, expanded: false },
              pageNavigation: { visible: false },
            },
            bars: { statusBar: { visible: false } },
            background: models.BackgroundType.Transparent,
            // Honor the report's own page layout as the canvas.
            layoutType: models.LayoutType.Custom,
            customLayout: { displayOption: models.DisplayOption.FitToWidth },
          },
        };

        const embedded = powerbiService.embed(container, embedConfig) as Report;
        reportRef.current = embedded;

        embedded.off('loaded');
        embedded.off('rendered');
        embedded.off('error');

        embedded.on('loaded', () => {
          if (!cancelled) setReport(embedded);
        });
        embedded.on('rendered', () => {
          if (!cancelled) setStatus('rendered');
        });
        embedded.on('error', (event) => {
          if (cancelled) return;
          const detail = (event as unknown as { detail?: { message?: string } }).detail;
          setStatus('error');
          setError(detail?.message ?? 'Power BI failed to load the report.');
        });
      } catch (err) {
        if (cancelled || controller.signal.aborted) return;
        setStatus('error');
        setError(err instanceof Error ? err.message : 'Failed to load embed configuration.');
      }
    })();

    function scheduleRefresh(expiration: string) {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      const expiresAt = new Date(expiration).getTime();
      const delay = Math.max(10_000, expiresAt - Date.now() - tokenRefreshLeadMs);
      refreshTimer.current = setTimeout(refreshToken, delay);
    }

    async function refreshToken() {
      try {
        const cfg = await fetchEmbedConfig({
          key: reportKey,
          workspaceId,
          reportId,
          pageName,
          visualNames,
          rls,
        });
        if (cancelled) return;
        tokenRef.current = cfg.accessToken;
        setConfig(cfg);
        // Push the new token into the master report and every child embed.
        await reportRef.current?.setAccessToken(cfg.accessToken);
        tokenSubscribers.current.forEach((cb) => cb(cfg.accessToken));
        scheduleRefresh(cfg.expiration);
      } catch {
        // Retry shortly; token expiry would otherwise blank the visuals.
        if (refreshTimer.current) clearTimeout(refreshTimer.current);
        refreshTimer.current = setTimeout(refreshToken, 15_000);
      }
    }

    return () => {
      cancelled = true;
      controller.abort();
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      const container = masterRef.current;
      if (container) powerbiService.reset(container);
      reportRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportKey, workspaceId, reportId, pageName, strategy, reloadKey]);

  const value = useMemo<PowerBIContextValue>(
    () => ({
      status,
      error,
      report,
      config,
      strategy,
      pageName: resolvedPage,
      getAccessToken,
      registerEmbed,
      broadcastSelection,
      onTokenRefresh,
      reload,
    }),
    [status, error, report, config, strategy, resolvedPage, getAccessToken, registerEmbed, broadcastSelection, onTokenRefresh, reload],
  );

  return (
    <PowerBIContext.Provider value={value}>
      {/*
        The master report.
         - shared-canvas: visible — this IS the dashboard (native cross-filter).
         - separate-visuals: hidden — it is the shared context behind the cards.
      */}
      <div
        className={strategy === 'shared-canvas' ? `pbi-canvas ${className ?? ''}` : 'pbi-master-hidden'}
        ref={masterRef}
        aria-hidden={strategy === 'separate-visuals'}
      />
      {children}
    </PowerBIContext.Provider>
  );
}
