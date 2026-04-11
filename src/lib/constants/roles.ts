export const ROLES = {
  SUPER_ADMIN: 'super_admin',
  ADMIN: 'admin',
  WAREHOUSE_WORKER: 'warehouse_worker',
  DRIVER_COURIER: 'driver_courier',
  CLIENT: 'client',
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];

export const ROLE_LABELS: Record<Role, string> = {
  super_admin: 'Суперадмін',
  admin: 'Адмін',
  warehouse_worker: 'Працівник складу',
  driver_courier: 'Водій-кур\'єр',
  client: 'Клієнт',
};

export const ADMIN_ROLES: Role[] = [ROLES.SUPER_ADMIN, ROLES.ADMIN];
export const WORKER_ROLES: Role[] = [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.WAREHOUSE_WORKER, ROLES.DRIVER_COURIER];
