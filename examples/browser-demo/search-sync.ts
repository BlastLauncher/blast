/** The attribute surface of a DOM element that `syncAttributes` touches. */
export type AttributeTarget = {
  getAttributeNames(): string[];
  getAttribute(name: string): string | null;
  setAttribute(name: string, value: string): void;
  removeAttribute(name: string): void;
};

/**
 * A redraw keeps the previous control element (focus, caret and IME state live
 * on it) but must still show the new markup's attributes, such as a view's
 * `searchBarPlaceholder`. `value` is the live text, synced separately, and
 * `style` is set at runtime rather than by the markup.
 */
export function syncAttributes(previous: AttributeTarget, next: AttributeTarget): void {
  const keep = new Set(["value", "style"]);
  for (const name of previous.getAttributeNames())
    if (!keep.has(name) && next.getAttribute(name) === null) previous.removeAttribute(name);
  for (const name of next.getAttributeNames()) {
    const value = next.getAttribute(name);
    if (!keep.has(name) && value !== null && previous.getAttribute(name) !== value)
      previous.setAttribute(name, value);
  }
}

/**
 * The text a search field must take from the controller, or undefined to leave
 * the visitor's text alone. `baseline` is the controller's text as of the
 * field's last input or the last sync. Every keystroke reaches the controller
 * in the same task as it changes the field, so the controller's text moves
 * away from `baseline` only when the extension set its `searchText` (and
 * client-core ignores echoes that lag behind typing) or a new view replaced
 * it. Writing only then, and never mid-IME composition, cannot drop a
 * keystroke; a controller that refused an edit leaves `baseline` as it is.
 */
export function controlledSearchText(state: {
  field: string;
  view: string;
  baseline: string;
  composing: boolean;
}): string | undefined {
  if (state.composing || state.field === state.view || state.view === state.baseline)
    return undefined;
  return state.view;
}
