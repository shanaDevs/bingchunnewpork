type Status = 'active' | 'banned' | 'deleted';

const STYLES: Record<Status, string> = {
  banned:
    'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20',
  deleted:
    'bg-zinc-500/10 text-zinc-600 dark:text-zinc-400 border border-zinc-500/20',
  active:
    'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20',
};

const LABELS: Record<Status, string> = {
  banned: 'Banned',
  deleted: 'Deleted',
  active: 'Active',
};

type Props = {
  isBanned: boolean;
  isDeleted: boolean;
};

export function CustomerAccountStatusBadge({ isBanned, isDeleted }: Props) {
  const status: Status = isBanned ? 'banned' : isDeleted ? 'deleted' : 'active';
  return (
    <span
      className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${STYLES[status]}`}
    >
      {LABELS[status]}
    </span>
  );
}
