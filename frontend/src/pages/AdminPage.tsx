import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchReports, type ReportSummary } from '../api/embed';

export function AdminPage() {
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
    <div className="admin-page">
      <header className="admin-header">
        <button className="back-btn" onClick={() => navigate('/')} type="button">
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
            <path d="M11.25 13.5L6.75 9L11.25 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Главная
        </button>
        <h1 className="admin-header__title">Панель администратора</h1>
      </header>

      <div className="admin-reports-list">
        {loading && (
          <div className="pbi-provider-loading">
            <div className="pbi-spinner" />
          </div>
        )}

        {error && <div className="admin-error">{error}</div>}

        {!loading && !error && reports.length === 0 && (
          <p style={{ color: '#667085', fontSize: 14 }}>Нет доступных отчётов.</p>
        )}

        {reports.map((r) => (
          <div key={r.key} className="admin-report-row">
            <div>
              <div className="admin-report-row__name">{r.name}</div>
              <div style={{ fontSize: 12, color: '#98a2b3', marginTop: 2 }}>
                {r.rlsEnabled ? 'RLS включён · ' : ''}{r.pages.length > 0 ? `${r.pages.length} страниц` : 'Все страницы'}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                className="btn btn--secondary"
                onClick={() => navigate(`/dashboard/${r.key}`)}
                type="button"
              >
                Дашборд
              </button>
              <button
                className="btn btn--primary"
                onClick={() => navigate(`/admin/${r.key}`)}
                type="button"
              >
                Настроить
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
