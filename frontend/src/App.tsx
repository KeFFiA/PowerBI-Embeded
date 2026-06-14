import { useState } from 'react';
import { PowerBIAnalyticsProvider, PowerBIVisualGrid, usePowerBI } from './powerbi';
import type { SyncStrategy } from './powerbi/types';
import { dashboardConfig } from './config/dashboard.config';

/**
 * Dev helper: prints every page + visual (internal name AND title) to the
 * console. Use it once to discover the `visualName` values for dashboard.config.
 */
function VisualInspector() {
  const { report, status } = usePowerBI();

  const inspect = async () => {
    if (!report) return;
    const pages = await report.getPages();
    for (const page of pages) {
      const visuals = await page.getVisuals();
      // eslint-disable-next-line no-console
      console.group(`Page: ${page.displayName} (name="${page.name}")`);
      visuals.forEach((v) =>
        // eslint-disable-next-line no-console
        console.log(`type=${v.type}  name="${v.name}"  title="${v.title}"`),
      );
      // eslint-disable-next-line no-console
      console.groupEnd();
    }
  };

  return (
    <>
      <button className="app__btn" onClick={inspect} disabled={!report}>
        Print visual names → console
      </button>
      <span className="app__status">report: {status}</span>
    </>
  );
}

export default function App() {
  // Flip to 'shared-canvas' to render one report with native cross-filtering.
  const [strategy] = useState<SyncStrategy>('separate-visuals');

  return (
    <div className="app">
      <header className="app__header">
        <div>
          <h1>Sales Analytics</h1>
          <p>Separate Power BI widgets sharing one report filter context</p>
        </div>
      </header>

      <PowerBIAnalyticsProvider
        reportKey={dashboardConfig.reportKey}
        pageName={dashboardConfig.pageName}
        visualNames={dashboardConfig.blocks.map((b) => b.visualName)}
        strategy={strategy}
      >
        <div className="app__toolbar">
          <VisualInspector />
        </div>
        <PowerBIVisualGrid blocks={dashboardConfig.blocks} />
      </PowerBIAnalyticsProvider>
    </div>
  );
}
