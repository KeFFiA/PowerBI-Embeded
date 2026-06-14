import { useCallback, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { WidgetStatus } from './types';

export interface WidgetCardProps {
  title?: string;
  status: WidgetStatus;
  error?: string | null;
  onRefresh?: () => void;
  /** Allow custom card styling around each visual. */
  className?: string;
  style?: CSSProperties;
  /** Grid placement helper (maps to CSS grid-area). */
  gridArea?: string;
  /** Enable the fullscreen toggle button. */
  allowFullscreen?: boolean;
  children: ReactNode;
}

/**
 * Presentational card wrapper around any embedded Power BI widget.
 * Handles title, loading overlay, error state, refresh and fullscreen — the
 * "widget" chrome the website draws around each Power BI element.
 */
export function WidgetCard({
  title,
  status,
  error,
  onRefresh,
  className,
  style,
  gridArea,
  allowFullscreen = true,
  children,
}: WidgetCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const toggleFullscreen = useCallback(() => {
    const el = cardRef.current;
    if (!el) return;
    if (!document.fullscreenElement) {
      void el.requestFullscreen?.().then(() => setIsFullscreen(true)).catch(() => undefined);
    } else {
      void document.exitFullscreen?.().then(() => setIsFullscreen(false)).catch(() => undefined);
    }
  }, []);

  return (
    <section
      ref={cardRef}
      className={`pbi-card${isFullscreen ? ' pbi-card--fullscreen' : ''}${className ? ` ${className}` : ''}`}
      style={{ ...style, gridArea }}
      aria-busy={status === 'loading'}
    >
      {(title || onRefresh || allowFullscreen) && (
        <header className="pbi-card__header">
          <h3 className="pbi-card__title" title={title}>
            {title}
          </h3>
          <div className="pbi-card__actions">
            {onRefresh && (
              <button type="button" className="pbi-card__btn" onClick={onRefresh} aria-label="Refresh widget">
                ⟳
              </button>
            )}
            {allowFullscreen && (
              <button
                type="button"
                className="pbi-card__btn"
                onClick={toggleFullscreen}
                aria-label={isFullscreen ? 'Exit fullscreen' : 'Fullscreen widget'}
              >
                {isFullscreen ? '🗗' : '⛶'}
              </button>
            )}
          </div>
        </header>
      )}

      <div className="pbi-card__body">
        {children}

        {status === 'loading' && (
          <div className="pbi-card__overlay" role="status">
            <div className="pbi-spinner" aria-hidden />
            <span>Loading…</span>
          </div>
        )}

        {status === 'error' && (
          <div className="pbi-card__overlay pbi-card__overlay--error" role="alert">
            <span className="pbi-card__error-title">Couldn’t load this widget</span>
            <span className="pbi-card__error-msg">{error}</span>
            {onRefresh && (
              <button type="button" className="pbi-card__retry" onClick={onRefresh}>
                Retry
              </button>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
