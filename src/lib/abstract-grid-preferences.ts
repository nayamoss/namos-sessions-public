export type AbstractGridPreferences = {
  order: string[];
  hidden: string[];
};

export const ABSTRACT_GRID_PREFERENCES_KEY = "sessionboard:abstracts-grid:columns:v1";

export function defaultAbstractGridPreferences(columnKeys: readonly string[]): AbstractGridPreferences {
  return { order: [...columnKeys], hidden: [] };
}

/**
 * Keeps stored preferences forward-compatible when the grid gains or loses a
 * column. Invalid and duplicate values are ignored rather than breaking the
 * organizer's review queue.
 */
export function normalizeAbstractGridPreferences(value: unknown, columnKeys: readonly string[]): AbstractGridPreferences {
  const fallback = defaultAbstractGridPreferences(columnKeys);
  if (!value || typeof value !== "object") return fallback;
  const candidate = value as Partial<AbstractGridPreferences>;
  const allowed = new Set(columnKeys);
  const order = Array.isArray(candidate.order) ? candidate.order.filter((key): key is string => typeof key === "string" && allowed.has(key)) : [];
  const uniqueOrder = [...new Set(order)];
  const hidden = Array.isArray(candidate.hidden) ? [...new Set(candidate.hidden.filter((key): key is string => typeof key === "string" && allowed.has(key)))] : [];
  return { order: [...uniqueOrder, ...columnKeys.filter(key => !uniqueOrder.includes(key))], hidden };
}

export function moveAbstractGridColumn(preferences: AbstractGridPreferences, key: string, direction: -1 | 1): AbstractGridPreferences {
  const index = preferences.order.indexOf(key);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= preferences.order.length) return preferences;
  const order = [...preferences.order];
  [order[index], order[target]] = [order[target], order[index]];
  return { ...preferences, order };
}

export function toggleAbstractGridColumn(preferences: AbstractGridPreferences, key: string): AbstractGridPreferences {
  const hidden = new Set(preferences.hidden);
  if (hidden.has(key)) {
    hidden.delete(key);
  } else if (preferences.order.length > hidden.size + 1) {
    // A table with no columns is neither useful nor accessible.
    hidden.add(key);
  }
  return { ...preferences, hidden: [...hidden] };
}
