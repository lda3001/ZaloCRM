import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api/client';
import { onChatMessage } from '../services/chat-socket';

const REFRESH_INTERVAL_MS = 60_000;
const SOCKET_REFRESH_DELAY_MS = 200;

export function useUnrepliedCount(): number {
  const [count, setCount] = useState(0);
  const requestSequence = useRef(0);

  const refresh = useCallback(async () => {
    const sequence = ++requestSequence.current;
    try {
      const response = await api.get('/conversations/unreplied-count');
      if (sequence !== requestSequence.current) return;
      const nextCount = Number(response.data?.unrepliedCount ?? 0);
      setCount(Number.isFinite(nextCount) && nextCount > 0 ? nextCount : 0);
    } catch {
      // Keep the last successful value during a temporary network failure.
    }
  }, []);

  useEffect(() => {
    void refresh();

    let socketTimer: number | undefined;
    const scheduleSocketRefresh = () => {
      if (socketTimer !== undefined) window.clearTimeout(socketTimer);
      socketTimer = window.setTimeout(() => void refresh(), SOCKET_REFRESH_DELAY_MS);
    };
    const stopListening = onChatMessage(scheduleSocketRefresh);
    const interval = window.setInterval(() => void refresh(), REFRESH_INTERVAL_MS);
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      stopListening();
      window.clearInterval(interval);
      if (socketTimer !== undefined) window.clearTimeout(socketTimer);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [refresh]);

  return count;
}
