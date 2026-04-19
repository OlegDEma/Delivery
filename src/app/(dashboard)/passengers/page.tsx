'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Users2 } from 'lucide-react';

// Пасажири — перевезення людей на рейсах EU↔UA. На мапі функціоналу
// відображаються: всі поточні перевезення, вільні/зайняті місця по рейсу,
// контакти пасажирів, оплата. Повна реалізація потребує нової моделі
// `Passenger` у Prisma + поля `passengerCapacity` на `Trip`. Поки що — stub
// щоб пункт меню був клікабельний.
export default function PassengersPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Пасажири</h1>

      <Card>
        <CardContent className="p-8 text-center">
          <Users2 className="w-12 h-12 mx-auto text-gray-300 mb-3" />
          <h2 className="text-lg font-semibold text-gray-900 mb-1">Розділ у розробці</h2>
          <p className="text-sm text-gray-500 max-w-md mx-auto">
            Тут відображатимуться всі перевезення пасажирів по рейсах: вільні й зайняті
            місця, контакти, точки посадки та висадки, оплата.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
