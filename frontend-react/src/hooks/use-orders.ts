import { useCallback, useRef, useState } from 'react';
import { api } from '../api/client';

export interface Order {
  id: string;
  orderCode: string;
  contactId: string;
  contact?: { id: string; fullName: string | null; phone: string | null } | null;
  createdByUserId: string;
  createdBy?: { id: string; fullName: string } | null;
  totalAmount: number;
  status: string;
  notes: string | null;
  conversationId: string | null;
  createdAt: string;
}

export interface OrderStats {
  totalOrders?: number;
  completedOrders?: number;
  totalRevenue?: number;
  todayRevenue?: number;
}

export interface StaffStat {
  userId: string;
  fullName?: string;
  orderCount: number;
  totalRevenue: number;
}

export const ORDER_STATUS_OPTIONS = [
  { text: 'Mới', value: 'new', color: 'grey' },
  { text: 'Đã xác nhận', value: 'confirmed', color: 'blue' },
  { text: 'Đã thanh toán', value: 'paid', color: 'teal' },
  { text: 'Đang giao', value: 'shipped', color: 'indigo' },
  { text: 'Hoàn thành', value: 'completed', color: 'green' },
  { text: 'Đã huỷ', value: 'cancelled', color: 'red' },
];

/**
 * Port of `use-orders.ts` from the Vue app: CRUD, stats, staff performance and
 * status helpers. Same API calls and state shape.
 */
export function useOrders() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [stats, setStats] = useState<OrderStats | null>(null);
  const [staffStats, setStaffStats] = useState<StaffStat[]>([]);
  const [error, setError] = useState<string | null>(null);
  const listRequestRef = useRef(0);

  const fetchOrders = useCallback(async (params: Record<string, string> = {}) => {
    const requestId = ++listRequestRef.current;
    setLoading(true);
    setError(null);
    try {
      const res = await api.get('/orders', { params });
      if (requestId === listRequestRef.current) {
        setOrders(res.data.orders ?? []);
        setTotal(res.data.total ?? 0);
      }
    } catch (err) {
      console.error('Failed to fetch orders:', err);
      if (requestId === listRequestRef.current) {
        setError('Không thể tải danh sách đơn hàng.');
      }
    } finally {
      if (requestId === listRequestRef.current) setLoading(false);
    }
  }, []);

  const createOrder = useCallback(async (data: Partial<Order>) => {
    setSaving(true);
    try {
      const res = await api.post('/orders', data);
      return res.data;
    } catch (err) {
      console.error(err);
      return null;
    } finally {
      setSaving(false);
    }
  }, []);

  const updateOrder = useCallback(async (id: string, data: Partial<Order>) => {
    setSaving(true);
    try {
      const res = await api.put(`/orders/${id}`, data);
      return res.data;
    } catch (err) {
      console.error(err);
      return null;
    } finally {
      setSaving(false);
    }
  }, []);

  const deleteOrder = useCallback(async (id: string): Promise<boolean> => {
    try {
      await api.delete(`/orders/${id}`);
      return true;
    } catch {
      return false;
    }
  }, []);

  const fetchStats = useCallback(async () => {
    try {
      const res = await api.get('/orders/stats');
      setStats(res.data);
    } catch {
      // Stats are non-critical; keep the orders list usable if they fail.
    }
  }, []);

  const fetchStaffStats = useCallback(async () => {
    try {
      const res = await api.get('/orders/by-staff');
      setStaffStats(res.data.staffStats ?? []);
    } catch {
      // Staff stats are non-critical.
    }
  }, []);

  const fetchContactOrders = useCallback(async (contactId: string): Promise<Order[]> => {
    try {
      const res = await api.get(`/contacts/${contactId}/orders`);
      return res.data.orders ?? [];
    } catch {
      return [];
    }
  }, []);

  function statusColor(s: string): string {
    return ORDER_STATUS_OPTIONS.find((o) => o.value === s)?.color ?? 'grey';
  }

  function statusLabel(s: string): string {
    return ORDER_STATUS_OPTIONS.find((o) => o.value === s)?.text ?? s;
  }

  return {
    orders,
    total,
    loading,
    saving,
    stats,
    staffStats,
    error,
    fetchOrders,
    createOrder,
    updateOrder,
    deleteOrder,
    fetchStats,
    fetchStaffStats,
    fetchContactOrders,
    statusColor,
    statusLabel,
  };
}
