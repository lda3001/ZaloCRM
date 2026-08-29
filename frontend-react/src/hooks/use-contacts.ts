import { useCallback, useState } from 'react';
import { api } from '../api/client';

export interface Contact {
  id: string;
  fullName: string | null;
  phone: string | null;
  email?: string | null;
  avatarUrl?: string | null;
  source: string | null;
  status: string | null;
  nextAppointment: string | null;
  notes: string | null;
  tags: string[];
  assignedUserId?: string | null;
  assignedUser?: { fullName: string } | null;
  createdAt?: string;
  firstContactDate?: string | null;
}

export interface ContactFilters {
  search: string;
  source: string;
  status: string;
}

export const SOURCE_OPTIONS = [
  { text: 'Facebook', value: 'FB' },
  { text: 'TikTok', value: 'TT' },
  { text: 'Giới thiệu', value: 'GT' },
  { text: 'Cá nhân', value: 'CN' },
];

export const STATUS_OPTIONS = [
  { text: 'Mới', value: 'new' },
  { text: 'Đã liên hệ', value: 'contacted' },
  { text: 'Quan tâm', value: 'interested' },
  { text: 'Chuyển đổi', value: 'converted' },
  { text: 'Mất', value: 'lost' },
];

export type ContactListParams = Partial<ContactFilters> & { page?: number; limit?: number };

/**
 * Port of `use-contacts.ts` from the Vue app. The list fetch accepts optional
 * params so the view can pass the exact values it just set (React state updates
 * are async, unlike Vue's synchronous reactive mutations).
 */
export function useContacts() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [filters, setFilters] = useState<ContactFilters>({ search: '', source: '', status: '' });
  const [pagination, setPagination] = useState({ page: 1, limit: 20 });

  const fetchContacts = useCallback(
    async (params?: ContactListParams) => {
      const merged = { ...filters, ...pagination, ...params };
      setLoading(true);
      setError(null);
      try {
        const res = await api.get('/contacts', {
          params: {
            page: merged.page,
            limit: merged.limit,
            search: merged.search || undefined,
            source: merged.source || undefined,
            status: merged.status || undefined,
          },
        });
        setContacts(res.data.contacts ?? res.data);
        setTotal(res.data.total ?? (res.data.contacts ?? res.data).length);
      } catch (err) {
        console.error('Failed to fetch contacts:', err);
        setError('Không thể tải danh sách khách hàng.');
      } finally {
        setLoading(false);
      }
    },
    [filters, pagination],
  );

  const fetchContact = useCallback(async (id: string): Promise<Contact | null> => {
    try {
      const res = await api.get(`/contacts/${id}`);
      return res.data;
    } catch (err) {
      console.error('Failed to fetch contact:', err);
      return null;
    }
  }, []);

  const createContact = useCallback(
    async (payload: Partial<Contact>): Promise<Contact | null> => {
      setSaving(true);
      try {
        const res = await api.post('/contacts', payload);
        await fetchContacts();
        return res.data;
      } catch (err) {
        console.error('Failed to create contact:', err);
        return null;
      } finally {
        setSaving(false);
      }
    },
    [fetchContacts],
  );

  const updateContact = useCallback(
    async (id: string, payload: Partial<Contact>): Promise<Contact | null> => {
      setSaving(true);
      try {
        const res = await api.put(`/contacts/${id}`, payload);
        setContacts((prev) => {
          const idx = prev.findIndex((c) => c.id === id);
          if (idx === -1) return prev;
          const next = [...prev];
          next[idx] = res.data;
          return next;
        });
        return res.data;
      } catch (err) {
        console.error('Failed to update contact:', err);
        return null;
      } finally {
        setSaving(false);
      }
    },
    [],
  );

  const deleteContact = useCallback(
    async (id: string): Promise<boolean> => {
      setDeleting(true);
      try {
        await api.delete(`/contacts/${id}`);
        await fetchContacts();
        return true;
      } catch (err) {
        console.error('Failed to delete contact:', err);
        return false;
      } finally {
        setDeleting(false);
      }
    },
    [fetchContacts],
  );

  const resetFilters = useCallback(() => {
    const nextFilters: ContactFilters = { search: '', source: '', status: '' };
    setFilters(nextFilters);
    setPagination((p) => ({ ...p, page: 1 }));
    void fetchContacts({ ...nextFilters, page: 1 });
  }, [fetchContacts]);

  return {
    contacts,
    total,
    loading,
    saving,
    deleting,
    error,
    filters,
    setFilters,
    pagination,
    setPagination,
    fetchContacts,
    fetchContact,
    createContact,
    updateContact,
    deleteContact,
    resetFilters,
  };
}
