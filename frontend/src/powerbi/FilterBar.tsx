import { useState } from 'react';
import { usePowerBI } from './PowerBIContext';
import { buildBasicFilter } from './filterSync';
import type { FilterControlConfig } from '../types/dashboard';

interface Props {
  controls: FilterControlConfig[];
}

/**
 * Renders configurable "custom slicers": each control is a row of buttons that
 * apply a Basic In/NotIn filter on a chosen table[column] to every value visual
 * at once. Selection state is local; the active button publishes its filter to
 * the provider's merge model (so it composes with slicers and click-selection).
 */
export function FilterBar({ controls }: Props) {
  if (!controls || controls.length === 0) return null;

  return (
    <div className="filter-bar">
      {controls.map((control) => (
        <FilterControl key={control.id} control={control} />
      ))}
    </div>
  );
}

function FilterControl({ control }: { control: FilterControlConfig }) {
  const { publishFilters } = usePowerBI();
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const sourceId = `control:${control.id}`;

  const onButtonClick = (index: number) => {
    // Toggle the active button off if it's clicked again (when allowed).
    if (activeIndex === index && control.allowToggleOff) {
      setActiveIndex(null);
      publishFilters(sourceId, []);
      return;
    }
    const btn = control.buttons[index];
    const filter = buildBasicFilter(control.table, control.column, btn.operator, btn.values);
    setActiveIndex(index);
    publishFilters(sourceId, [filter]);
  };

  return (
    <div className="filter-control">
      {control.title && <span className="filter-control__title">{control.title}</span>}
      <div className="filter-control__buttons">
        {control.buttons.map((btn, i) => (
          <button
            key={`${btn.label}-${i}`}
            type="button"
            className={`filter-chip${activeIndex === i ? ' filter-chip--active' : ''}`}
            onClick={() => onButtonClick(i)}
            title={`${btn.operator} ${control.table}[${control.column}]: ${btn.values.join(', ')}`}
          >
            {btn.label}
          </button>
        ))}
      </div>
    </div>
  );
}
