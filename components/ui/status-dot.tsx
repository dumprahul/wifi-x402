import { cn } from '@/lib/utils';

type Status = 'active' | 'pending' | 'expired' | 'idle';

const colors: Record<Status, string> = {
  active: 'bg-green-400',
  pending: 'bg-yellow-400',
  expired: 'bg-red-400',
  idle: 'bg-white/20',
};

interface StatusDotProps {
  status: Status;
  pulse?: boolean;
  className?: string;
}

export function StatusDot({ status, pulse = false, className }: StatusDotProps) {
  return (
    <span className={cn('relative inline-flex', className)}>
      {pulse && status === 'active' && (
        <span className={cn('absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping', colors[status])} />
      )}
      <span className={cn('relative inline-flex rounded-full w-2 h-2', colors[status])} />
    </span>
  );
}
