import { useCallback, useRef, useState } from 'react';
import { models } from 'powerbi-client';
import type { Report } from 'powerbi-client';
import { powerbiService } from './service';
import { fetchEmbedConfig } from '../api/embed';
import type { PageWithVisuals } from '../types/dashboard';

/**
 * Discovers pages and visuals by briefly embedding the full report and calling
 * report.getPages() → page.getVisuals() via the Power BI JS SDK.
 *
 * This is the only supported approach for non-admin service principals —
 * the REST API /pages/{name}/visuals endpoint requires tenant-admin permissions.
 */
export function useReportDiscover(reportKey: string) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [discovering, setDiscovering] = useState(false);
  const [pages, setPages] = useState<PageWithVisuals[]>([]);
  const [error, setError] = useState<string | null>(null);

  const discover = useCallback(async () => {
    const container = containerRef.current;
    if (!container) return;

    setDiscovering(true);
    setError(null);

    try {
      const cfg = await fetchEmbedConfig({ key: reportKey });

      powerbiService.reset(container);

      const report = powerbiService.embed(container, {
        type: 'report',
        id: cfg.reportId,
        embedUrl: cfg.embedUrl,
        accessToken: cfg.accessToken,
        tokenType: models.TokenType.Embed,
        permissions: models.Permissions.Read,
        viewMode: models.ViewMode.View,
        settings: {
          panes: { filters: { visible: false }, pageNavigation: { visible: false } },
          background: models.BackgroundType.Transparent,
        },
      } as models.IReportEmbedConfiguration) as Report;

      // Wait for render (up to 30 s)
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => {
          report.off('rendered');
          report.off('error');
          reject(new Error('Тайм-аут: отчёт не загрузился за 30 секунд'));
        }, 30_000);

        report.on('rendered', () => {
          clearTimeout(timer);
          report.off('rendered');
          report.off('error');
          resolve();
        });

        report.on('error', (event) => {
          clearTimeout(timer);
          report.off('rendered');
          report.off('error');
          const detail = (event as unknown as { detail?: { message?: string } }).detail;
          reject(new Error(detail?.message ?? 'Ошибка загрузки отчёта'));
        });
      });

      const reportPages = await report.getPages();

      const result: PageWithVisuals[] = await Promise.all(
        reportPages.map(async (page, idx) => {
          const visuals = await page.getVisuals();
          return {
            name: page.name,
            displayName: page.displayName,
            order: idx,
            visuals: visuals.map((v) => ({
              name: v.name,
              title: v.title,
              type: v.type,
              layout: v.layout
                ? {
                    x: v.layout.x ?? 0,
                    y: v.layout.y ?? 0,
                    width: v.layout.width ?? 0,
                    height: v.layout.height ?? 0,
                  }
                : undefined,
            })),
          };
        }),
      );

      setPages(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка обнаружения визуалов');
    } finally {
      setDiscovering(false);
      if (containerRef.current) {
        try { powerbiService.reset(containerRef.current); } catch { /* already reset */ }
      }
    }
  }, [reportKey]);

  return { containerRef, discover, discovering, pages, error };
}
