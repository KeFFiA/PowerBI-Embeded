export interface WidgetConfig {
  id: string;
  type: 'visual' | 'slicer';
  visualName: string;
  pageName: string;
  title: string;
  colSpan: number;
  rowSpan: number;
  order: number;
}

export interface FilterButtonConfig {
  label: string;
  operator: 'In' | 'NotIn';
  values: Array<string | number | boolean>;
}

export interface FilterControlConfig {
  id: string;
  title: string;
  table: string;
  column: string;
  allowToggleOff: boolean;
  buttons: FilterButtonConfig[];
}

export interface DashboardConfig {
  reportKey: string;
  gridColumns: number;
  widgets: WidgetConfig[];
  filterControls?: FilterControlConfig[];
  updatedAt?: string;
}

export interface VisualInfo {
  name: string;
  title: string;
  type: string;
  layout?: { x: number; y: number; width: number; height: number };
}

export interface PageWithVisuals {
  name: string;
  displayName: string;
  order: number;
  visuals: VisualInfo[];
}

export interface DiscoverResult {
  pages: PageWithVisuals[];
}
