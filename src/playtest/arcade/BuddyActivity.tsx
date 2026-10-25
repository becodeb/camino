// T43: "Tu personaje" on 1ro's arcade: the character choice again (the data's
// favourite: tapping the character for its confetti). Tap one: it cheers
// with confetti and becomes the child's character; the arrow (or the bar's
// "volver al menú") goes back. Each pick is logged as `choice` {activity:
// 'buddy', character}.

import { ChoicePage } from '../../screens/WardrobeScreen';
import { usePlaytest } from '../context';

export function BuddyActivity({ back }: { back(): void }) {
  const { log } = usePlaytest();
  return (
    <ChoicePage
      sheet={{ n: 0, say: '', title: 'Tu personaje' }}
      pages={null}
      quit={null}
      title={<b>Tu personaje</b>}
      onPick={(id) => log('choice', { activity: 'buddy', character: id })}
      next={back}
    />
  );
}
