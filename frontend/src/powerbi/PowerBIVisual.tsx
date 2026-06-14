import type { CSSProperties } from 'react';
import { useVisualEmbed } from './useVisualEmbed';
import { WidgetCard } from './WidgetCard';

export interface PowerBIVisualProps {
  /** The Power BI visual name (internal name, from getVisuals()). */
  visualName: string;
  /** Optional page override; defaults to the provider's page. */
  pageName?: string;
  title?: string;
  className?: string;
  style?: CSSProperties;
  gridArea?: string;
  allowFullscreen?: boolean;
}

/**
 * A single Power BI visual rendered as its own widget card, sharing the
 * provider's report + filter context. Click interactions broadcast as
 * cross-filters to sibling visuals (see provider).
 */
export function PowerBIVisual({
  visualName,
  pageName,
  title,
  className,
  style,
  gridArea,
  allowFullscreen,
}: PowerBIVisualProps) {
  const { containerRef, status, error, refresh } = useVisualEmbed({ visualName, pageName });

  return (
    <WidgetCard
      title={title}
      status={status}
      error={error}
      onRefresh={refresh}
      className={className}
      style={style}
      gridArea={gridArea}
      allowFullscreen={allowFullscreen}
    >
      <div className="pbi-embed" ref={containerRef} />
    </WidgetCard>
  );
}
