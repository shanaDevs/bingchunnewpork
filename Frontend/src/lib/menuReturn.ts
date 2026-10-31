/**
 * Remembers which product was opened from the menu so "Back to Menu" can use history
 * and restore scroll position.
 */
const KEY = 'bingchun:menu-return';

export function markMenuReturn(productId: string) {
  try {
    window.sessionStorage.setItem(KEY, productId);
  } catch {
    // Storage unavailable: Back to Menu links to /menu.
  }
}

export function clearMenuReturn() {
  try {
    window.sessionStorage.removeItem(KEY);
  } catch {
    // Nothing stored.
  }
}

export function cameFromMenu(productId: string) {
  try {
    return window.sessionStorage.getItem(KEY) === productId && window.history.length > 1;
  } catch {
    return false;
  }
}
