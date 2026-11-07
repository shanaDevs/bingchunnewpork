import type { ReactNode } from 'react';

type Props = {
  children: ReactNode;
  className?: string;
};

export default function DashboardTabularAmount({ children, className = '' }: Props) {
  return <span className={`font-bold tabular-nums ${className}`.trim()}>{children}</span>;
}
