import { useEffect, useRef, useState } from 'react';
import { models } from 'powerbi-client';
import type { Embed } from 'powerbi-client';
import { powerbiService } from './service';
import { usePowerBI } from './PowerBIContext';
import { buildFiltersFromDataPoints } from './filterSync';
import type { WidgetConfig } from '../types/dashboard';

type VisualStatus = 'loading' | 'rendered' | 'error';

// Hides a visual-header command (drill, focus mode, export, …) so only the
// sort control remains. See embed `settings.commands` below.
const HIDE_COMMAND = { displayOption: models.CommandDisplayOption.Hidden } as const;

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
        // Strip the visual header down to just the sort control. Everything
        // else (drill, focus mode, "see data", export, spotlight, …) is hidden.
        // Hiding drill also means a click always cross-filters instead of being
        // swallowed by drill-down navigation.
        commands: [
          {
            copy: HIDE_COMMAND,
            drill: HIDE_COMMAND,
            drillthrough: HIDE_COMMAND,
            expandCollapse: HIDE_COMMAND,
            exportData: HIDE_COMMAND,
            includeExclude: HIDE_COMMAND,
            removeVisual: HIDE_COMMAND,
            search: HIDE_COMMAND,
            seeData: HIDE_COMMAND,
            spotlight: HIDE_COMMAND,
            insightsAnalysis: HIDE_COMMAND,
            addComment: HIDE_COMMAND,
            groupVisualContainers: HIDE_COMMAND,
            summarize: HIDE_COMMAND,
            clearSelection: HIDE_COMMAND,
            focusMode: HIDE_COMMAND,
            visualCalculation: HIDE_COMMAND,
          },
        ],
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
      if (import.meta.env.DEV || localStorage.getItem('pbiFilterDebug') === '1') {
        // eslint-disable-next-line no-console
        console.debug('[filterSync] dataSelected', { widget: id, type, detail });
      }

      if (type === 'slicer') {
        // A slicer must broadcast its *cumulative* state, not just the clicked
        // points — otherwise multi-select / deselect / "select all" all break.
        void (async () => {
          try {
            const visual = embed as unknown as {
              getVisualDescriptor: () => Promise<{ getSlicerState: () => Promise<{ filters: models.IFilter[] }> }>;
            };
            const descriptor = await visual.getVisualDescriptor();
            const state = await descriptor.getSlicerState();
            publishFilters(id, state.filters ?? []);
          } catch {
            // descriptor unavailable (embed unmounted) — ignore
          }
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
