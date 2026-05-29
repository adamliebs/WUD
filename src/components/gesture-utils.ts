/**
 * Walk up the DOM from `target`, returning true if any ancestor is a
 * horizontally-scrollable element with content overflowing its width. Used
 * by the pager and back-swipe to bail out when a gesture starts on a
 * native horizontal scroller (live strip, day-picker pills, squad chips),
 * so the inner element gets the gesture instead of the page-level drag.
 *
 * Stops at the boundary node (the draggable container) so we don't escape
 * outside the surface we care about.
 */
export function isInHorizontalScroller(
  target: EventTarget | null,
  boundary: HTMLElement | null,
): boolean {
  let node = target as HTMLElement | null;
  while (node && node !== boundary && node !== document.body) {
    // Cheap fast-path: skip text nodes / non-Element targets.
    if (node.nodeType === 1) {
      const style = window.getComputedStyle(node);
      const overflowX = style.overflowX;
      if (
        (overflowX === 'auto' || overflowX === 'scroll') &&
        node.scrollWidth > node.clientWidth + 1
      ) {
        return true;
      }
    }
    node = node.parentElement;
  }
  return false;
}

/** True if the target is a form control / contenteditable. Drag should never
 *  engage on these — the user is probably typing, not gesturing. */
export function isFormControl(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    target.isContentEditable
  );
}
