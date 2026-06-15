import type { ReactNode, CSSProperties } from 'react';

interface WidgetCardProps {
  title: string;
  type: 'visual' | 'slicer';
  status: 'loading' | 'rendered' | 'error';
  error: string | null;
  onRetry?: () => void;
  colSpan: number;
  rowSpan: number;
  children: ReactNode;
}

export function WidgetCard({ title, type, status, error, onRetry, colSpan, rowSpan, children }: WidgetCardProps) {
  const style = {
    '--col-span': colSpan,
    '--row-span': rowSpan,
  } as CSSProperties;

  return (
    <div className={`widget-card${type === 'slicer' ? ' widget-card--slicer' : ''}`} style={style}>
      <div className="widget-card__header">
        <span className="widget-card__title">{title}</span>
        {type === 'slicer' && <span className="widget-card__badge">Фильтр</span>}
      </div>
      <div className="widget-card__body">
        {status === 'loading' && (
          <div className="widget-card__overlay">
            <div className="pbi-spinner" />
          </div>
        )}
        {status === 'error' && (
          <div className="widget-card__overlay widget-card__overlay--error">
            <span className="widget-error-text">{error}</span>
            {onRetry && (
              <button className="pbi-card__retry" onClick={onRetry} type="button">
                Повторить
              </button>
            )}
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
