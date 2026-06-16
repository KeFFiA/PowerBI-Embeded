import { useEffect, useRef, useState } from 'react';
import { models } from 'powerbi-client';
import type { Embed } from 'powerbi-client';
import { powerbiService } from './service';
import { usePowerBI } from './PowerBIContext';
import { buildFiltersFromDataPoints, normalizeSlicerFilters } from './filterSync';
import type { WidgetConfig } from '../types/dashboard';

type VisualStatus = 'loading' | 'rendered' | 'error';

const filterDebug = () =>
  import.meta.env.DEV || (typeof localStorage !== 'undefined' && localStorage.getItem('pbiFilterDebug') === '1');

export function useVisualEmbed(widget: Pick<WidgetConfig, 'id' | 'pageName' | 'visualName' | 'type'>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<VisualStatus>('loading');
  const [error, setError] = useState<string | null>(null);

  const { accessToken, embedUrl, reportId, registerEmbed, unregisterEmbed, publishFilters, reapplyFilters } = usePowerBI();

  // Keep a ref to the latest token so a re-mount after token refresh uses the current token
  const tokenRef = useRef(accessToken);
  tokenRef.current = accessToken;

  const { id, pageName, visualName, type } = widget;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    setStatus('loading');
    setError(null);

    const embedConfig = {
      type: 'visual' as const,
      id: reportId,
      embedUrl,
      accessToken: tokenRef.current,
      tokenType: models.TokenType.Embed,
      pageName,
      visualName,
      settings: {
        background: models.BackgroundType.Transparent,
        // `commands` does NOT govern the single-visual header toolbar, and
        // IVisualHeaderSettings only exposes `visible` (no per-button control).
        // So the only way to remove the drill/focus buttons is to hide the
        // whole header. Slicers keep their header (it carries no drill buttons
        // and is visually unobtrusive).
        visualSettings:
          type === 'slicer'
            ? undefined
            : { visualHeaders: [{ settings: { visible: false } }] },
      },
    } as models.IEmbedConfiguration;

    powerbiService.reset(container);
    const embed = powerbiService.embed(container, embedConfig) as Embed;

    embed.on('rendered', () => {
      setStatus('rendered');
      // Adopt any filters that were already active before this embed finished
      // loading (e.g. after a token-refresh remount with a filter button on).
      if (type === 'visual') reapplyFilters();
    });

    embed.on('error', (event) => {
      const detail = (event as unknown as { detail?: { message?: string } }).detail;
      setStatus('error');
      setError(detail?.message ?? 'Visual failed to load');
    });

    embed.on('dataSelected', (event) => {
      const detail = (event as unknown as { detail?: { dataPoints?: unknown } }).detail;

      // Diagnostic: drilling a hierarchy does NOT raise dataSelected on a
      // visual embed (no drill event exists at this level). Logging the raw
      // payload confirms what fires and reveals the field table/column for
      // configuring custom filter controls. Enabled in dev, or in any build by
      // running `localStorage.pbiFilterDebug = '1'` in the browser console.
      if (filterDebug()) {
        // eslint-disable-next-line no-console
        console.info('[filterSync] dataSelected', { widget: id, type, detail });
      }

      if (type === 'slicer') {
        // A slicer must broadcast its *cumulative* state, not just the clicked
        // points — otherwise multi-select / deselect / "select all" all break.
        // We read getSlicerState() and normalise it to plain Basic filters; if
        // that yields nothing usable we fall back to the clicked data points so
        // a slicer never filters *worse* than before.
        void (async () => {
          let filters: models.IFilter[] = [];
          try {
            const visual = embed as unknown as {
              getVisualDescriptor: () => Promise<{ getSlicerState: () => Promise<{ filters?: unknown }> }>;
            };
            const descriptor = await visual.getVisualDescriptor();
            const state = await descriptor.getSlicerState();
            filters = normalizeSlicerFilters(state?.filters);
            if (filterDebug()) {
              // eslint-disable-next-line no-console
              console.info('[filterSync] slicerState', { widget: id, rawState: state, normalized: filters });
            }
          } catch (err) {
            if (filterDebug()) {
              // eslint-disable-next-line no-console
              console.info('[filterSync] getSlicerState failed', { widget: id, err });
            }
          }
          if (filters.length === 0) {
            filters = buildFiltersFromDataPoints(detail?.dataPoints);
          }
          publishFilters(id, filters);
        })();
        return;
      }

      const filters = buildFiltersFromDataPoints(detail?.dataPoints);
      publishFilters(id, filters);
    });

    registerEmbed({ id, embed, type });

    return () => {
      unregisterEmbed(id);
      powerbiService.reset(container);
    };
    // embedUrl and reportId are stable for the provider's lifetime.
    // token refreshes are handled via setAccessToken on the registered embed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, pageName, visualName, type, embedUrl, reportId, registerEmbed, unregisterEmbed, publishFilters, reapplyFilters]);

  return { containerRef, status, error };
}
