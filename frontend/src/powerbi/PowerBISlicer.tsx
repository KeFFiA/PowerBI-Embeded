import type { CSSProperties } from 'react';
import { useVisualEmbed } from './useVisualEmbed';
import { WidgetCard } from './WidgetCard';

export interface PowerBISlicerProps {
  /** The Power BI slicer visual name (internal name, from getVisuals()). */
  visualName: string;
  pageName?: string;
  title?: string;
  className?: string;
  style?: CSSProperties;
  gridArea?: string;
}

/**
 * A Power BI slicer rendered as its own block. Changing the slicer broadcasts
 * the chosen values as filters to every non-slicer visual in the provider,
 * keeping the whole page on one filter context.
 */
export function PowerBISlicer({ visualName, pageName, title, className, style, gridArea }: PowerBISlicerProps) {
  const { containerRef, status, error, refresh } = useVisualEmbed({ visualName, pageName, isSlicer: true });

  return (
    <WidgetCard
      title={title}
      status={status}
      error={error}
      onRefresh={refresh}
      className={`pbi-card--slicer${className ? ` ${className}` : ''}`}
      style={style}
      gridArea={gridArea}
      allowFullscreen={false}
    >
      <div className="pbi-embed pbi-embed--slicer" ref={containerRef} />
    </WidgetCard>
  );
}
