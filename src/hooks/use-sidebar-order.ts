import { useState } from "react";

const STORAGE_KEY = "bot_sidebar_order";

function readSavedOrder(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

// Persists a user's custom sidebar menu order (by nav `to` path) in localStorage,
// same pattern as use-layout-settings.ts. Newly added/visible menu items that
// aren't in the saved order yet are appended at the end, so the sidebar never
// drops an item just because it predates the user's last reorder.
export function useSidebarOrder(currentKeys: string[]) {
  const [savedOrder, setSavedOrder] = useState<string[]>(readSavedOrder);

  const known = savedOrder.filter((key) => currentKeys.includes(key));
  const rest = currentKeys.filter((key) => !known.includes(key));
  const orderedKeys = [...known, ...rest];

  const reorder = (newOrderedKeys: string[]) => {
    setSavedOrder(newOrderedKeys);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newOrderedKeys));
    } catch {
      // storage full/unavailable — ignore, order just won't persist
    }
  };

  return { orderedKeys, reorder };
}
