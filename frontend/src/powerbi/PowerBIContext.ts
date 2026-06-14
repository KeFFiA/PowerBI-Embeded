import { createContext, useContext } from 'react';
import type { PowerBIContextValue } from './types';

export const PowerBIContext = createContext<PowerBIContextValue | null>(null);

/** Access the shared Power BI report context. Must be used under a Provider. */
export function usePowerBI(): PowerBIContextValue {
  const ctx = useContext(PowerBIContext);
  if (!ctx) {
    throw new Error('usePowerBI must be used inside a <PowerBIAnalyticsProvider>.');
  }
  return ctx;
}
