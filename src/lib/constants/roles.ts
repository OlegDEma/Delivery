export const ROLES = {
  SUPER_ADMIN: 'super_admin',
  ADMIN: 'admin',
  CASHIER: 'cashier',
  WAREHOUSE_WORKER: 'warehouse_worker',
  DRIVER_COURIER: 'driver_courier',
  CLIENT: 'client',
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];

export const ROLE_LABELS: Record<Role, string> = {
  super_admin: 'Суперадмін',
  admin: 'Адмін',
  cashier: 'Касир',
  warehouse_worker: 'Працівник складу',
  driver_courier: 'Водій',
  client: 'Клієнт',
};

// Permission groups — use these across the app for role checks
export const ADMIN_ROLES: Role[] = [ROLES.SUPER_ADMIN, ROLES.ADMIN];

/** Any internal staff (not client). All dashboard access allowed. */
export const STAFF_ROLES: Role[] = [
  ROLES.SUPER_ADMIN,
  ROLES.ADMIN,
  ROLES.CASHIER,
  ROLES.WAREHOUSE_WORKER,
  ROLES.DRIVER_COURIER,
];

/** Can manage money: accept payments, see debts, see cash register */
export const FINANCE_ROLES: Role[] = [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.CASHIER];

/** Can see client database & create/edit parcels */
export const OPERATIONS_ROLES: Role[] = [
  ROLES.SUPER_ADMIN,
  ROLES.ADMIN,
  ROLES.CASHIER,
  ROLES.WAREHOUSE_WORKER,
  ROLES.DRIVER_COURIER,
];

/** Can manage trips, journeys, routes */
export const LOGISTICS_ROLES: Role[] = [
  ROLES.SUPER_ADMIN,
  ROLES.ADMIN,
  ROLES.DRIVER_COURIER,
];

/** Warehouse operations */
export const WAREHOUSE_ROLES: Role[] = [
  ROLES.SUPER_ADMIN,
  ROLES.ADMIN,
  ROLES.WAREHOUSE_WORKER,
];

// Legacy compat
export const WORKER_ROLES: Role[] = STAFF_ROLES;
