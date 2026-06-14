import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchReports, type ReportSummary } from '../api/embed';
import { ReportCard } from '../components/ReportCard';

export function HomePage() {
  const [reports, setReports] = useState<ReportSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    fetchReports()
      .then(setReports)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Ошибка загрузки'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="home-page">
      <header className="home-header">
        <div className="home-header__logo">
          <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
            <rect width="28" height="28" rx="6" fill="#2563eb" />
            <rect x="6" y="14" width="4" height="8" rx="1" fill="white" />
            <rect x="12" y="10" width="4" height="12" rx="1" fill="white" />
            <rect x="18" y="6" width="4" height="16" rx="1" fill="white" />
          </svg>
          <span className="home-header__brand">Analytics</span>
        </div>
      </header>

      <main className="home-main">
        <div className="home-hero">
          <h1 className="home-hero__title">Отчёты</h1>
          <p className="home-hero__subtitle">Выберите отчёт для просмотра</p>
        </div>

        {loading && (
          <div className="home-loading">
            <div className="pbi-spinner" />
          </div>
        )}

        {error && (
          <div className="home-error">
            <span className="home-error__icon">⚠</span>
            <span>{error}</span>
          </div>
        )}

        {!loading && !error && reports.length === 0 && (
          <p className="home-empty">Нет доступных отчётов. Проверьте файл allowlist.json.</p>
        )}

        {!loading && !error && reports.length > 0 && (
          <div className="report-cards">
            {reports.map((r) => (
              <ReportCard
                key={r.key}
                report={r}
                onClick={() => navigate(`/report/${r.key}`, { state: { name: r.name } })}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
