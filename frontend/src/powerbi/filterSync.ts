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
    } else if (Array.isArray(target)) {
      // Hierarchy slicer (filterType 9): value visuals only have the leaf
      // column, so a hierarchy filter is rejected. Flatten it to a Basic filter
      // on the leaf column instead.
      const basic = hierarchyFilterToBasic(f);
      if (basic) out.push(basic);
    }
    // Anything else (advanced / relative-date on a field the value visuals may
    // not have) is dropped to avoid poisoning the sibling setFilters call.
  }

  return out;
}

interface HierarchyNode {
  value?: unknown;
  operator?: string;
  children?: HierarchyNode[];
}

/**
 * Flattens a hierarchy slicer's state to a Basic filter on the LEAF column
 * (e.g. Airline Name). Leaf nodes marked "NotSelected" become a `NotIn` filter
 * ("show all except the unchecked"); explicitly "Selected" leaves become `In`.
 * Group-level (non-leaf) selections can't be enumerated to leaf values on the
 * client, so they're ignored — the common per-item check/uncheck flow works.
 */
function hierarchyFilterToBasic(f: Record<string, unknown>): models.IBasicFilter | null {
  const targets = f.target as Array<{ table?: string; column?: string }> | undefined;
  if (!Array.isArray(targets) || targets.length === 0) return null;
  const leaf = targets[targets.length - 1];
  if (!leaf?.table || !leaf?.column) return null;
  const leafDepth = targets.length - 1;

  const included: Array<string | number | boolean> = [];
  const excluded: Array<string | number | boolean> = [];

  const walk = (nodes: HierarchyNode[] | undefined, depth: number) => {
    if (!Array.isArray(nodes)) return;
    for (const node of nodes) {
      const v = node.value;
      const isPrimitive = typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean';
      if (depth === leafDepth && isPrimitive) {
        if (node.operator === 'Selected') included.push(v as string | number | boolean);
        else if (node.operator === 'NotSelected') excluded.push(v as string | number | boolean);
      }
      walk(node.children, depth + 1);
    }
  };
  walk(f.hierarchyData as HierarchyNode[] | undefined, 0);

  // Prefer "all except the unchecked" when exclusions exist (the select-all →
  // uncheck-some case); otherwise an explicit inclusion set.
  if (excluded.length > 0) return buildBasicFilter(leaf.table, leaf.column, 'NotIn', excluded);
  if (included.length > 0) return buildBasicFilter(leaf.table, leaf.column, 'In', included);
  return null;
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
