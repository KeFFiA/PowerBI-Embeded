import { models } from 'powerbi-client';
import type { SelectedDataPoint } from './types';

/** A minimal view of the embed methods we use for filter sync. */
export interface FilterableEmbed {
  setFilters: (filters: models.IFilter[]) => Promise<void>;
  removeFilters: () => Promise<void>;
}

/**
 * Convert a Power BI `dataSelected` payload into a set of basic "In" filters,
 * one per (table, column) target. This is how we approximate native
 * cross-filtering between SEPARATELY embedded visuals: when the user selects a
 * data point in one visual (or a slicer), we translate that selection into
 * explicit filters and apply them to the sibling visuals.
 *
 * Limitation: this reproduces cross-FILTERING, not native cross-HIGHLIGHTING
 * (the partial fade/darken effect). Native highlighting only exists inside a
 * single report embed (see the 'shared-canvas' strategy).
 */
export function buildFiltersFromDataPoints(dataPoints: SelectedDataPoint[]): models.IFilter[] {
  const byTarget = new Map<string, { target: models.IFilterTarget; values: Set<string | number | boolean> }>();

  for (const dp of dataPoints ?? []) {
    for (const id of dp.identity ?? []) {
      if (id.equals === undefined || id.equals === null) continue;
      const key = JSON.stringify(id.target);
      if (!byTarget.has(key)) byTarget.set(key, { target: id.target, values: new Set() });
      byTarget.get(key)!.values.add(id.equals);
    }
  }

  return Array.from(byTarget.values()).map(({ target, values }) => ({
    $schema: 'https://powerbi.com/product/schema#basic',
    target,
    operator: 'In',
    values: Array.from(values),
    filterType: models.FilterType.Basic,
  }));
}

/** Apply (or clear) a filter set on one embed, swallowing per-visual errors. */
export async function applyFilters(embed: FilterableEmbed, filters: models.IFilter[]): Promise<void> {
  try {
    if (filters.length > 0) {
      await embed.setFilters(filters);
    } else {
      await embed.removeFilters();
    }
  } catch {
    // A visual may legitimately reject a filter whose column it doesn't contain.
    // That's expected when broadcasting one selection to heterogeneous visuals.
  }
}
