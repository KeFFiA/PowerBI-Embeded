import type { ReportSummary } from '../api/embed';

interface ReportCardProps {
  report: ReportSummary;
  onClick: () => void;
  onDashboardClick: () => void;
}

export function ReportCard({ report, onClick, onDashboardClick }: ReportCardProps) {
  return (
    <div className="report-card">
      <div className="report-card__icon" aria-hidden="true">
        <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
          <rect width="32" height="32" rx="8" fill="#eff6ff" />
          <rect x="7" y="17" width="4" height="8" rx="1" fill="#2563eb" />
          <rect x="14" y="12" width="4" height="13" rx="1" fill="#2563eb" />
          <rect x="21" y="7" width="4" height="18" rx="1" fill="#2563eb" />
        </svg>
      </div>
      <div className="report-card__body">
        <span className="report-card__name">{report.name}</span>
        <span className="report-card__meta">
          {report.pages.length > 0
            ? `${report.pages.length} ${pluralPages(report.pages.length)}`
            : 'Все страницы'}
          {report.rlsEnabled && ' · RLS'}
        </span>
      </div>
      <div className="report-card__actions">
        <button
          className="btn btn--secondary btn--sm"
          onClick={(e) => { e.stopPropagation(); onDashboardClick(); }}
          type="button"
          title="Открыть как дашборд с отдельными визуалами"
        >
          Дашборд
        </button>
        <button
          className="btn btn--primary btn--sm"
          onClick={(e) => { e.stopPropagation(); onClick(); }}
          type="button"
          title="Открыть полный отчёт"
        >
          Отчёт
        </button>
      </div>
    </div>
  );
}

function pluralPages(n: number): string {
  if (n % 10 === 1 && n % 100 !== 11) return 'страница';
  if (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20)) return 'страницы';
  return 'страниц';
}
