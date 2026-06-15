import { useState } from 'react';
import { useVisualEmbed } from './useVisualEmbed';
import { WidgetCard } from './WidgetCard';
import type { WidgetConfig } from '../types/dashboard';

interface Props {
  widget: WidgetConfig;
}

export function PowerBIVisual({ widget }: Props) {
  const [reloadKey, setReloadKey] = useState(0);
  return (
    <PowerBIVisualInner
      key={reloadKey}
      widget={widget}
      onRetry={() => setReloadKey((k) => k + 1)}
    />
  );
}

function PowerBIVisualInner({ widget, onRetry }: { widget: WidgetConfig; onRetry: () => void }) {
  const { containerRef, status, error } = useVisualEmbed(widget);

  return (
    <WidgetCard
      title={widget.title}
      type={widget.type}
      status={status}
      error={error}
      onRetry={onRetry}
      colSpan={widget.colSpan}
      rowSpan={widget.rowSpan}
    >
      <div ref={containerRef} className="widget-embed" />
    </WidgetCard>
  );
}
