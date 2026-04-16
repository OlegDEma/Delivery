'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useAuth } from '@/lib/hooks/use-auth';
import { ROLE_LABELS, type Role } from '@/lib/constants/roles';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';

interface UserProfile {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  role: Role;
  isActive: boolean;
  createdAt: string;
}

export default function AdminUsersPage() {
  const { role: currentRole, user: currentUser } = useAuth();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // New user form
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newFullName, setNewFullName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newRole, setNewRole] = useState<Role>('driver_courier');
  const [resetInfo, setResetInfo] = useState<{ userName: string; password: string } | null>(null);

  async function handleResetPassword(userId: string, userName: string) {
    if (!confirm(`Скинути пароль для ${userName}? Буде згенеровано новий пароль.`)) return;
    const res = await fetch(`/api/users/${userId}/reset-password`, { method: 'POST' });
    if (res.ok) {
      const data = await res.json();
      setResetInfo({ userName, password: data.password });
      setTimeout(() => setResetInfo(null), 30000);
    } else {
      const data = await res.json().catch(() => ({}));
      alert('Помилка: ' + (data.error || 'невідома'));
    }
  }

  async function handleToggleActive(userId: string, isActive: boolean) {
    await fetch(`/api/users/${userId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !isActive }),
    });
    fetchUsers();
  }

  async function handleDeleteUser(userId: string) {
    if (!confirm('Видалити цього користувача?')) return;
    await fetch(`/api/users/${userId}`, { method: 'DELETE' });
    fetchUsers();
  }

  async function handleChangeRole(user: UserProfile, newRole: Role) {
    if (newRole === user.role) return;

    // Extra guard for dangerous transitions
    const wasAdmin = user.role === 'super_admin' || user.role === 'admin';
    const becomesLowPriv = !['super_admin', 'admin'].includes(newRole);
    if (wasAdmin && becomesLowPriv) {
      if (!confirm(
        `Ви збираєтесь знизити роль «${user.fullName}» з ${ROLE_LABELS[user.role]} до ${ROLE_LABELS[newRole]}. Цей користувач втратить адміністративні права. Продовжити?`
      )) return;
    } else if (newRole === 'client') {
      if (!confirm(
        `Змінити роль «${user.fullName}» на Клієнт? Він більше не зможе заходити в адмінку, тільки у /my-orders.`
      )) return;
    } else if (newRole === 'super_admin') {
      if (!confirm(
        `Надати «${user.fullName}» роль Суперадмін? Він зможе керувати всіма користувачами, тарифами, імпортом.`
      )) return;
    }

    const res = await fetch(`/api/users/${user.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: newRole }),
    });

    if (res.ok) {
      toast.success(`Роль змінено на «${ROLE_LABELS[newRole]}»`);
      fetchUsers();
    } else {
      const err = await res.json().catch(() => ({}));
      toast.error(err.error || 'Помилка зміни ролі');
    }
  }

  async function fetchUsers() {
    const res = await fetch('/api/users');
    if (res.ok) {
      const data = await res.json();
      setUsers(data);
    }
    setLoading(false);
  }

  useEffect(() => {
    fetchUsers();
  }, []);

  async function handleCreateUser(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSaving(true);

    const res = await fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: newEmail,
        password: newPassword,
        fullName: newFullName,
        phone: newPhone || undefined,
        role: newRole,
      }),
    });

    if (res.ok) {
      setDialogOpen(false);
      setNewEmail('');
      setNewPassword('');
      setNewFullName('');
      setNewPhone('');
      setNewRole('driver_courier');
      fetchUsers();
    } else {
      const data = await res.json();
      setError(data.error || 'Помилка створення');
    }

    setSaving(false);
  }

  const ROLE_LABEL_MAP: Record<string, string> = {
    driver_courier: 'Водій',
    warehouse_worker: 'Працівник складу',
    cashier: 'Касир',
    admin: 'Адмін',
    super_admin: 'Суперадмін',
  };

  if (currentRole !== 'super_admin') {
    return (
      <div className="text-center py-12 text-gray-500">
        Доступ заборонено
      </div>
    );
  }

  return (
    <div>
      {resetInfo && (
        <div className="fixed top-4 right-4 z-50 bg-yellow-50 border border-yellow-300 rounded-lg shadow-lg p-4 max-w-sm">
          <div className="text-sm font-medium text-yellow-900 mb-1">
            Новий пароль для {resetInfo.userName}
          </div>
          <div className="font-mono text-base bg-white border rounded px-2 py-1 select-all break-all">
            {resetInfo.password}
          </div>
          <div className="text-xs text-yellow-700 mt-2">
            Зберігається 30 секунд. Скопіюйте зараз.
          </div>
          <button
            onClick={() => setResetInfo(null)}
            className="mt-2 text-xs text-yellow-800 underline"
          >
            Закрити
          </button>
        </div>
      )}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Користувачі</h1>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger render={<Button>+ Додати</Button>} />
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Новий користувач</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreateUser} className="space-y-4">
              <div className="space-y-2">
                <Label>Email</Label>
                <Input
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Пароль</Label>
                <Input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  minLength={6}
                />
              </div>
              <div className="space-y-2">
                <Label>ПІБ</Label>
                <Input
                  value={newFullName}
                  onChange={(e) => setNewFullName(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Телефон</Label>
                <Input
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                  placeholder="+380..."
                />
              </div>
              <div className="space-y-2">
                <Label>Роль</Label>
                <Select value={newRole} onValueChange={(v) => setNewRole((v ?? '') as Role)}>
                  <SelectTrigger>
                    <SelectValue>{ROLE_LABEL_MAP[newRole]}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="driver_courier">Водій</SelectItem>
                    <SelectItem value="warehouse_worker">Працівник складу</SelectItem>
                    <SelectItem value="cashier">Касир</SelectItem>
                    <SelectItem value="admin">Адмін</SelectItem>
                    <SelectItem value="super_admin">Суперадмін</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <Button type="submit" className="w-full" disabled={saving}>
                {saving ? 'Створення...' : 'Створити'}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-500">Завантаження...</div>
      ) : (
        <div className="bg-white rounded-lg border overflow-hidden">
          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">ПІБ</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Email</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Телефон</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Роль</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Статус</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Дії</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {users.map((u) => (
                  <tr key={u.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium">{u.fullName}</td>
                    <td className="px-4 py-3 text-gray-600">{u.email}</td>
                    <td className="px-4 py-3 text-gray-600">{u.phone || '—'}</td>
                    <td className="px-4 py-3">
                      {currentUser?.id === u.id ? (
                        <Badge variant="secondary" title="Не можна змінити свою роль">
                          {ROLE_LABELS[u.role]} (Ви)
                        </Badge>
                      ) : (
                        <Select
                          value={u.role}
                          onValueChange={(v) => handleChangeRole(u, (v ?? u.role) as Role)}
                        >
                          <SelectTrigger className="h-8 w-[170px]">
                            <SelectValue>{ROLE_LABELS[u.role]}</SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="client">Клієнт</SelectItem>
                            <SelectItem value="driver_courier">Водій</SelectItem>
                            <SelectItem value="warehouse_worker">Працівник складу</SelectItem>
                            <SelectItem value="cashier">Касир</SelectItem>
                            <SelectItem value="admin">Адмін</SelectItem>
                            <SelectItem value="super_admin">Суперадмін</SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={u.isActive ? 'default' : 'destructive'}>
                        {u.isActive ? 'Активний' : 'Заблокований'}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        {currentUser?.id !== u.id && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleToggleActive(u.id, u.isActive)}
                            className="text-xs"
                          >
                            {u.isActive ? 'Блок.' : 'Розблок.'}
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleResetPassword(u.id, u.fullName)}
                          className="text-xs"
                        >
                          Скинути пароль
                        </Button>
                        {currentUser?.id !== u.id && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteUser(u.id)}
                            className="text-xs text-red-500 hover:text-red-700"
                          >
                            Видалити
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden divide-y">
            {users.map((u) => (
              <div key={u.id} className="p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium">{u.fullName}</div>
                    <div className="text-sm text-gray-500 truncate">{u.email}</div>
                    {u.phone && <div className="text-sm text-gray-500">{u.phone}</div>}
                  </div>
                  <Badge variant={u.isActive ? 'default' : 'destructive'} className="shrink-0">
                    {u.isActive ? 'Активний' : 'Заблок.'}
                  </Badge>
                </div>
                <div>
                  <Label className="text-xs text-gray-500">Роль</Label>
                  {currentUser?.id === u.id ? (
                    <div className="text-sm">
                      <Badge variant="secondary">{ROLE_LABELS[u.role]} (Ви)</Badge>
                    </div>
                  ) : (
                    <Select
                      value={u.role}
                      onValueChange={(v) => handleChangeRole(u, (v ?? u.role) as Role)}
                    >
                      <SelectTrigger className="h-9 w-full">
                        <SelectValue>{ROLE_LABELS[u.role]}</SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="client">Клієнт</SelectItem>
                        <SelectItem value="driver_courier">Водій</SelectItem>
                        <SelectItem value="warehouse_worker">Працівник складу</SelectItem>
                        <SelectItem value="cashier">Касир</SelectItem>
                        <SelectItem value="admin">Адмін</SelectItem>
                        <SelectItem value="super_admin">Суперадмін</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                </div>
                <div className="flex flex-wrap gap-1 pt-1">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleToggleActive(u.id, u.isActive)}
                    className="text-xs h-8"
                  >
                    {u.isActive ? 'Заблокувати' : 'Розблокувати'}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleResetPassword(u.id, u.fullName)}
                    className="text-xs h-8"
                  >
                    Скинути пароль
                  </Button>
                  {currentUser?.id !== u.id && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDeleteUser(u.id)}
                      className="text-xs h-8 text-red-500 hover:text-red-700"
                    >
                      Видалити
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {users.length === 0 && (
            <div className="text-center py-8 text-gray-500">Немає користувачів</div>
          )}
        </div>
      )}
    </div>
  );
}
