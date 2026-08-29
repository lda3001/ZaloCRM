import { useCallback, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { api } from '../api/client';

export interface ZaloAccount {
  id: string;
  displayName: string | null;
  zaloUid: string | null;
  status: string;
  liveStatus?: string;
  phone: string | null;
  sessionData: unknown;
  ownerUserId: string;
  createdAt: string;
}

export function statusColor(status: string): string {
  switch (status) {
    case 'connected':
      return 'success';
    case 'qr_pending':
    case 'connecting':
      return 'warning';
    default:
      return 'error';
  }
}

export function statusText(status: string): string {
  switch (status) {
    case 'connected':
      return 'Đã kết nối';
    case 'qr_pending':
      return 'Chờ QR';
    case 'connecting':
      return 'Đang kết nối...';
    default:
      return 'Ngắt kết nối';
  }
}

/**
 * Port of `use-zalo-accounts.ts` from the Vue app, including the Socket.IO QR
 * login flow. The socket is created lazily in `setupSocket` and disconnected on
 * unmount. Listener closures read `currentLoginAccountIdRef` (a ref) so they
 * always see the latest account id, since they are attached only once.
 */
export function useZaloAccounts() {
  const [accounts, setAccounts] = useState<ZaloAccount[]>([]);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // QR dialog state
  const [showQRDialog, setShowQRDialog] = useState(false);
  const [qrImage, setQrImage] = useState('');
  const [qrScanned, setQrScanned] = useState(false);
  const [scannedName, setScannedName] = useState('');
  const [qrError, setQrError] = useState('');

  const socketRef = useRef<Socket | null>(null);
  const currentLoginAccountIdRef = useRef('');

  const fetchAccounts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get('/zalo-accounts');
      setAccounts(res.data);
    } catch (err) {
      console.error('Failed to fetch accounts:', err);
      setError('Không thể tải danh sách tài khoản Zalo.');
    } finally {
      setLoading(false);
    }
  }, []);

  const addAccount = useCallback(
    async (displayName: string): Promise<boolean> => {
      setAdding(true);
      try {
        await api.post('/zalo-accounts', { displayName: displayName || undefined });
        await fetchAccounts();
        return true;
      } catch (err) {
        console.error('Failed to add account:', err);
        return false;
      } finally {
        setAdding(false);
      }
    },
    [fetchAccounts],
  );

  const loginAccount = useCallback(async (accountId: string) => {
    currentLoginAccountIdRef.current = accountId;
    setQrImage('');
    setQrScanned(false);
    setScannedName('');
    setQrError('');
    setShowQRDialog(true);
    socketRef.current?.emit('zalo:subscribe', { accountId });
    try {
      await api.post(`/zalo-accounts/${accountId}/login`);
    } catch (err) {
      const e = err as { response?: { data?: { error?: string } } };
      setQrError(e.response?.data?.error || 'Không thể bắt đầu đăng nhập');
    }
  }, []);

  const reconnectAccount = useCallback(
    async (accountId: string) => {
      try {
        await api.post(`/zalo-accounts/${accountId}/reconnect`);
        await fetchAccounts();
      } catch (err) {
        console.error('Reconnect failed:', err);
      }
    },
    [fetchAccounts],
  );

  const deleteAccount = useCallback(
    async (account: ZaloAccount): Promise<boolean> => {
      setDeleting(true);
      try {
        await api.delete(`/zalo-accounts/${account.id}`);
        await fetchAccounts();
        return true;
      } catch (err) {
        console.error('Delete failed:', err);
        return false;
      } finally {
        setDeleting(false);
      }
    },
    [fetchAccounts],
  );

  const cancelQR = useCallback(() => {
    setShowQRDialog(false);
    socketRef.current?.emit('zalo:unsubscribe', { accountId: currentLoginAccountIdRef.current });
  }, []);

  const setupSocket = useCallback(() => {
    const socket = io({ transports: ['websocket', 'polling'] });
    socketRef.current = socket;

    socket.on('zalo:qr', (data: { accountId: string; qrImage: string }) => {
      if (data.accountId === currentLoginAccountIdRef.current) setQrImage(data.qrImage);
    });

    socket.on('zalo:scanned', (data: { accountId: string; displayName: string }) => {
      if (data.accountId === currentLoginAccountIdRef.current) {
        setQrImage('');
        setQrScanned(true);
        setScannedName(data.displayName);
      }
    });

    socket.on('zalo:connected', () => {
      setShowQRDialog(false);
      void fetchAccounts();
    });

    socket.on('zalo:disconnected', () => {
      void fetchAccounts();
    });

    socket.on('zalo:error', (data: { accountId: string; error: string }) => {
      if (data.accountId === currentLoginAccountIdRef.current) setQrError(data.error);
      void fetchAccounts();
    });

    socket.on('zalo:qr-expired', (data: { accountId: string }) => {
      if (data.accountId === currentLoginAccountIdRef.current) {
        setQrImage('');
        setQrError('QR đã hết hạn, đang tạo lại...');
      }
    });

    socket.on('zalo:reconnect-failed', () => {
      void fetchAccounts();
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [fetchAccounts]);

  return {
    accounts,
    loading,
    adding,
    deleting,
    error,
    showQRDialog,
    qrImage,
    qrScanned,
    scannedName,
    qrError,
    statusColor,
    statusText,
    fetchAccounts,
    addAccount,
    loginAccount,
    reconnectAccount,
    deleteAccount,
    cancelQR,
    setupSocket,
  };
}
