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

  const registerEmbed = useCallback((reg: EmbedRegistration) => {
    embedsRef.current.set(reg.id, reg);
  }, []);

  const unregisterEmbed = useCallback((id: string) => {
    embedsRef.current.delete(id);
  }, []);

  const broadcastSelection = useCallback((sourceId: string, filters: models.IBasicFilter[]) => {
    for (const [id, reg] of embedsRef.current) {
      if (id === sourceId) continue;
      if (reg.type === 'slicer') continue;
      try {
        void (reg.embed as unknown as { setFilters: (f: unknown[]) => void }).setFilters(filters);
      } catch {
        // embed may have been unmounted
      }
    }
  }, []);

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
    broadcastSelection,
  };

  return <PowerBIContext.Provider value={value}>{children}</PowerBIContext.Provider>;
}
