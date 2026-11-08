import Link from 'next/link';
import { Button } from '@/components/ui/button';

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  actionLabel?: string;
  actionHref?: string;
  /** Довільна дія замість кнопки (напр. уніфікована «Створити», ТЗ docx 04.11.26 п.4). */
  action?: React.ReactNode;
}

export function EmptyState({ icon, title, description, actionLabel, actionHref, action }: EmptyStateProps) {
  return (
    <div className="text-center py-12 px-4">
      {icon && <div className="w-16 h-16 mx-auto text-gray-300 mb-3">{icon}</div>}
      <h3 className="text-sm font-medium text-gray-900 mb-1">{title}</h3>
      {description && <p className="text-sm text-gray-500 mb-4">{description}</p>}
      {action}
      {!action && actionLabel && actionHref && (
        <Link href={actionHref}><Button>{actionLabel}</Button></Link>
      )}
    </div>
  );
}
