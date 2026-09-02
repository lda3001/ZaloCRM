import { useCallback, useRef, useState } from 'react';
import { onChatDeleted, onChatMessage, setActiveConversation } from '../services/chat-socket';

export interface SendMessageOptions {
  contentType?: 'text' | 'sticker';
  sticker?: { id: number; catId: number; type: number };
}
import { api } from '../api/client';
import type { Contact } from './use-contacts';


interface ZaloAccount {
  id: string;
  displayName: string | null;
  zaloUid?: string | null;
  avatarUrl?: string | null;
  phone?: string | null;
}

interface ConversationMessage {
  content: string | null;
  contentType: string;
  senderType: string;
  sentAt: string;
  isDeleted: boolean;
}

export interface Conversation {
  id: string;
  threadType: 'user' | 'group';
  contact: Contact | null;
  zaloAccount: ZaloAccount | null;
  lastMessageAt: string | null;
  unreadCount: number;
  isReplied: boolean;
  messages?: ConversationMessage[];
}

export type ConversationTypeFilter = 'all' | 'user' | 'group';

export interface Message {
  id: string;
  content: string | null;
  contentType: string;
  senderType: string;
  senderName: string | null;
  senderUid: string | null;
  sentAt: string;
  isDeleted: boolean;
  zaloMsgId: string | null;
}


/**
 * Port of `use-chat.ts` from the Vue app, including the Socket.IO live-update
 * flow. `fetchConversations` reads the current search/account filter from refs
 * so it stays stable (the socket handler is attached once and always refreshes
 * with the latest filters). The socket listener closures read refs too, so they
 * always see the currently selected conversation.
 */
export function useChat() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConvId, setSelectedConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingConvs, setLoadingConvs] = useState(false);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [sendingMsg, setSendingMsg] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [accountFilter, setAccountFilter] = useState<string | null>(null);
  const [threadFilter, setThreadFilter] = useState<ConversationTypeFilter>('all');

  const selectedConvIdRef = useRef<string | null>(null);
  selectedConvIdRef.current = selectedConvId;
  const messageAbortRef = useRef<AbortController | null>(null);
  const messageRequestSeqRef = useRef(0);

  const searchQueryRef = useRef(searchQuery);
  searchQueryRef.current = searchQuery;
  const accountFilterRef = useRef(accountFilter);
  accountFilterRef.current = accountFilter;
  const threadFilterRef = useRef(threadFilter);
  threadFilterRef.current = threadFilter;

  const selectedConv =
    conversations.find((c) => c.id === selectedConvId) ?? null;

  const fetchConversations = useCallback(async () => {
    setLoadingConvs(true);
    try {
      const res = await api.get('/conversations', {
        params: {
          limit: 100,
          search: searchQueryRef.current,
          accountId: accountFilterRef.current || undefined,
          threadType: threadFilterRef.current === 'all' ? undefined : threadFilterRef.current,
        },
      });
      setConversations((prev) => {
        const next = res.data.conversations as Conversation[];
        const selected = prev.find(
          (conversation) => conversation.id === selectedConvIdRef.current,
        );
        const selectedMatchesFilter = selected
          && (threadFilterRef.current === 'all' || selected.threadType === threadFilterRef.current);
        if (selectedMatchesFilter && !next.some((conversation) => conversation.id === selected.id)) {
          return [selected, ...next];
        }
        return next;
      });
    } catch (err) {
      console.error('Failed to fetch conversations:', err);
    } finally {
      setLoadingConvs(false);
    }
  }, []);

  const fetchMessages = useCallback(async (convId: string) => {
    messageAbortRef.current?.abort();
    const controller = new AbortController();
    messageAbortRef.current = controller;
    const requestSeq = ++messageRequestSeqRef.current;
    setLoadingMsgs(true);
    try {
      const res = await api.get(`/conversations/${convId}/messages`, {
        params: { limit: 200 },
        signal: controller.signal,
      });
      if (
        requestSeq === messageRequestSeqRef.current
        && selectedConvIdRef.current === convId
      ) {
        setMessages(res.data.messages);
      }
    } catch (err: any) {
      if (err?.code === 'ERR_CANCELED' || controller.signal.aborted) return;
      console.error('Failed to fetch messages:', err);
    } finally {
      if (requestSeq === messageRequestSeqRef.current) setLoadingMsgs(false);
    }
  }, []);

  const selectConversation = useCallback(
    async (convId: string) => {
      const changedConversation = selectedConvIdRef.current !== convId;
      selectedConvIdRef.current = convId;
      setSelectedConvId(convId);
      setActiveConversation(convId);
      if (changedConversation) setMessages([]);
      await fetchMessages(convId);
      // Fetch full conversation detail to populate contact CRM fields.
      try {
        const convDetail = await api.get(`/conversations/${convId}`);
        setConversations((prev) => {
          const detail = convDetail.data as Conversation;
          const exists = prev.some((conversation) => conversation.id === convId);
          if (!exists) return [detail, ...prev];
          return prev.map((conversation) =>
            conversation.id === convId ? { ...conversation, ...detail } : conversation,
          );
        });
      } catch {
        // Non-critical — panel will show partial data from list.
      }
      // Mark as read.
      try {
        await api.post(`/conversations/${convId}/mark-read`);
        setConversations((prev) =>
          prev.map((c) => (c.id === convId ? { ...c, unreadCount: 0 } : c)),
        );
      } catch {
        // Ignore mark-read errors.
      }
    },
    [fetchMessages],
  );

  const sendMessage = useCallback(async (content: string, opts?: SendMessageOptions) => {
    if (!selectedConvIdRef.current) return;
    if (opts?.contentType !== 'sticker' && !content.trim()) return;
    setSendingMsg(true);
    try {
      const res = await api.post(`/conversations/${selectedConvIdRef.current}/messages`, {
        content: opts?.contentType === 'sticker' ? '' : content,
        contentType: opts?.contentType ?? 'text',
        sticker: opts?.contentType === 'sticker' ? opts.sticker : undefined,
      });
      setMessages((prev) =>
        prev.some((m) => m.id === res.data.id) ? prev : [...prev, res.data],
      );
    } catch (err) {
      console.error('Failed to send message:', err);
    } finally {
      setSendingMsg(false);
    }
  }, []);

  const sendAttachments = useCallback(async (files: File[], caption?: string): Promise<boolean> => {
    if (!selectedConvIdRef.current || files.length === 0) return false;
    setSendingMsg(true);
    try {
      const form = new FormData();
      for (const file of files) form.append('files', file, file.name);
      if (caption?.trim()) form.append('caption', caption.trim());
      const res = await api.post(
        `/conversations/${selectedConvIdRef.current}/attachments`,
        form,
        { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 180000 },
      );
      const sent = (res.data?.messages ?? []) as Message[];
      setMessages((prev) => {
        const existing = new Set(prev.map((m) => m.id));
        return [...prev, ...sent.filter((m) => !existing.has(m.id))];
      });
      void fetchConversations();
      return true;
    } catch (err) {
      console.error('Failed to send attachments:', err);
      return false;
    } finally {
      setSendingMsg(false);
    }
  }, [fetchConversations]);

  const initSocket = useCallback(() => {
    const onMsg = (data: { message: Message; conversationId: string }) => {
      // Add to messages if viewing this conversation (dedupe by id — the
      // sender also receives the socket echo of its own outgoing message).
      if (data.conversationId === selectedConvIdRef.current) {
        setMessages((prev) =>
          prev.some((m) => m.id === data.message.id) ? prev : [...prev, data.message],
        );
      }
      // Refresh conversation list to update last message / unread count.
      void fetchConversations();
    };

    const onDel = (data: { msgId: string }) => {
      setMessages((prev) =>
        prev.map((m) => (m.zaloMsgId === data.msgId ? { ...m, isDeleted: true } : m)),
      );
    };

    const offMsg = onChatMessage(onMsg);
    const offDel = onChatDeleted(onDel);

    return () => {
      offMsg();
      offDel();
      setActiveConversation(null);
    };
  }, [fetchConversations]);

  const destroySocket = useCallback(() => {
    // Socket now lives at app level (services/chat-socket) — nothing to do here.
  }, []);

  const updateAccountFilter = useCallback((accountId: string | null) => {
    accountFilterRef.current = accountId;
    setAccountFilter(accountId);
  }, []);

  const updateThreadFilter = useCallback((threadType: ConversationTypeFilter) => {
    threadFilterRef.current = threadType;
    setThreadFilter(threadType);
  }, []);

  return {
    conversations,
    selectedConvId,
    selectedConv,
    messages,
    loadingConvs,
    loadingMsgs,
    sendingMsg,
    searchQuery,
    setSearchQuery,
    accountFilter,
    setAccountFilter: updateAccountFilter,
    threadFilter,
    setThreadFilter: updateThreadFilter,
    fetchConversations,
    selectConversation,
    sendMessage,
    sendAttachments,
    initSocket,
    destroySocket,
  };
}
