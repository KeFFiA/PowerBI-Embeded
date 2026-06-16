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
 * Normalises whatever `getSlicerState()` returns into filters that are safe to
 * pass to `setFilters` on sibling visuals.
 *
 * - Basic filters (dropdown/list slicers): rebuilt as clean Basic In/NotIn with
 *   primitive values only (object-valued entries would make setFilters reject).
 * - Hierarchy / advanced / relative-date filters (e.g. a hierarchy slicer like
 *   ASG/Other → Airline Name, filterType 9): passed through unchanged so the
 *   slicer's exact selection (incl. "all except the unchecked") is replicated.
 *
 * Anything without a recognisable schema/target is dropped, so a slicer can
 * never publish a filter that makes a sibling's whole setFilters call fail.
 */
export function normalizeSlicerFilters(raw: unknown): models.IFilter[] {
  if (!Array.isArray(raw)) return [];
  const out: models.IFilter[] = [];

  for (const entry of raw) {
    const f = entry as Record<string, unknown>;
    if (typeof f?.$schema !== 'string' || f.target == null) continue;

    const target = f.target;
    const isBasicShape =
      !Array.isArray(target) &&
      typeof (target as Record<string, unknown>).table === 'string' &&
      typeof (target as Record<string, unknown>).column === 'string' &&
      Array.isArray(f.values);

    if (isBasicShape) {
      const t = target as Record<string, unknown>;
      const values = (f.values as unknown[]).filter(
        (v): v is string | number | boolean =>
          typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean',
      );
      if (values.length === 0) continue; // nothing usable — let caller fall back
      const operator = f.operator === 'NotIn' ? 'NotIn' : 'In';
      out.push(buildBasicFilter(t.table as string, t.column as string, operator, values));
    } else {
      // Hierarchy / advanced / relative-date — pass through as-is.
      out.push(f as unknown as models.IFilter);
    }
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
