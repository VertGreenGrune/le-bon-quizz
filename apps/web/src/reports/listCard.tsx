import type { GameQuestionReport } from '@lbq/shared';
import { Avatar } from '../components/Avatar';

/** « Liste chrono » (T57) in the report: every item with who found it, then each player's count. */
export function ListDetails({ q }: { q: GameQuestionReport }) {
  const list = q.details.list;
  if (!list) return null;
  const total = list.items.length;
  return (
    <div className="flex flex-col gap-3">
      <ul className="grid gap-1.5 sm:grid-cols-2">
        {list.items.map((item, i) => (
          <li
            key={i}
            className={`flex items-center gap-2 rounded-lg px-3 py-1.5 ${item.finders.length ? 'bg-answer-green/10' : 'bg-answer-red/10'}`}
          >
            <span className="min-w-0 flex-1 truncate font-bold">{item.text}</span>
            {item.finders.length === 0 ? (
              <span className="text-sm text-gray-500">personne</span>
            ) : (
              item.finders.map((p) => <Avatar key={p.id} id={p.avatar} size="xs" />)
            )}
          </li>
        ))}
      </ul>
      <p className="text-sm text-gray-600">
        {list.players.map((p) => `${p.nickname} ${p.found}/${total}`).join(' · ')}
      </p>
    </div>
  );
}
