// Whether one of the adult's sheets (the corner menu, the help panel) is
// open: the goodbye does not start the next session under the adult's hands.

let open = 0;

export const adultSheetOpen = () => open > 0;

/** Marks a sheet open until the returned function is called. */
export function holdAdultSheet(): () => void {
  open++;
  let done = false;
  return () => { if (!done) { done = true; open--; } };
}
