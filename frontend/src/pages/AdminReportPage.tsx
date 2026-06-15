import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  fetchDashboardConfig,
  fetchReports,
  saveDashboardConfig,
  type ReportSummary,
} from '../api/embed';
import { useReportDiscover } from '../powerbi/useReportDiscover';
import type { DashboardConfig, WidgetConfig } from '../types/dashboard';

const GRID_COL_OPTIONS = [2, 3, 4, 6];
const COL_SPAN_OPTIONS = [1, 2, 3, 4, 6];
const ROW_SPAN_OPTIONS = [1, 2, 3];

export function AdminReportPage() {
  const { key } = useParams<{ key: string }>();
  const navigate = useNavigate();

  const [report, setReport] = useState<ReportSummary | null>(null);
  const [config, setConfig] = useState<DashboardConfig | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const { containerRef: discoverContainerRef, discover, discovering, pages, error: discoverError } =
    useReportDiscover(key ?? '');

  useEffect(() => {
    if (!key) { navigate('/admin'); return; }
    Promise.all([fetchDashboardConfig(key), fetchReports()])
      .then(([cfg, reports]) => {
        setConfig(cfg);
        setReport(reports.find((r) => r.key === key) ?? null);
      })
      .catch((e: unknown) => setLoadError(e instanceof Error ? e.message : 'Ошибка загрузки'));
  }, [key, navigate]);

  const addWidget = useCallback(
    (pageName: string, visualName: string, title: string, detectedType: 'visual' | 'slicer') => {
      setConfig((prev) => {
        if (!prev) return prev;
        const widget: WidgetConfig = {
          id: crypto.randomUUID(),
          type: detectedType,
          visualName,
          pageName,
          title: title || visualName,
          colSpan: detectedType === 'slicer' ? 1 : 2,
          rowSpan: 1,
          order: prev.widgets.length,
        };
        return { ...prev, widgets: [...prev.widgets, widget] };
      });
    },
    [],
  );

  const removeWidget = useCallback((id: string) => {
    setConfig((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        widgets: prev.widgets
          .filter((w) => w.id !== id)
          .map((w, i) => ({ ...w, order: i })),
      };
    });
  }, []);

  const updateWidget = useCallback((id: string, patch: Partial<WidgetConfig>) => {
    setConfig((prev) => {
      if (!prev) return prev;
      return { ...prev, widgets: prev.widgets.map((w) => (w.id === id ? { ...w, ...patch } : w)) };
    });
  }, []);

  const moveWidget = useCallback((id: string, direction: -1 | 1) => {
    setConfig((prev) => {
      if (!prev) return prev;
      const sorted = [...prev.widgets].sort((a, b) => a.order - b.order);
      const idx = sorted.findIndex((w) => w.id === id);
      if (idx < 0) return prev;
      const swap = idx + direction;
      if (swap < 0 || swap >= sorted.length) return prev;
      [sorted[idx], sorted[swap]] = [sorted[swap], sorted[idx]];
      return { ...prev, widgets: sorted.map((w, i) => ({ ...w, order: i })) };
    });
  }, []);

  const handleSave = useCallback(async () => {
    if (!key || !config) return;
    setSaving(true);
    setActionError(null);
    try {
      const saved = await saveDashboardConfig(key, config);
      setConfig(saved);
      setSaveMsg('Сохранено ✓');
      setTimeout(() => setSaveMsg(null), 3000);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  }, [key, config]);

  if (loadError) {
    return (
      <div className="admin-page">
        <div className="admin-error" style={{ margin: 24 }}>{loadError}</div>
      </div>
    );
  }

  if (!config) {
    return (
      <div className="admin-page">
        <div className="pbi-provider-loading">
          <div className="pbi-spinner" />
        </div>
      </div>
    );
  }

  const sortedWidgets = [...config.widgets].sort((a, b) => a.order - b.order);

  return (
    <div className="admin-page">
      <header className="admin-header">
        <button className="back-btn" onClick={() => navigate('/admin')} type="button">
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
            <path d="M11.25 13.5L6.75 9L11.25 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Назад
        </button>
        <h1 className="admin-header__title">{report?.name ?? key}</h1>
        <div className="admin-header__actions">
          {saveMsg && <span className="admin-save-msg">{saveMsg}</span>}
          <button
            className="btn btn--secondary"
            onClick={() => navigate(`/dashboard/${key}`)}
            type="button"
          >
            Просмотр дашборда
          </button>
          <button
            className="btn btn--primary"
            onClick={handleSave}
            disabled={saving}
            type="button"
          >
            {saving ? 'Сохранение…' : 'Сохранить'}
          </button>
        </div>
      </header>

      {(actionError || discoverError) && (
        <div className="admin-error" style={{ margin: '0 24px', marginTop: 12 }}>
          {actionError ?? discoverError}
        </div>
      )}

      {/* Off-screen container used by useReportDiscover to briefly embed the report */}
      <div
        ref={discoverContainerRef}
        style={{
          position: 'fixed',
          top: -2000,
          left: -2000,
          width: 800,
          height: 600,
          visibility: 'hidden',
          pointerEvents: 'none',
        }}
      />

      <div className="admin-body">
        {/* Left: visual discovery panel */}
        <aside className="admin-sidebar">
          <div className="admin-sidebar__header">
            <h2 className="admin-sidebar__title">Визуалы отчёта</h2>
            <button
              className="btn btn--secondary btn--sm"
              onClick={discover}
              disabled={discovering}
              type="button"
            >
              {discovering ? 'Загрузка…' : 'Обнаружить'}
            </button>
          </div>

          {pages.length === 0 && !discovering && (
            <p className="admin-sidebar__empty">
              Нажмите «Обнаружить» чтобы получить список всех визуалов из отчёта Power BI.
            </p>
          )}

          {pages.map((page) => (
            <div key={page.name} className="discover-page">
              <div className="discover-page__name">{page.displayName}</div>
              {page.visuals.length === 0 && (
                <p style={{ fontSize: 12, color: '#98a2b3', padding: '4px 0' }}>Нет визуалов</p>
              )}
              {page.visuals.map((v) => {
                const detectedType: 'visual' | 'slicer' =
                  v.type.toLowerCase() === 'slicer' ? 'slicer' : 'visual';
                return (
                  <div key={v.name} className="discover-visual">
                    <div className="discover-visual__info">
                      <span className="discover-visual__title">{v.title || v.name}</span>
                      <span className="discover-visual__type">{v.type}</span>
                    </div>
                    <button
                      className="btn btn--ghost btn--sm"
                      onClick={() => addWidget(page.name, v.name, v.title || v.name, detectedType)}
                      type="button"
                      title="Добавить в дашборд"
                    >
                      +
                    </button>
                  </div>
                );
              })}
            </div>
          ))}
        </aside>

        {/* Right: layout editor */}
        <main className="admin-main">
          <div className="admin-main__top">
            <h2 className="admin-main__title">
              Дашборд
              <span style={{ fontWeight: 400, color: '#98a2b3', marginLeft: 8 }}>
                ({sortedWidgets.length} виджетов)
              </span>
            </h2>
            <div className="admin-grid-cols">
              <label htmlFor="grid-cols">Колонок в сетке:</label>
              <select
                id="grid-cols"
                value={config.gridColumns}
                onChange={(e) =>
                  setConfig((prev) =>
                    prev ? { ...prev, gridColumns: parseInt(e.target.value) } : prev,
                  )
                }
              >
                {GRID_COL_OPTIONS.map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </div>
          </div>

          {sortedWidgets.length === 0 ? (
            <div className="admin-widgets-empty">
              <svg width="40" height="40" viewBox="0 0 40 40" fill="none" style={{ opacity: 0.3 }}>
                <rect x="4" y="4" width="14" height="14" rx="3" stroke="#667085" strokeWidth="2" />
                <rect x="22" y="4" width="14" height="14" rx="3" stroke="#667085" strokeWidth="2" />
                <rect x="4" y="22" width="14" height="14" rx="3" stroke="#667085" strokeWidth="2" />
                <rect x="22" y="22" width="14" height="14" rx="3" stroke="#667085" strokeWidth="2" />
              </svg>
              <p>Добавьте визуалы из панели слева</p>
            </div>
          ) : (
            <div className="admin-widgets">
              {sortedWidgets.map((widget, idx) => (
                <div key={widget.id} className="admin-widget">
                  <div className="admin-widget__controls">
                    <button
                      className="admin-widget__move"
                      onClick={() => moveWidget(widget.id, -1)}
                      disabled={idx === 0}
                      type="button"
                      title="Переместить выше"
                    >
                      ↑
                    </button>
                    <button
                      className="admin-widget__move"
                      onClick={() => moveWidget(widget.id, 1)}
                      disabled={idx === sortedWidgets.length - 1}
                      type="button"
                      title="Переместить ниже"
                    >
                      ↓
                    </button>
                  </div>

                  <div className="admin-widget__body">
                    <div className="admin-widget__row">
                      <input
                        className="admin-widget__title-input"
                        value={widget.title}
                        onChange={(e) => updateWidget(widget.id, { title: e.target.value })}
                        placeholder="Название виджета"
                      />
                      <select
                        value={widget.type}
                        onChange={(e) =>
                          updateWidget(widget.id, { type: e.target.value as 'visual' | 'slicer' })
                        }
                      >
                        <option value="visual">Визуал</option>
                        <option value="slicer">Слайсер</option>
                      </select>
                    </div>
                    <div className="admin-widget__row admin-widget__meta">
                      <span className="admin-widget__visual-name">
                        {widget.pageName} / {widget.visualName}
                      </span>
                      <label className="admin-widget__size-label">
                        Шир:
                        <select
                          value={widget.colSpan}
                          onChange={(e) =>
                            updateWidget(widget.id, { colSpan: parseInt(e.target.value) })
                          }
                        >
                          {COL_SPAN_OPTIONS.map((n) => (
                            <option key={n} value={n}>{n}</option>
                          ))}
                        </select>
                      </label>
                      <label className="admin-widget__size-label">
                        Выс:
                        <select
                          value={widget.rowSpan}
                          onChange={(e) =>
                            updateWidget(widget.id, { rowSpan: parseInt(e.target.value) })
                          }
                        >
                          {ROW_SPAN_OPTIONS.map((n) => (
                            <option key={n} value={n}>{n}</option>
                          ))}
                        </select>
                      </label>
                    </div>
                  </div>

                  <button
                    className="admin-widget__remove"
                    onClick={() => removeWidget(widget.id)}
                    type="button"
                    title="Удалить виджет"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
