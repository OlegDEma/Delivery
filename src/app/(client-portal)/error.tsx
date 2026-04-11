'use client';

import { Button } from '@/components/ui/button';

export default function ClientPortalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-20">
      <div className="text-center">
        <h2 className="text-xl font-bold mb-2">Щось пішло не так</h2>
        <p className="text-sm text-gray-500 mb-4">
          {error.message || 'Невідома помилка'}
        </p>
        <Button onClick={reset}>Спробувати знову</Button>
      </div>
    </div>
  );
}
