'use client';

import { useParams } from 'next/navigation';
import { OrderForm } from '@/components/client-portal/order-form';

/**
 * ТЗ docx 20.10.26 (Створення посилки Клієнтом): кнопка «Редагувати» — Клієнт змінює
 * будь-які дані свого замовлення, поки його не прийнято до перевезення.
 */
export default function EditOrderPage() {
  const { id } = useParams<{ id: string }>();
  return <OrderForm editId={id} />;
}
