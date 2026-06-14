import type { CSSProperties } from 'react';
import { useVisualEmbed } from './useVisualEmbed';
import { WidgetCard } from './WidgetCard';

export interface PowerBIKpiProps {
  /** A KPI/card visual name from the report page. */
  visualName: string;
  pageName?: string;
  title?: string;
  className?: string;
  style?: CSSProperties;
  gridArea?: string;
}

/**
 * A compact KPI/card visual. Same shared-context embedding as PowerBIVisual,
 * styled for small single-number tiles.
 */
export function PowerBIKpi({ visualName, pageName, title, className, style, gridArea }: PowerBIKpiProps) {
  const { containerRef, status, error, refresh } = useVisualEmbed({ visualName, pageName });

  return (
    <WidgetCard
      title={title}
      status={status}
      error={error}
      onRefresh={refresh}
      className={`pbi-card--kpi${className ? ` ${className}` : ''}`}
      style={style}
      gridArea={gridArea}
      allowFullscreen={false}
    >
      <div className="pbi-embed pbi-embed--kpi" ref={containerRef} />
    </WidgetCard>
  );
}
