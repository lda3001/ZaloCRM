import { useCallback, useState } from 'react';
import { api } from '../api/client';

export interface Team {
  id: string;
  name: string;
  memberCount?: number;
  createdAt?: string;
}

export interface TeamMember {
  id: string;
  userId: string;
  fullName: string;
  email: string;
  role: string;
}

/**
 * Port of `use-teams.ts` from the Vue app: team CRUD + member management.
 * Same API calls and `{ ok, error }` result shape so the view keeps identical
 * dialog error handling.
 */
export function useTeams() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fetchTeams = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/teams');
      setTeams(res.data.teams ?? res.data);
    } catch (err) {
      const e = err as { response?: { data?: { error?: string } } };
      setError(e.response?.data?.error || 'Lỗi tải danh sách đội nhóm');
    } finally {
      setLoading(false);
    }
  }, []);

  const createTeam = useCallback(
    async (name: string): Promise<{ ok: boolean; error?: string }> => {
      try {
        await api.post('/teams', { name });
        await fetchTeams();
        return { ok: true };
      } catch (err) {
        const e = err as { response?: { data?: { error?: string } } };
        return { ok: false, error: e.response?.data?.error || 'Lỗi tạo đội nhóm' };
      }
    },
    [fetchTeams],
  );

  const updateTeam = useCallback(
    async (id: string, name: string): Promise<{ ok: boolean; error?: string }> => {
      try {
        await api.put(`/teams/${id}`, { name });
        await fetchTeams();
        return { ok: true };
      } catch (err) {
        const e = err as { response?: { data?: { error?: string } } };
        return { ok: false, error: e.response?.data?.error || 'Lỗi cập nhật đội nhóm' };
      }
    },
    [fetchTeams],
  );

  const deleteTeam = useCallback(
    async (id: string): Promise<{ ok: boolean; error?: string }> => {
      try {
        await api.delete(`/teams/${id}`);
        await fetchTeams();
        return { ok: true };
      } catch (err) {
        const e = err as { response?: { data?: { error?: string } } };
        return { ok: false, error: e.response?.data?.error || 'Lỗi xóa đội nhóm' };
      }
    },
    [fetchTeams],
  );

  const fetchMembers = useCallback(async (teamId: string): Promise<TeamMember[]> => {
    try {
      const res = await api.get(`/teams/${teamId}/members`);
      return res.data.members ?? res.data;
    } catch {
      return [];
    }
  }, []);

  const addMember = useCallback(
    async (teamId: string, userId: string): Promise<{ ok: boolean; error?: string }> => {
      try {
        await api.post(`/teams/${teamId}/members`, { userId });
        return { ok: true };
      } catch (err) {
        const e = err as { response?: { data?: { error?: string } } };
        return { ok: false, error: e.response?.data?.error || 'Lỗi thêm thành viên' };
      }
    },
    [],
  );

  const removeMember = useCallback(
    async (teamId: string, userId: string): Promise<{ ok: boolean; error?: string }> => {
      try {
        await api.delete(`/teams/${teamId}/members/${userId}`);
        return { ok: true };
      } catch (err) {
        const e = err as { response?: { data?: { error?: string } } };
        return { ok: false, error: e.response?.data?.error || 'Lỗi xóa thành viên' };
      }
    },
    [],
  );

  return {
    teams,
    loading,
    error,
    fetchTeams,
    createTeam,
    updateTeam,
    deleteTeam,
    fetchMembers,
    addMember,
    removeMember,
  };
}
