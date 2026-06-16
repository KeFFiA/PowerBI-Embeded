import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import type { models } from 'powerbi-client';
import { fetchEmbedConfig } from '../api/embed';
import { PowerBIContext, type EmbedRegistration, type PowerBIContextValue } from './PowerBIContext';

const TOKEN_REFRESH_LEAD_MS = 2 * 60 * 1000;

interface EmbedConfig {
  accessToken: string;
  embedUrl: string;
  reportId: string;
  expiration: string;
}

interface Props {
  reportKey: string;
  children: ReactNode;
}

export function PowerBIAnalyticsProvider({ reportKey, children }: Props) {
  const [config, setConfig] = useState<EmbedConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const embedsRef = useRef<Map<string, EmbedRegistration>>(new Map());
  // Each source (a visual's selection, a slicer's state, or a custom
  // filter-control button) contributes a slice of filters. The union of all
  // active sources is applied to every value visual.
  const sourcesRef = useRef<Map<string, models.IFilter[]>>(new Map());
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;

    const scheduleRefresh = (expiration: string) => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
      const delay = Math.max(10_000, new Date(expiration).getTime() - Date.now() - TOKEN_REFRESH_LEAD_MS);
      refreshTimerRef.current = setTimeout(doRefresh, delay);
    };

    const doRefresh = async () => {
      try {
        const cfg = await fetchEmbedConfig({ key: reportKey });
        if (cancelled) return;
        // Update token on all registered embeds in-place (no flash)
        for (const reg of embedsRef.current.values()) {
          try {
            await (reg.embed as unknown as { setAccessToken: (t: string) => Promise<void> }).setAccessToken(cfg.accessToken);
          } catch {
            // embed may have already been unmounted
          }
        }
        scheduleRefresh(cfg.expiration);
      } catch {
        if (!cancelled) {
          refreshTimerRef.current = setTimeout(doRefresh, 15_000);
        }
      }
    };

    fetchEmbedConfig({ key: reportKey })
      .then((cfg) => {
        if (cancelled) return;
        setConfig(cfg);
        scheduleRefresh(cfg.expiration);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load embed config');
      });

    return () => {
      cancelled = true;
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    };
  }, [reportKey]);

  // Re-apply the merged filter set to every value visual. A visual is never
  // filtered by its own contribution (so selecting a bar highlights it rather
  // than emptying its own chart); slicers are never filter targets.
  const applyMergedFilters = useCallback(() => {
    for (const [id, reg] of embedsRef.current) {
      if (reg.type === 'slicer') continue;

      // Power BI rejects two filters on the same target at a given level, so we
      // dedupe by target — the most recently published source wins (publish
      // re-inserts at the end of the Map). Without this, a slicer + a bar click
      // on the same column would make the whole setFilters call reject.
      const bySignature = new Map<string, models.IFilter>();
      for (const [sourceId, filters] of sourcesRef.current) {
        if (sourceId === id) continue;
        for (const f of filters) {
          const t = (f as unknown as { target?: Record<string, unknown> }).target ?? {};
          const sig = JSON.stringify([t.table, t.column, t.hierarchy, t.hierarchyLevel, t.measure]);
          bySignature.set(sig, f);
        }
      }
      const merged = Array.from(bySignature.values());

      try {
        const result = (reg.embed as unknown as { setFilters: (f: unknown[]) => Promise<void> }).setFilters(merged);
        if (result && typeof (result as Promise<void>).catch === 'function') {
          (result as Promise<void>).catch((err) => {
            if (import.meta.env.DEV || (typeof localStorage !== 'undefined' && localStorage.getItem('pbiFilterDebug') === '1')) {
              // eslint-disable-next-line no-console
              console.info('[filterSync] setFilters rejected', { target: id, merged, err });
            }
          });
        }
      } catch {
        // embed may have been unmounted
      }
    }
  }, []);

  const registerEmbed = useCallback(
    (reg: EmbedRegistration) => {
      embedsRef.current.set(reg.id, reg);
      // A newly mounted visual must pick up filters already active from other
      // sources (e.g. a custom filter button toggled before it rendered).
      applyMergedFilters();
    },
    [applyMergedFilters],
  );

  const unregisterEmbed = useCallback((id: string) => {
    embedsRef.current.delete(id);
    sourcesRef.current.delete(id);
  }, []);

  const publishFilters = useCallback(
    (sourceId: string, filters: models.IFilter[]) => {
      // Delete-then-set so an updated source moves to the end of the Map; the
      // dedupe in applyMergedFilters lets the most recent source win per target.
      sourcesRef.current.delete(sourceId);
      if (filters && filters.length > 0) {
        sourcesRef.current.set(sourceId, filters);
      }
      applyMergedFilters();
    },
    [applyMergedFilters],
  );

  if (error) {
    return (
      <div className="pbi-provider-error">
        <span>⚠ {error}</span>
      </div>
    );
  }

  if (!config) {
    return (
      <div className="pbi-provider-loading">
        <div className="pbi-spinner" />
        <span>Загрузка токена…</span>
      </div>
    );
  }

  const value: PowerBIContextValue = {
    accessToken: config.accessToken,
    embedUrl: config.embedUrl,
    reportId: config.reportId,
    registerEmbed,
    unregisterEmbed,
    publishFilters,
    reapplyFilters: applyMergedFilters,
  };

  return <PowerBIContext.Provider value={value}>{children}</PowerBIContext.Provider>;
}
