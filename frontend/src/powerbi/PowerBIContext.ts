import { createContext, useContext } from 'react';
import type { Embed } from 'powerbi-client';
import type { models } from 'powerbi-client';

export interface EmbedRegistration {
  id: string;
  embed: Embed;
  type: 'visual' | 'slicer';
  /** Set true once the embed fires `rendered`. setFilters before that throws
   * `explorationContainerNotReady`, so the merge skips unready embeds. */
  ready?: boolean;
}

export interface PowerBIContextValue {
  accessToken: string;
  embedUrl: string;
  reportId: string;
  registerEmbed: (reg: EmbedRegistration) => void;
  unregisterEmbed: (id: string) => void;
  /**
   * Publishes the set of filters contributed by one source (a visual's click
   * selection, a slicer's state, or a custom filter-control button). The
   * provider merges all active sources and applies the union to every value
   * visual. Pass an empty array to retract this source's contribution.
   */
  publishFilters: (sourceId: string, filters: models.IFilter[]) => void;
  /** Re-applies the current merged filter set to all value visuals. Call after
   * an embed finishes rendering so a freshly (re)mounted visual adopts filters
   * that were already active. */
  reapplyFilters: () => void;
}

export const PowerBIContext = createContext<PowerBIContextValue | null>(null);

export function usePowerBI(): PowerBIContextValue {
  const ctx = useContext(PowerBIContext);
  if (!ctx) throw new Error('usePowerBI must be used inside PowerBIAnalyticsProvider');
  return ctx;
}
