const STORAGE_KEY = "shopping-list";
export const SHOPPING_LIST_EVENT = "shopping-list:update";

function hasBrowserStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function safeParse(raw, fallback = []) {
  try {
    return JSON.parse(raw || JSON.stringify(fallback));
  } catch {
    return fallback;
  }
}

function createItemId() {
  return Math.random().toString(36).slice(2, 9);
}

export function readShoppingList() {
  if (!hasBrowserStorage()) return [];
  const raw = window.localStorage.getItem(STORAGE_KEY);
  const parsed = safeParse(raw, []);
  if (!Array.isArray(parsed)) return [];
  return parsed.filter((item) => typeof item?.name === "string");
}

export function persistShoppingList(list, { emitEvent = true } = {}) {
  if (!hasBrowserStorage()) return;
  const safeList = Array.isArray(list) ? list : [];
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(safeList));
    if (emitEvent) {
      window.dispatchEvent(
        new CustomEvent(SHOPPING_LIST_EVENT, { detail: safeList })
      );
    }
  } catch (err) {
    console.error("Failed to persist shopping list", err);
  }
}

export function appendShoppingItems(names = []) {
  const trimmed =
    Array.isArray(names) && names.length
      ? names
          .map((name) =>
            typeof name === "string" ? name.trim() : String(name || "").trim()
          )
          .filter(Boolean)
      : [];

  if (!trimmed.length) {
    return { added: [], list: readShoppingList() };
  }

  const current = readShoppingList();
  const seen = new Set(
    current
      .map((item) => (typeof item?.name === "string" ? item.name.toLowerCase() : ""))
      .filter(Boolean)
  );

  const additions = [];
  for (const name of trimmed) {
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    additions.push({ id: createItemId(), name, done: false });
    seen.add(key);
  }

  if (!additions.length) {
    return { added: [], list: current };
  }

  const next = [...current, ...additions];
  persistShoppingList(next);
  return { added: additions, list: next };
}

