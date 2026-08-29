import { useCallback, useState } from 'react';
import { api } from '../api/client';

export interface Appointment {
  id: string;
  contactId: string;
  contact?: { id: string; fullName: string | null; phone: string | null } | null;
  appointmentDate: string;
  appointmentTime: string;
  type: string;
  status: string;
  notes: string | null;
  createdAt: string;
}

export interface AppointmentFilters {
  from: string;
  to: string;
  status: string;
  contactId: string;
}

export const APPOINTMENT_STATUS_OPTIONS = [
  { text: 'Đã lên lịch', value: 'scheduled' },
  { text: 'Hoàn thành', value: 'completed' },
  { text: 'Đã huỷ', value: 'cancelled' },
  { text: 'Vắng mặt', value: 'no_show' },
];

export const APPOINTMENT_TYPE_OPTIONS = [
  { text: 'Tái khám', value: 'follow_up' },
  { text: 'Khám mới', value: 'new_visit' },
  { text: 'Tư vấn', value: 'consultation' },
  { text: 'Khác', value: 'other' },
];

export function statusLabel(status: string): string {
  return APPOINTMENT_STATUS_OPTIONS.find((o) => o.value === status)?.text ?? status;
}

/**
 * Port of `use-appointments.ts` from the Vue app. `fetchAppointments` accepts
 * optional params so the view can pass the exact filter values it just set
 * (React state updates are async, unlike Vue's synchronous reactive mutations).
 */
export function useAppointments() {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [todayAppointments, setTodayAppointments] = useState<Appointment[]>([]);
  const [upcomingAppointments, setUpcomingAppointments] = useState<Appointment[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [filters, setFilters] = useState<AppointmentFilters>({
    from: '',
    to: '',
    status: '',
    contactId: '',
  });

  const fetchAppointments = useCallback(
    async (params?: Partial<AppointmentFilters>) => {
      const merged = { ...filters, ...params };
      setLoading(true);
      setError(null);
      try {
        const res = await api.get('/appointments', {
          params: {
            dateFrom: merged.from || undefined,
            dateTo: merged.to || undefined,
            status: merged.status || undefined,
            contactId: merged.contactId || undefined,
          },
        });
        const list = res.data.appointments ?? res.data;
        setAppointments(list);
        setTotal(res.data.total ?? list.length);
      } catch (err) {
        console.error('Failed to fetch appointments:', err);
        setError('Không thể tải danh sách lịch hẹn.');
      } finally {
        setLoading(false);
      }
    },
    [filters],
  );

  const fetchToday = useCallback(async () => {
    try {
      const res = await api.get('/appointments/today');
      setTodayAppointments(res.data.appointments ?? res.data);
    } catch (err) {
      console.error('Failed to fetch today appointments:', err);
    }
  }, []);

  const fetchUpcoming = useCallback(async () => {
    try {
      const res = await api.get('/appointments/upcoming');
      setUpcomingAppointments(res.data.appointments ?? res.data);
    } catch (err) {
      console.error('Failed to fetch upcoming appointments:', err);
    }
  }, []);

  const createAppointment = useCallback(
    async (payload: Partial<Appointment>): Promise<Appointment | null> => {
      setSaving(true);
      try {
        const res = await api.post('/appointments', payload);
        return res.data;
      } catch (err) {
        console.error('Failed to create appointment:', err);
        return null;
      } finally {
        setSaving(false);
      }
    },
    [],
  );

  const updateAppointment = useCallback(
    async (id: string, payload: Partial<Appointment>): Promise<boolean> => {
      setSaving(true);
      try {
        await api.put(`/appointments/${id}`, payload);
        setAppointments((prev) => prev.map((a) => (a.id === id ? { ...a, ...payload } : a)));
        return true;
      } catch (err) {
        console.error('Failed to update appointment:', err);
        return false;
      } finally {
        setSaving(false);
      }
    },
    [],
  );

  const deleteAppointment = useCallback(async (id: string): Promise<boolean> => {
    setDeleting(true);
    try {
      await api.delete(`/appointments/${id}`);
      setAppointments((prev) => prev.filter((a) => a.id !== id));
      return true;
    } catch (err) {
      console.error('Failed to delete appointment:', err);
      return false;
    } finally {
      setDeleting(false);
    }
  }, []);

  const markComplete = useCallback(
    (id: string): Promise<boolean> => updateAppointment(id, { status: 'completed' }),
    [updateAppointment],
  );

  const cancelAppointment = useCallback(
    (id: string): Promise<boolean> => updateAppointment(id, { status: 'cancelled' }),
    [updateAppointment],
  );

  return {
    appointments,
    todayAppointments,
    upcomingAppointments,
    total,
    loading,
    saving,
    deleting,
    error,
    filters,
    setFilters,
    fetchAppointments,
    fetchToday,
    fetchUpcoming,
    createAppointment,
    updateAppointment,
    deleteAppointment,
    markComplete,
    cancelAppointment,
  };
}
