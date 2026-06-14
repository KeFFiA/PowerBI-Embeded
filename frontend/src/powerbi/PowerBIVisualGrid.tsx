import { usePowerBI } from './PowerBIContext';
import { PowerBIVisual } from './PowerBIVisual';
import { PowerBISlicer } from './PowerBISlicer';
import { PowerBIKpi } from './PowerBIKpi';
import type { DashboardBlock } from '../config/dashboard.config';

export interface PowerBIVisualGridProps {
  blocks: DashboardBlock[];
  className?: string;
}

/**
 * Lays out the configured widget blocks in a responsive CSS grid.
 *
 * In 'separate-visuals' mode each block is its own embedded visual/slicer card.
 * In 'shared-canvas' mode the single report (rendered by the provider) IS the
 * dashboard, so the grid just shows a note instead of double-embedding.
 */
export function PowerBIVisualGrid({ blocks, className }: PowerBIVisualGridProps) {
  const { strategy, status, error } = usePowerBI();

  if (strategy === 'shared-canvas') {
    return (
      <p className="pbi-grid__note">
        Using <strong>shared-canvas</strong> strategy — the report above is the live dashboard with native
        cross-filtering. Switch the provider to <code>strategy="separate-visuals"</code> to render these blocks as
        independent cards.
      </p>
    );
  }

  return (
    <div className={`pbi-grid${className ? ` ${className}` : ''}`} data-status={status}>
      {error && status === 'error' && (
        <div className="pbi-grid__banner" role="alert">
          {error}
        </div>
      )}
      {blocks.map((block) => {
        const common = { key: block.id, visualName: block.visualName, title: block.title, gridArea: block.gridArea, pageName: block.pageName };
        switch (block.type) {
          case 'slicer':
            return <PowerBISlicer {...common} />;
          case 'kpi':
            return <PowerBIKpi {...common} />;
          case 'visual':
          default:
            return <PowerBIVisual {...common} />;
        }
      })}
    </div>
  );
}
