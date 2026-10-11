'use client';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

/**
 * ТЗ docx 09.10.26: перед видаленням/перенесенням посилки система «обов'язково
 * повинна перепитати». Власне вікно замість window.confirm — системний діалог на
 * телефоні виглядає чужорідно і блокує сторінку.
 */
export function ConfirmDialog({
  open, title, description, confirmLabel = 'Так', cancelLabel = 'Ні', destructive, busy, onConfirm, onCancel,
}: {
  open: boolean;
  title: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !busy) onCancel(); }}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel} disabled={busy}>{cancelLabel}</Button>
          <Button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={destructive ? 'bg-red-600 hover:bg-red-700 text-white' : undefined}
          >
            {busy ? '…' : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
