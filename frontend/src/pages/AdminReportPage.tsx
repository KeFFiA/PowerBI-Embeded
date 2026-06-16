import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  fetchDashboardConfig,
  fetchReports,
  saveDashboardConfig,
  type ReportSummary,
} from '../api/embed';
import { useReportDiscover } from '../powerbi/useReportDiscover';
import type {
  DashboardConfig,
  FilterButtonConfig,
  FilterControlConfig,
  WidgetConfig,
} from '../types/dashboard';

const GRID_COL_OPTIONS = [2, 3, 4, 6];
const COL_SPAN_OPTIONS = [1, 2, 3, 4, 6];
const ROW_SPAN_OPTIONS = [1, 2, 3, 4];

// crypto.randomUUID() requires a secure context (HTTPS). Provide a fallback
// so the admin panel works on plain HTTP too.
function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

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
      .catch((e: unknown) => setLoadError(e instanceof Error ? e.message : 'Failed to load'));
  }, [key, navigate]);

  const addWidget = useCallback(
    (pageName: string, visualName: string, title: string, detectedType: 'visual' | 'slicer') => {
      // Generate the ID outside the updater — updaters must be pure (no side effects),
      // and crypto.randomUUID() is unavailable on non-HTTPS contexts.
      const id = generateId();
      setConfig((prev) => {
        if (!prev) return prev;
        const widget: WidgetConfig = {
          id,
          type: detectedType,
          visualName,
          pageName,
          title: title || visualName,
          colSpan: detectedType === 'slicer' ? 1 : 2,
          // Slicers are short; charts need a couple of rows to be readable.
          rowSpan: detectedType === 'slicer' ? 1 : 2,
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

  // ── Custom filter controls (button slicers) ──

  const addFilterControl = useCallback(() => {
    const id = generateId();
    setConfig((prev) => {
      if (!prev) return prev;
      const control: FilterControlConfig = {
        id,
        title: 'New filter',
        table: '',
        column: '',
        allowToggleOff: true,
        buttons: [],
      };
      return { ...prev, filterControls: [...(prev.filterControls ?? []), control] };
    });
  }, []);

  const removeFilterControl = useCallback((id: string) => {
    setConfig((prev) =>
      prev ? { ...prev, filterControls: (prev.filterControls ?? []).filter((c) => c.id !== id) } : prev,
    );
  }, []);

  const updateFilterControl = useCallback((id: string, patch: Partial<FilterControlConfig>) => {
    setConfig((prev) =>
      prev
        ? {
            ...prev,
            filterControls: (prev.filterControls ?? []).map((c) =>
              c.id === id ? { ...c, ...patch } : c,
            ),
          }
        : prev,
    );
  }, []);

  const addFilterButton = useCallback((controlId: string) => {
    setConfig((prev) => {
      if (!prev) return prev;
      const button: FilterButtonConfig = { label: 'Button', operator: 'In', values: [] };
      return {
        ...prev,
        filterControls: (prev.filterControls ?? []).map((c) =>
          c.id === controlId ? { ...c, buttons: [...c.buttons, button] } : c,
        ),
      };
    });
  }, []);

  const updateFilterButton = useCallback(
    (controlId: string, index: number, patch: Partial<FilterButtonConfig>) => {
      setConfig((prev) =>
        prev
          ? {
              ...prev,
              filterControls: (prev.filterControls ?? []).map((c) =>
                c.id === controlId
                  ? { ...c, buttons: c.buttons.map((b, i) => (i === index ? { ...b, ...patch } : b)) }
                  : c,
              ),
            }
          : prev,
      );
    },
    [],
  );

  const removeFilterButton = useCallback((controlId: string, index: number) => {
    setConfig((prev) =>
      prev
        ? {
            ...prev,
            filterControls: (prev.filterControls ?? []).map((c) =>
              c.id === controlId ? { ...c, buttons: c.buttons.filter((_, i) => i !== index) } : c,
            ),
          }
        : prev,
    );
  }, []);

  const handleSave = useCallback(async () => {
    if (!key || !config) return;
    setSaving(true);
    setActionError(null);
    try {
      const saved = await saveDashboardConfig(key, config);
      setConfig(saved);
      setSaveMsg('Saved ✓');
      setTimeout(() => setSaveMsg(null), 3000);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Failed to save');
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
          Back
        </button>
        <h1 className="admin-header__title">{report?.name ?? key}</h1>
        <div className="admin-header__actions">
          {saveMsg && <span className="admin-save-msg">{saveMsg}</span>}
          <button
            className="btn btn--secondary"
            onClick={() => navigate(`/dashboard/${key}`)}
            type="button"
          >
            View dashboard
          </button>
          <button
            className="btn btn--primary"
            onClick={handleSave}
            disabled={saving}
            type="button"
          >
            {saving ? 'Saving…' : 'Save'}
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
            <h2 className="admin-sidebar__title">Report visuals</h2>
            <button
              className="btn btn--secondary btn--sm"
              onClick={discover}
              disabled={discovering}
              type="button"
            >
              {discovering ? 'Loading…' : 'Discover'}
            </button>
          </div>

          {pages.length === 0 && !discovering && (
            <p className="admin-sidebar__empty">
              Click “Discover” to list every visual in the Power BI report.
            </p>
          )}

          {pages.map((page) => (
            <div key={page.name} className="discover-page">
              <div className="discover-page__name">{page.displayName}</div>
              {page.visuals.length === 0 && (
                <p style={{ fontSize: 12, color: '#98a2b3', padding: '4px 0' }}>No visuals</p>
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
                      title="Add to dashboard"
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
              Layout
              <span style={{ fontWeight: 400, color: '#98a2b3', marginLeft: 8 }}>
                ({sortedWidgets.length} {sortedWidgets.length === 1 ? 'widget' : 'widgets'})
              </span>
            </h2>
            <div className="admin-grid-cols">
              <label htmlFor="grid-cols">Grid columns</label>
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

          {sortedWidgets.length > 0 && (
            <div
              className="layout-preview"
              style={{ '--grid-cols': config.gridColumns } as CSSProperties}
              aria-hidden="true"
            >
              {sortedWidgets.map((w, i) => (
                <div
                  key={w.id}
                  className={`layout-preview__tile${w.type === 'slicer' ? ' layout-preview__tile--slicer' : ''}`}
                  style={{ '--col-span': w.colSpan, '--row-span': w.rowSpan } as CSSProperties}
                  title={w.title}
                >
                  <span className="layout-preview__num">{i + 1}</span>
                  <span className="layout-preview__label">{w.title}</span>
                </div>
              ))}
            </div>
          )}

          {sortedWidgets.length === 0 ? (
            <div className="admin-widgets-empty">
              <svg width="40" height="40" viewBox="0 0 40 40" fill="none" style={{ opacity: 0.3 }}>
                <rect x="4" y="4" width="14" height="14" rx="3" stroke="#667085" strokeWidth="2" />
                <rect x="22" y="4" width="14" height="14" rx="3" stroke="#667085" strokeWidth="2" />
                <rect x="4" y="22" width="14" height="14" rx="3" stroke="#667085" strokeWidth="2" />
                <rect x="22" y="22" width="14" height="14" rx="3" stroke="#667085" strokeWidth="2" />
              </svg>
              <p>Add visuals from the panel on the left</p>
            </div>
          ) : (
            <div className="admin-widgets">
              {sortedWidgets.map((widget, idx) => (
                <div key={widget.id} className="admin-widget">
                  <div className="admin-widget__controls">
                    <span className="admin-widget__num">{idx + 1}</span>
                    <button
                      className="admin-widget__move"
                      onClick={() => moveWidget(widget.id, -1)}
                      disabled={idx === 0}
                      type="button"
                      title="Move up"
                    >
                      ↑
                    </button>
                    <button
                      className="admin-widget__move"
                      onClick={() => moveWidget(widget.id, 1)}
                      disabled={idx === sortedWidgets.length - 1}
                      type="button"
                      title="Move down"
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
                        placeholder="Widget title"
                      />
                      <select
                        value={widget.type}
                        onChange={(e) =>
                          updateWidget(widget.id, { type: e.target.value as 'visual' | 'slicer' })
                        }
                      >
                        <option value="visual">Visual</option>
                        <option value="slicer">Slicer</option>
                      </select>
                    </div>
                    <div className="admin-widget__row admin-widget__meta">
                      <span className="admin-widget__visual-name">
                        {widget.pageName} / {widget.visualName}
                      </span>
                      <label className="admin-widget__size-label">
                        Width
                        <select
                          value={widget.colSpan}
                          onChange={(e) =>
                            updateWidget(widget.id, { colSpan: parseInt(e.target.value) })
                          }
                        >
                          {COL_SPAN_OPTIONS.map((n) => (
                            <option key={n} value={n}>{n} {n === 1 ? 'col' : 'cols'}</option>
                          ))}
                        </select>
                      </label>
                      <label className="admin-widget__size-label">
                        Height
                        <select
                          value={widget.rowSpan}
                          onChange={(e) =>
                            updateWidget(widget.id, { rowSpan: parseInt(e.target.value) })
                          }
                        >
                          {ROW_SPAN_OPTIONS.map((n) => (
                            <option key={n} value={n}>{n} {n === 1 ? 'row' : 'rows'}</option>
                          ))}
                        </select>
                      </label>
                    </div>
                  </div>

                  <button
                    className="admin-widget__remove"
                    onClick={() => removeWidget(widget.id)}
                    type="button"
                    title="Remove widget"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* ── Custom filter controls (button slicers) ── */}
          <div className="admin-filters">
            <div className="admin-main__top">
              <h2 className="admin-main__title">
                Custom filters
                <span style={{ fontWeight: 400, color: '#98a2b3', marginLeft: 8 }}>
                  (button slicers)
                </span>
              </h2>
              <button className="btn btn--secondary btn--sm" onClick={addFilterControl} type="button">
                + Filter
              </button>
            </div>

            {(config.filterControls ?? []).length === 0 ? (
              <p className="admin-sidebar__empty" style={{ padding: '8px 0' }}>
                Buttons that apply an In / NotIn filter on a chosen field to every visual at once —
                e.g. “Avion Express Malta” and “All except Avion Express Malta” on Cirium DB[Airline Name].
              </p>
            ) : (
              <div className="admin-widgets">
                {(config.filterControls ?? []).map((control) => (
                  <div key={control.id} className="admin-widget admin-widget--filter">
                    <div className="admin-widget__body">
                      <div className="admin-widget__row">
                        <input
                          className="admin-widget__title-input"
                          value={control.title}
                          onChange={(e) => updateFilterControl(control.id, { title: e.target.value })}
                          placeholder="Title (optional)"
                        />
                        <label className="admin-widget__size-label" title="Click the active button again to clear the filter">
                          <input
                            type="checkbox"
                            checked={control.allowToggleOff}
                            onChange={(e) =>
                              updateFilterControl(control.id, { allowToggleOff: e.target.checked })
                            }
                          />
                          Toggle
                        </label>
                      </div>
                      <div className="admin-widget__row">
                        <input
                          className="admin-widget__title-input"
                          value={control.table}
                          onChange={(e) => updateFilterControl(control.id, { table: e.target.value })}
                          placeholder="Table, e.g. Cirium DB"
                        />
                        <input
                          className="admin-widget__title-input"
                          value={control.column}
                          onChange={(e) => updateFilterControl(control.id, { column: e.target.value })}
                          placeholder="Column, e.g. Airline Name"
                        />
                      </div>

                      {control.buttons.map((btn, i) => (
                        <div key={i} className="admin-widget__row admin-filter-btn-row">
                          <input
                            className="admin-widget__title-input"
                            value={btn.label}
                            onChange={(e) => updateFilterButton(control.id, i, { label: e.target.value })}
                            placeholder="Button label"
                          />
                          <select
                            value={btn.operator}
                            onChange={(e) =>
                              updateFilterButton(control.id, i, {
                                operator: e.target.value as 'In' | 'NotIn',
                              })
                            }
                          >
                            <option value="In">In</option>
                            <option value="NotIn">NotIn</option>
                          </select>
                          <input
                            className="admin-widget__title-input"
                            value={btn.values.join(', ')}
                            onChange={(e) =>
                              updateFilterButton(control.id, i, {
                                values: e.target.value
                                  .split(',')
                                  .map((v) => v.trim())
                                  .filter(Boolean),
                              })
                            }
                            placeholder="Values, comma-separated"
                          />
                          <button
                            className="admin-widget__remove"
                            onClick={() => removeFilterButton(control.id, i)}
                            type="button"
                            title="Remove button"
                          >
                            ×
                          </button>
                        </div>
                      ))}

                      <button
                        className="btn btn--ghost btn--sm"
                        onClick={() => addFilterButton(control.id)}
                        type="button"
                        style={{ alignSelf: 'flex-start' }}
                      >
                        + Button
                      </button>
                    </div>

                    <button
                      className="admin-widget__remove"
                      onClick={() => removeFilterControl(control.id)}
                      type="button"
                      title="Remove filter"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
