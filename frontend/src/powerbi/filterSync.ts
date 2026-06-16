import { models } from 'powerbi-client';

export function buildFiltersFromDataPoints(rawDataPoints: unknown): models.IBasicFilter[] {
  if (!Array.isArray(rawDataPoints) || rawDataPoints.length === 0) return [];

  const byTarget = new Map<
    string,
    { target: { table: string; column: string }; values: Array<string | number | boolean> }
  >();

  for (const dp of rawDataPoints) {
    const identity: unknown[] = (dp as Record<string, unknown>)?.identity as unknown[] ?? [];
    if (!Array.isArray(identity)) continue;

    for (const id of identity) {
      const item = id as Record<string, unknown>;
      const target = item?.target as Record<string, unknown> | undefined;
      const table = target?.table as string | undefined;
      const column = target?.column as string | undefined;
      const value = item?.equals as string | number | boolean | undefined;

      if (!table || !column || value === undefined) continue;

      const key = `${table}\x00${column}`;
      if (!byTarget.has(key)) {
        byTarget.set(key, { target: { table, column }, values: [] });
      }
      byTarget.get(key)!.values.push(value);
    }
  }

  return Array.from(byTarget.values()).map(({ target, values }) =>
    buildBasicFilter(target.table, target.column, 'In', values),
  );
}

/**
 * Normalises whatever `getSlicerState()` returns into clean Basic filters that
 * are always safe to pass to `setFilters` on sibling visuals. We ONLY emit
 * rebuilt Basic In/NotIn filters with primitive values, and drop anything else
 * (advanced/date/hierarchy filters, object-valued entries, missing target).
 * Dropping unknowns means a slicer can never publish a filter that makes a
 * sibling's whole `setFilters` call reject — at worst it falls back to the
 * clicked-point behaviour. Dropdown/list slicers (the case here) always yield
 * Basic In filters, so this is lossless for them.
 */
export function normalizeSlicerFilters(raw: unknown): models.IBasicFilter[] {
  if (!Array.isArray(raw)) return [];
  const out: models.IBasicFilter[] = [];

  for (const entry of raw) {
    const f = entry as Record<string, unknown>;
    const target = f?.target as Record<string, unknown> | undefined;
    const table = target?.table as string | undefined;
    const column = target?.column as string | undefined;
    if (!table || !column || !Array.isArray(f?.values)) continue;

    const values = (f.values as unknown[]).filter(
      (v): v is string | number | boolean =>
        typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean',
    );
    if (values.length === 0) continue;

    const operator = f.operator === 'NotIn' ? 'NotIn' : 'In';
    out.push(buildBasicFilter(table, column, operator, values));
  }

  return out;
}

/** Builds a single Basic ("In"/"NotIn") filter for a table[column]. */
export function buildBasicFilter(
  table: string,
  column: string,
  operator: 'In' | 'NotIn',
  values: Array<string | number | boolean>,
): models.IBasicFilter {
  return {
    $schema: 'http://powerbi.com/product/schema#basic',
    target: { table, column },
    operator: operator as models.BasicFilterOperators,
    values,
    filterType: models.FilterType.Basic,
  };
}
