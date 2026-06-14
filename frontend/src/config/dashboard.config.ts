/**
 * Maps Power BI visuals/slicers to website widget blocks.
 *
 * HOW TO FILL THIS IN
 *  1. In the Power BI Service, open the report and note its workspace + report id.
 *  2. Embed the report once (or use the helper in the README) and call
 *     report.getPages() then page.getVisuals() to print each visual's `name`
 *     (the stable internal name) and `title` (the display name).
 *  3. Put the internal `name` into `visualName` below. Do NOT use the title —
 *     titles are not stable identifiers.
 *
 * `gridArea` lets you place each widget in the CSS grid template defined in
 * styles/cards.css (.pbi-grid). Adjust both together to change the layout.
 */

export type BlockType = 'slicer' | 'kpi' | 'visual';

export interface DashboardBlock {
  /** Stable React key + grid-area name. */
  id: string;
  type: BlockType;
  /** Power BI internal visual name (from getVisuals()). */
  visualName: string;
  /** Title shown on the widget card chrome. */
  title: string;
  /** CSS grid-area; must match the template in .pbi-grid. */
  gridArea: string;
  /** Optional page override if the visual lives on another page. */
  pageName?: string;
}

export interface DashboardConfig {
  /** Friendly report key, must exist in the backend allowlist. */
  reportKey: string;
  /** The report page that holds these visuals (the "canvas" page). */
  pageName: string;
  blocks: DashboardBlock[];
}

/**
 * EXAMPLE — replace visualName values with the real internal names from your
 * report. The ids here (VisualContainerXX: placeholders) are illustrative.
 */
export const dashboardConfig: DashboardConfig = {
  reportKey: 'sales-analytics',
  pageName: 'ReportSection0a1b2c3d4e5f6a7b8c9d',
  blocks: [
    { id: 'date', type: 'slicer', visualName: 'VisualContainer-date', title: 'Date', gridArea: 'slicer-date' },
    { id: 'region', type: 'slicer', visualName: 'VisualContainer-region', title: 'Region', gridArea: 'slicer-region' },
    { id: 'category', type: 'slicer', visualName: 'VisualContainer-category', title: 'Product Category', gridArea: 'slicer-category' },
    { id: 'sales-kpi', type: 'kpi', visualName: 'VisualContainer-sales-kpi', title: 'Sales KPI', gridArea: 'kpi-sales' },
    { id: 'revenue', type: 'visual', visualName: 'VisualContainer-revenue', title: 'Revenue', gridArea: 'revenue' },
    { id: 'map', type: 'visual', visualName: 'VisualContainer-map', title: 'Map', gridArea: 'map' },
    { id: 'table', type: 'visual', visualName: 'VisualContainer-table', title: 'Table', gridArea: 'table' },
    { id: 'funnel', type: 'visual', visualName: 'VisualContainer-funnel', title: 'Funnel', gridArea: 'funnel' },
  ],
};
