import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api/client';
import {
  onChatDeleted,
  onChatMessage,
  onChatReaction,
  onChatRemoved,
  setFloatingConversationActive,
} from '../services/chat-socket';
import type {
  Message,
  MessageActionKind,
  MessageReaction,
  SendMessageOptions,
  SendMessageResult,
} from './use-chat';

const PAGE_SIZE = 100;

export function useFloatingChat(
  conversationId: string,
  expanded: boolean,
  onConversationChanged?: () => void,
) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasOlder, setHasOlder] = useState(false);
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const [messageActionPending, setMessageActionPending] = useState<Record<string, MessageActionKind>>({});
  const pageRef = useRef(1);
  const mountedRef = useRef(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await api.get(`/conversations/${conversationId}/messages`, {
        params: { page: 1, limit: PAGE_SIZE },
      });
      if (!mountedRef.current) return;
      const next = response.data.messages as Message[];
      pageRef.current = 1;
      setMessages(next);
      setHasOlder(Number(response.data.total ?? next.length) > next.length);
    } catch (err: any) {
      if (mountedRef.current) {
        setError(err?.response?.data?.error || 'Không thể tải tin nhắn.');
      }
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [conversationId]);

  useEffect(() => {
    mountedRef.current = true;
    void refresh();
    return () => {
      mountedRef.current = false;
    };
  }, [refresh]);

  useEffect(() => {
    setFloatingConversationActive(conversationId, expanded);
    if (expanded) {
      void api.post(`/conversations/${conversationId}/mark-read`).then(() => {
        onConversationChanged?.();
      }).catch(() => undefined);
    }
    return () => setFloatingConversationActive(conversationId, false);
  }, [conversationId, expanded, onConversationChanged]);

  useEffect(() => {
    const offMessage = onChatMessage((data) => {
      if (data.conversationId !== conversationId) return;
      setMessages((current) => current.some((message) => message.id === data.message.id)
        ? current.map((message) => message.id === data.message.id ? { ...message, ...data.message } : message)
        : [...current, data.message as Message]);
      if (expanded) {
        void api.post(`/conversations/${conversationId}/mark-read`)
          .then(() => onConversationChanged?.())
          .catch(() => undefined);
      } else {
        onConversationChanged?.();
      }
    });
    const offDeleted = onChatDeleted((data) => {
      if (data.conversationId && data.conversationId !== conversationId) return;
      setMessages((current) => current.map((message) => (
        (data.messageId && message.id === data.messageId) || message.zaloMsgId === data.msgId
          ? { ...message, isDeleted: true }
          : message
      )));
    });
    const offRemoved = onChatRemoved((data) => {
      if (data.conversationId && data.conversationId !== conversationId) return;
      setMessages((current) => current.filter((message) => (
        data.messageId ? message.id !== data.messageId : message.zaloMsgId !== data.msgId
      )));
    });
    const offReaction = onChatReaction((data) => {
      if (data.conversationId && data.conversationId !== conversationId) return;
      setMessages((current) => current.map((message) => (
        (data.messageId && message.id === data.messageId) || message.zaloMsgId === data.msgId
          ? { ...message, reactions: data.reactions as MessageReaction[] }
          : message
      )));
    });
    return () => {
      offMessage();
      offDeleted();
      offRemoved();
      offReaction();
    };
  }, [conversationId, expanded, onConversationChanged]);

  const loadOlder = useCallback(async (): Promise<boolean> => {
    if (loadingOlder || !hasOlder) return false;
    setLoadingOlder(true);
    setError('');
    try {
      const nextPage = pageRef.current + 1;
      const response = await api.get(`/conversations/${conversationId}/messages`, {
        params: { page: nextPage, limit: PAGE_SIZE },
      });
      const older = response.data.messages as Message[];
      setMessages((current) => {
        const existing = new Set(current.map((message) => message.id));
        return [...older.filter((message) => !existing.has(message.id)), ...current];
      });
      pageRef.current = nextPage;
      setHasOlder(nextPage * PAGE_SIZE < Number(response.data.total ?? 0));
      return older.length > 0;
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Không thể tải thêm tin nhắn cũ.');
      return false;
    } finally {
      setLoadingOlder(false);
    }
  }, [conversationId, hasOlder, loadingOlder]);

  const sendMessage = useCallback(async (
    content: string,
    opts?: SendMessageOptions,
  ): Promise<SendMessageResult> => {
    if (opts?.contentType !== 'sticker' && !content.trim()) {
      return { ok: false, error: 'Nội dung tin nhắn trống.' };
    }
    setSending(true);
    try {
      const response = await api.post(`/conversations/${conversationId}/messages`, {
        content: opts?.contentType === 'sticker' ? '' : content,
        contentType: opts?.contentType ?? 'text',
        sticker: opts?.contentType === 'sticker' ? opts.sticker : undefined,
        replyToMessageId: opts?.replyToMessageId,
      });
      setMessages((current) => current.some((message) => message.id === response.data.id)
        ? current
        : [...current, response.data as Message]);
      onConversationChanged?.();
      return { ok: true };
    } catch (err: any) {
      return { ok: false, error: err?.response?.data?.error || 'Gửi tin nhắn thất bại.' };
    } finally {
      setSending(false);
    }
  }, [conversationId, onConversationChanged]);

  const sendAttachments = useCallback(async (
    files: File[],
    caption?: string,
    replyToMessageId?: string,
  ): Promise<boolean> => {
    if (files.length === 0) return false;
    setSending(true);
    try {
      const form = new FormData();
      files.forEach((file) => form.append('files', file, file.name));
      if (caption?.trim()) form.append('caption', caption.trim());
      if (replyToMessageId) form.append('replyToMessageId', replyToMessageId);
      const response = await api.post(`/conversations/${conversationId}/attachments`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 180000,
      });
      const sent = (response.data?.messages ?? []) as Message[];
      setMessages((current) => {
        const existing = new Set(current.map((message) => message.id));
        return [...current, ...sent.filter((message) => !existing.has(message.id))];
      });
      onConversationChanged?.();
      return true;
    } catch {
      return false;
    } finally {
      setSending(false);
    }
  }, [conversationId, onConversationChanged]);

  const runAction = useCallback(async (
    messageId: string,
    kind: MessageActionKind,
    request: () => Promise<Message | void>,
  ): Promise<SendMessageResult> => {
    setMessageActionPending((current) => ({ ...current, [messageId]: kind }));
    try {
      const updated = await request();
      if (kind === 'delete') {
        setMessages((current) => current.filter((message) => message.id !== messageId));
      } else if (updated) {
        setMessages((current) => current.map((message) => (
          message.id === messageId ? { ...message, ...updated } : message
        )));
      }
      onConversationChanged?.();
      return { ok: true };
    } catch (err: any) {
      return { ok: false, error: err?.response?.data?.error || 'Thao tác tin nhắn thất bại.' };
    } finally {
      setMessageActionPending((current) => {
        const next = { ...current };
        delete next[messageId];
        return next;
      });
    }
  }, [onConversationChanged]);

  const deleteMessage = useCallback((messageId: string) => runAction(messageId, 'delete', async () => {
    await api.delete(`/conversations/${conversationId}/messages/${messageId}`);
  }), [conversationId, runAction]);

  const recallMessage = useCallback((messageId: string) => runAction(messageId, 'recall', async () => {
    const response = await api.post(`/conversations/${conversationId}/messages/${messageId}/recall`);
    return { ...(response.data as Message), isDeleted: true };
  }), [conversationId, runAction]);

  const reactToMessage = useCallback((messageId: string, icon: string) => runAction(messageId, 'reaction', async () => {
    const response = await api.put(`/conversations/${conversationId}/messages/${messageId}/reaction`, { icon });
    return response.data as Message;
  }), [conversationId, runAction]);

  const forwardMessage = useCallback(async (messageId: string, targetConversationIds: string[]) => {
    setMessageActionPending((current) => ({ ...current, [messageId]: 'forward' }));
    try {
      const response = await api.post(`/conversations/${conversationId}/messages/${messageId}/forward`, {
        targetConversationIds,
      });
      onConversationChanged?.();
      return {
        ok: true,
        forwarded: Number(response.data?.forwarded || 0),
        failed: Number(response.data?.failed || 0),
      };
    } catch (err: any) {
      return { ok: false, error: err?.response?.data?.error || 'Chuyển tiếp tin nhắn thất bại.' };
    } finally {
      setMessageActionPending((current) => {
        const next = { ...current };
        delete next[messageId];
        return next;
      });
    }
  }, [conversationId, onConversationChanged]);

  return {
    messages,
    loading,
    loadingOlder,
    hasOlder,
    error,
    sending,
    messageActionPending,
    refresh,
    loadOlder,
    sendMessage,
    sendAttachments,
    deleteMessage,
    recallMessage,
    reactToMessage,
    forwardMessage,
  };
}
