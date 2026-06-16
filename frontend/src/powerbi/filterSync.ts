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
      // column, so a hierarchy filter is rejected. Flatten it to one Basic
      // filter per level (group + leaf) instead.
      out.push(...hierarchyFilterToBasics(f));
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

type Primitive = string | number | boolean;
const isPrimitive = (v: unknown): v is Primitive =>
  typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean';

/**
 * Flattens a hierarchy slicer's state into one Basic filter PER LEVEL so both
 * group-level (e.g. ASG/Other) and leaf-level (Airline Name) selections
 * propagate to value visuals (which only carry individual model columns, not
 * the hierarchy itself).
 *
 * The state is a delta tree: only "touched" nodes appear; anything absent is
 * inherited-selected. So at each level:
 *  - "NotSelected" nodes are explicit exclusions → `NotIn[...]` on that column
 *    (handles "select all, then uncheck some groups/items").
 *  - "Selected" LEAF nodes are explicit inclusions used only when nothing at
 *    that level was excluded → `In[...]` ("select only these").
 *  - "Selected" non-leaf nodes are just containers for child exceptions and add
 *    no constraint of their own.
 * Exclusions win over inclusions at a level. Different levels target different
 * columns, so the resulting Basic filters combine with AND on each visual.
 */
function hierarchyFilterToBasics(f: Record<string, unknown>): models.IBasicFilter[] {
  const targets = f.target as Array<{ table?: string; column?: string }> | undefined;
  if (!Array.isArray(targets) || targets.length === 0) return [];
  const leafDepth = targets.length - 1;

  const includedByDepth = new Map<number, Primitive[]>();
  const excludedByDepth = new Map<number, Primitive[]>();
  const add = (map: Map<number, Primitive[]>, depth: number, v: Primitive) => {
    const arr = map.get(depth);
    if (arr) arr.push(v);
    else map.set(depth, [v]);
  };

  const walk = (nodes: HierarchyNode[] | undefined, depth: number) => {
    if (!Array.isArray(nodes)) return;
    for (const node of nodes) {
      const v = node.value;
      const hasChildren = Array.isArray(node.children) && node.children.length > 0;
      if (isPrimitive(v)) {
        if (node.operator === 'NotSelected') add(excludedByDepth, depth, v);
        else if (node.operator === 'Selected' && depth === leafDepth && !hasChildren) {
          add(includedByDepth, depth, v);
        }
      }
      walk(node.children, depth + 1);
    }
  };
  walk(f.hierarchyData as HierarchyNode[] | undefined, 0);

  const out: models.IBasicFilter[] = [];
  for (let depth = 0; depth < targets.length; depth++) {
    const t = targets[depth];
    if (!t?.table || !t?.column) continue;
    const excluded = excludedByDepth.get(depth) ?? [];
    const included = includedByDepth.get(depth) ?? [];
    if (excluded.length > 0) out.push(buildBasicFilter(t.table, t.column, 'NotIn', excluded));
    else if (included.length > 0) out.push(buildBasicFilter(t.table, t.column, 'In', included));
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
