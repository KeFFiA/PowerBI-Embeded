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

export interface DashboardConfig {
  reportKey: string;
  gridColumns: number;
  widgets: WidgetConfig[];
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
