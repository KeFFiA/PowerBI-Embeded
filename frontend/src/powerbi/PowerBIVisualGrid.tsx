import type { CSSProperties } from 'react';
import type { DashboardConfig } from '../types/dashboard';
import { PowerBIAnalyticsProvider } from './PowerBIAnalyticsProvider';
import { PowerBIVisual } from './PowerBIVisual';
import { FilterBar } from './FilterBar';

interface Props {
  reportKey: string;
  config: DashboardConfig;
}

export function PowerBIVisualGrid({ reportKey, config }: Props) {
  const sorted = [...config.widgets].sort((a, b) => a.order - b.order);

  return (
    <PowerBIAnalyticsProvider reportKey={reportKey}>
      <FilterBar controls={config.filterControls ?? []} />
      <div
        className="visual-grid"
        style={{ '--grid-cols': config.gridColumns } as CSSProperties}
      >
        {sorted.map((widget) => (
          <PowerBIVisual key={widget.id} widget={widget} />
        ))}
      </div>
    </PowerBIAnalyticsProvider>
  );
}
