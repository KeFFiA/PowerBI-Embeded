import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { fetchDashboardConfig, fetchReports } from '../api/embed';
import type { DashboardConfig } from '../types/dashboard';
import type { ReportSummary } from '../api/embed';
import { PowerBIVisualGrid } from '../powerbi/PowerBIVisualGrid';

export function DashboardPage() {
  const { key } = useParams<{ key: string }>();
  const navigate = useNavigate();
  const [config, setConfig] = useState<DashboardConfig | null>(null);
  const [report, setReport] = useState<ReportSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!key) { navigate('/'); return; }
    Promise.all([fetchDashboardConfig(key), fetchReports()])
      .then(([cfg, reports]) => {
        setConfig(cfg);
        setReport(reports.find((r) => r.key === key) ?? null);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Ошибка загрузки'))
      .finally(() => setLoading(false));
  }, [key, navigate]);

  if (!key) return null;

  return (
    <div className="dashboard-page">
      <header className="report-header">
        <button className="back-btn" onClick={() => navigate('/')} type="button">
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
            <path d="M11.25 13.5L6.75 9L11.25 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Все отчёты
        </button>
        {report && <span className="report-header__name">{report.name}</span>}
        <div className="dashboard-header-actions">
          <button
            className="btn btn--secondary"
            onClick={() => navigate(`/report/${key}`, { state: { name: report?.name } })}
            type="button"
          >
            Полный отчёт
          </button>
          <button
            className="btn btn--secondary"
            onClick={() => navigate(`/admin/${key}`)}
            type="button"
          >
            Настройки
          </button>
        </div>
      </header>

      <div className="dashboard-content">
        {loading && (
          <div className="pbi-provider-loading">
            <div className="pbi-spinner" />
            <span>Загрузка…</span>
          </div>
        )}

        {error && (
          <div className="pbi-provider-error">⚠ {error}</div>
        )}

        {!loading && !error && config && config.widgets.length === 0 && (
          <div className="dashboard-empty">
            <p>Дашборд ещё не настроен.</p>
            <button onClick={() => navigate(`/admin/${key}`)} type="button">
              Перейти в настройки →
            </button>
          </div>
        )}

        {!loading && !error && config && config.widgets.length > 0 && (
          <PowerBIVisualGrid reportKey={key} config={config} />
        )}
      </div>
    </div>
  );
}
