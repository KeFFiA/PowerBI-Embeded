import { useEffect, useRef, useState } from 'react';
import { models } from 'powerbi-client';
import type { Embed } from 'powerbi-client';
import { powerbiService } from './service';
import { usePowerBI } from './PowerBIContext';
import { buildFiltersFromDataPoints } from './filterSync';
import type { WidgetConfig } from '../types/dashboard';

type VisualStatus = 'loading' | 'rendered' | 'error';

export function useVisualEmbed(widget: Pick<WidgetConfig, 'id' | 'pageName' | 'visualName' | 'type'>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<VisualStatus>('loading');
  const [error, setError] = useState<string | null>(null);

  const { accessToken, embedUrl, reportId, registerEmbed, unregisterEmbed, broadcastSelection } = usePowerBI();

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
      },
    } as models.IEmbedConfiguration;

    powerbiService.reset(container);
    const embed = powerbiService.embed(container, embedConfig) as Embed;

    embed.on('rendered', () => setStatus('rendered'));

    embed.on('error', (event) => {
      const detail = (event as unknown as { detail?: { message?: string } }).detail;
      setStatus('error');
      setError(detail?.message ?? 'Visual failed to load');
    });

    embed.on('dataSelected', (event) => {
      const detail = (event as unknown as { detail?: { dataPoints?: unknown } }).detail;
      const filters = buildFiltersFromDataPoints(detail?.dataPoints);
      broadcastSelection(id, filters);
    });

    registerEmbed({ id, embed, type });

    return () => {
      unregisterEmbed(id);
      powerbiService.reset(container);
    };
    // embedUrl and reportId are stable for the provider's lifetime.
    // token refreshes are handled via setAccessToken on the registered embed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, pageName, visualName, type, embedUrl, reportId, registerEmbed, unregisterEmbed, broadcastSelection]);

  return { containerRef, status, error };
}
