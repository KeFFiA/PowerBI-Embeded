import { useEffect, useId, useRef, useState } from 'react';
import { models, type Embed } from 'powerbi-client';
import { powerbiService } from './service';
import { usePowerBI } from './PowerBIContext';
import type { SelectedDataPoint, WidgetStatus } from './types';

interface UseVisualEmbedArgs {
  visualName: string;
  pageName?: string;
  isSlicer?: boolean;
}

interface UseVisualEmbedResult {
  containerRef: React.RefObject<HTMLDivElement>;
  status: WidgetStatus;
  error: string | null;
  refresh: () => void;
}

/**
 * Embeds a single Power BI visual (`type: 'visual'`) into its own container,
 * using the SHARED report + token from the provider. Registers the embed with
 * the provider's filter-sync coordinator so selections propagate to siblings.
 *
 * Only used in the 'separate-visuals' strategy. In 'shared-canvas' the visuals
 * live inside the one master report instead.
 */
export function useVisualEmbed({ visualName, pageName, isSlicer = false }: UseVisualEmbedArgs): UseVisualEmbedResult {
  const ctx = usePowerBI();
  const id = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const embedRef = useRef<Embed | null>(null);
  const [status, setStatus] = useState<WidgetStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const refresh = () => setRefreshKey((k) => k + 1);

  const cfg = ctx.config;
  const resolvedPage = pageName ?? ctx.pageName ?? cfg?.pageName ?? undefined;

  useEffect(() => {
    // Visual embeds only apply to separate-visuals mode and need config + page.
    if (ctx.strategy !== 'separate-visuals') return;
    if (!cfg || !resolvedPage) return;
    const container = containerRef.current;
    const token = ctx.getAccessToken();
    if (!container || !token) return;

    setStatus('loading');
    setError(null);
    powerbiService.reset(container);

    const embedConfig: models.IVisualEmbedConfiguration = {
      type: 'visual',
      id: cfg.reportId,
      embedUrl: cfg.embedUrl,
      accessToken: token,
      tokenType: models.TokenType.Embed,
      pageName: resolvedPage,
      visualName,
      permissions: models.Permissions.Read,
      settings: {
        background: models.BackgroundType.Transparent,
        // Slicers stay interactive; non-slicer visuals allow click-to-cross-filter.
        visualSettings: undefined,
      },
    };

    const embed = powerbiService.embed(container, embedConfig);
    embedRef.current = embed;

    embed.on('rendered', () => setStatus('rendered'));
    embed.on('error', (event) => {
      const detail = (event as unknown as { detail?: { message?: string } }).detail;
      setStatus('error');
      setError(detail?.message ?? `Failed to render visual "${visualName}".`);
    });
    // Selections (data clicks on visuals, value changes on slicers) drive sync.
    embed.on('dataSelected', (event) => {
      const detail = (event as unknown as { detail?: { dataPoints?: SelectedDataPoint[] } }).detail;
      ctx.broadcastSelection(id, detail?.dataPoints ?? []);
    });

    const unregister = ctx.registerEmbed({ id, embed, visualName, isSlicer });
    const unsubToken = ctx.onTokenRefresh((newToken) => {
      void embed.setAccessToken(newToken);
    });

    return () => {
      unregister();
      unsubToken();
      embed.off('rendered');
      embed.off('error');
      embed.off('dataSelected');
      if (container) powerbiService.reset(container);
      embedRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfg?.reportId, cfg?.accessToken, resolvedPage, visualName, isSlicer, ctx.strategy, refreshKey]);

  return { containerRef, status, error, refresh };
}
