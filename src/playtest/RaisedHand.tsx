// The raised hand (stub; drawn in the next work unit).

export function RaisedHand({ onAdult }: { onAdult: () => void }) {
  return <button type="button" className="pp-hand" onClick={onAdult}>✋</button>;
}
