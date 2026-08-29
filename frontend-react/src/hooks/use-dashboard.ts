import { useCallback, useState } from 'react';
import { api } from '../api/client';

export interface KpiData {
  messagesToday: number;
  messagesUnreplied: number;
  messagesUnread: number;
  appointmentsToday: number;
  newContactsThisWeek: number;
  totalContacts: number;
}

export interface MessageVolumeItem {
  date: string;
  sent: number;
  received: number;
}

export interface PipelineItem {
  status: string | null;
  _count: { _all: number } | number;
}

export interface SourceItem {
  source: string;
  _count: { _all: number } | number;
}

export interface AppointmentStatusItem {
  status: string;
  _count: { _all: number } | number;
}

export interface OrderStats {
  totalOrders?: number;
  todayRevenue?: number;
}

/**
 * Port of `use-dashboard.ts` from the Vue app. Same API calls, same state shape,
 * plus an `error` flag for the view's error state.
 */
export function useDashboard() {
  const [kpi, setKpi] = useState<KpiData | null>(null);
  const [messageVolume, setMessageVolume] = useState<MessageVolumeItem[]>([]);
  const [pipeline, setPipeline] = useState<PipelineItem[]>([]);
  const [sources, setSources] = useState<SourceItem[]>([]);
  const [appointments, setAppointments] = useState<AppointmentStatusItem[]>([]);
  const [orderStats, setOrderStats] = useState<OrderStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchOrderStats = useCallback(async () => {
    try {
      const res = await api.get('/orders/stats');
      setOrderStats(res.data);
    } catch {
      // Order stats are non-critical; keep the dashboard usable if they fail.
    }
  }, []);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [kpiRes, volRes, pipRes, srcRes, aptRes] = await Promise.all([
        api.get('/dashboard/kpi'),
        api.get('/dashboard/message-volume'),
        api.get('/dashboard/pipeline'),
        api.get('/dashboard/sources'),
        api.get('/dashboard/appointments'),
      ]);
      setKpi(kpiRes.data);
      setMessageVolume(volRes.data.data || volRes.data);
      setPipeline(pipRes.data);
      setSources(srcRes.data);
      setAppointments(aptRes.data);
      await fetchOrderStats();
    } catch (err) {
      console.error('Dashboard fetch error:', err);
      setError('Không thể tải dữ liệu tổng quan. Vui lòng thử lại.');
    } finally {
      setLoading(false);
    }
  }, [fetchOrderStats]);

  return {
    kpi,
    messageVolume,
    pipeline,
    sources,
    appointments,
    orderStats,
    loading,
    error,
    fetchAll,
    fetchOrderStats,
  };
}
