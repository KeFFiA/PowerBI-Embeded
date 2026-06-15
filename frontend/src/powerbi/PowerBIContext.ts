import { createContext, useContext } from 'react';
import type { Embed } from 'powerbi-client';
import type { models } from 'powerbi-client';

export interface EmbedRegistration {
  id: string;
  embed: Embed;
  type: 'visual' | 'slicer';
}

export interface PowerBIContextValue {
  accessToken: string;
  embedUrl: string;
  reportId: string;
  registerEmbed: (reg: EmbedRegistration) => void;
  unregisterEmbed: (id: string) => void;
  broadcastSelection: (sourceId: string, filters: models.IBasicFilter[]) => void;
}

export const PowerBIContext = createContext<PowerBIContextValue | null>(null);

export function usePowerBI(): PowerBIContextValue {
  const ctx = useContext(PowerBIContext);
  if (!ctx) throw new Error('usePowerBI must be used inside PowerBIAnalyticsProvider');
  return ctx;
}
