import { useCallback, useState } from 'react';
import { api } from '../api/client';

export interface OrgUser {
  id: string;
  email: string;
  fullName: string;
  role: string;
  isActive: boolean;
  teamId: string | null;
  createdAt: string;
  team?: { id: string; name: string } | null;
}

/**
 * Port of `use-users.ts` from the Vue app. The Zalo access dialog only needs
 * `fetchUsers`, but the CRUD helpers are ported too so the hook stays 1:1.
 */
export function useUsers() {
  const [users, setUsers] = useState<OrgUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/users');
      setUsers(res.data.users);
    } catch (err) {
      const e = err as { response?: { data?: { error?: string } } };
      setError(e.response?.data?.error || 'Lỗi tải danh sách nhân viên');
    } finally {
      setLoading(false);
    }
  }, []);

  const createUser = useCallback(
    async (data: {
      email: string;
      fullName: string;
      password: string;
      role: string;
      teamId?: string;
    }): Promise<{ ok: boolean; error?: string }> => {
      try {
        await api.post('/users', data);
        await fetchUsers();
        return { ok: true };
      } catch (err) {
        const e = err as { response?: { data?: { error?: string } } };
        return { ok: false, error: e.response?.data?.error || 'Lỗi tạo nhân viên' };
      }
    },
    [fetchUsers],
  );

  const updateUser = useCallback(
    async (
      id: string,
      data: Partial<{ fullName: string; email: string; role: string; teamId: string; isActive: boolean }>,
    ): Promise<{ ok: boolean; error?: string }> => {
      try {
        await api.put(`/users/${id}`, data);
        await fetchUsers();
        return { ok: true };
      } catch (err) {
        const e = err as { response?: { data?: { error?: string } } };
        return { ok: false, error: e.response?.data?.error || 'Lỗi cập nhật nhân viên' };
      }
    },
    [fetchUsers],
  );

  const resetPassword = useCallback(
    async (id: string, password: string): Promise<{ ok: boolean; error?: string }> => {
      try {
        await api.put(`/users/${id}/password`, { password });
        return { ok: true };
      } catch (err) {
        const e = err as { response?: { data?: { error?: string } } };
        return { ok: false, error: e.response?.data?.error || 'Lỗi đặt lại mật khẩu' };
      }
    },
    [],
  );

  const deleteUser = useCallback(
    async (id: string): Promise<{ ok: boolean; error?: string }> => {
      try {
        await api.delete(`/users/${id}`);
        await fetchUsers();
        return { ok: true };
      } catch (err) {
        const e = err as { response?: { data?: { error?: string } } };
        return { ok: false, error: e.response?.data?.error || 'Lỗi xóa nhân viên' };
      }
    },
    [fetchUsers],
  );

  return { users, loading, error, fetchUsers, createUser, updateUser, resetPassword, deleteUser };
}
