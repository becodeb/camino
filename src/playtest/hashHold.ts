// The year's screens move by the URL's hash (`#/1ro/hoja/6/2`, links and
// `location.hash = …`). Inside the playtest they must not leave it: while
// the playtest is on screen it holds the hash. Every change is handed to
// whoever listens (free play's open activity, the wardrobe) and the URL is
// put back at once, so the App keeps showing the playtest, a reload starts
// a new session instead of opening a demo page, and the back button has
// nowhere to go. Nothing listening: the change is simply undone.

let consumer: ((hash: string) => void) | null = null;
let held = false;

/** The playtest holds the hash (the App keeps rendering it whatever the hash says). */
export const holdingHash = () => held;

/** Who hears the next hash changes (null: nobody; they are undone). */
export function setHashConsumer(fn: ((hash: string) => void) | null): void {
  consumer = fn;
}

/** Starts holding the hash where it is now; returns the release. */
export function holdHash(): () => void {
  const home = location.hash;
  const url = () => `${location.pathname}${location.search}${home}`;
  const on = () => {
    const h = location.hash;
    if (h === home) return;
    history.replaceState(history.state, '', url());
    consumer?.(h);
  };
  held = true;
  // capture: before the App's own listener reads the hash
  window.addEventListener('hashchange', on, true);
  return () => {
    held = false;
    consumer = null;
    window.removeEventListener('hashchange', on, true);
  };
}
