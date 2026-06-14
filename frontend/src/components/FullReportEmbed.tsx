import { useCallback, useEffect, useRef, useState } from 'react';
import { models, type Report } from 'powerbi-client';
import { powerbiService } from '../powerbi/service';
import { fetchEmbedConfig } from '../api/embed';

interface FullReportEmbedProps {
  reportKey: string;
}

export function FullReportEmbed({ reportKey }: FullReportEmbedProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const reportRef = useRef<Report | null>(null);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [status, setStatus] = useState<'loading' | 'rendered' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const retry = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    setStatus('loading');
    setError(null);

    function scheduleRefresh(expiration: string) {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
      const delay = Math.max(10_000, new Date(expiration).getTime() - Date.now() - 2 * 60 * 1000);
      refreshTimerRef.current = setTimeout(doRefresh, delay);
    }

    async function doRefresh() {
      try {
        const cfg = await fetchEmbedConfig({ key: reportKey });
        if (cancelled) return;
        await reportRef.current?.setAccessToken(cfg.accessToken);
        scheduleRefresh(cfg.expiration);
      } catch {
        if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = setTimeout(doRefresh, 15_000);
      }
    }

    void (async () => {
      try {
        const cfg = await fetchEmbedConfig({ key: reportKey, signal: controller.signal });
        if (cancelled) return;

        const container = containerRef.current;
        if (!container) return;

        powerbiService.reset(container);

        const embedConfig: models.IReportEmbedConfiguration = {
          type: 'report',
          id: cfg.reportId,
          embedUrl: cfg.embedUrl,
          accessToken: cfg.accessToken,
          tokenType: models.TokenType.Embed,
          permissions: models.Permissions.Read,
          viewMode: models.ViewMode.View,
          settings: {
            panes: {
              filters: { visible: true, expanded: false },
              pageNavigation: { visible: true },
            },
            bars: { statusBar: { visible: true } },
            background: models.BackgroundType.Default,
          },
        };

        const embedded = powerbiService.embed(container, embedConfig) as Report;
        reportRef.current = embedded;

        embedded.on('rendered', () => {
          if (!cancelled) setStatus('rendered');
        });
        embedded.on('error', (event) => {
          if (cancelled) return;
          const detail = (event as unknown as { detail?: { message?: string } }).detail;
          setStatus('error');
          setError(detail?.message ?? 'Power BI не смог загрузить отчёт.');
        });

        scheduleRefresh(cfg.expiration);
      } catch (err) {
        if (cancelled || controller.signal.aborted) return;
        setStatus('error');
        setError(err instanceof Error ? err.message : 'Не удалось загрузить конфигурацию.');
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
      const container = containerRef.current;
      if (container) powerbiService.reset(container);
      reportRef.current = null;
    };
  }, [reportKey, reloadKey]);

  return (
    <div className="full-report-wrapper">
      {status === 'loading' && (
        <div className="full-report-overlay">
          <div className="pbi-spinner" />
          <span>Загрузка отчёта…</span>
        </div>
      )}
      {status === 'error' && (
        <div className="full-report-overlay full-report-overlay--error">
          <span className="full-report-error-title">Ошибка загрузки</span>
          <span className="full-report-error-msg">{error}</span>
          <button className="pbi-card__retry" onClick={retry} type="button">
            Повторить
          </button>
        </div>
      )}
      <div ref={containerRef} className="full-report-embed" />
    </div>
  );
}
