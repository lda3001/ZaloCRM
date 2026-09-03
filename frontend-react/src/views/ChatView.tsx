import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import ConversationList from '../components/chat/ConversationList';
import MessageThread from '../components/chat/MessageThread';
import ChatContactPanel from '../components/chat/ChatContactPanel';
import ChatGroupPanel from '../components/chat/ChatGroupPanel';
import { useChat } from '../hooks/use-chat';
import {
  ensureNotificationPermission,
  isNotificationEnabled,
  OPEN_CHAT_EVENT,
  PENDING_CONV_KEY,
} from '../utils/desktop-notify';

function readWidth(key: string, fallback: number): number {
  const v = parseInt(localStorage.getItem(key) || '', 10);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

export default function ChatView() {
  const [searchParams, setSearchParams] = useSearchParams();
  const {
    conversations,
    selectedConvId,
    selectedConv,
    messages,
    loadingConvs,
    loadingMsgs,
    sendingMsg,
    searchQuery,
    setSearchQuery,
    setAccountFilter,
    threadFilter,
    setThreadFilter,
    fetchConversations,
    selectConversation,
    sendMessage,
    sendAttachments,
    initSocket,
  } = useChat();

  const [showContactPanel, setShowContactPanel] = useState(
    () => !window.matchMedia('(max-width: 1100px)').matches,
  );

  // Resizable panel widths (restored from localStorage — same keys as Vue).
  const [leftWidth, setLeftWidth] = useState(() => readWidth('chat-left-width', 320));
  const [rightWidth, setRightWidth] = useState(() => readWidth('chat-right-width', 320));
  const leftWidthRef = useRef(leftWidth);
  const rightWidthRef = useRef(rightWidth);

  // Mobile: list OR thread (desktop always shows both).
  const [isMobile, setIsMobile] = useState(
    () => window.matchMedia('(max-width: 768px)').matches,
  );
  const [mobileView, setMobileView] = useState<'list' | 'thread'>('list');

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)');
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  function startResize(panel: 'left' | 'right', e: React.MouseEvent) {
    const startX = e.clientX;
    const startWidth = panel === 'left' ? leftWidth : rightWidth;

    const onResize = (ev: MouseEvent) => {
      const diff = ev.clientX - startX;
      if (panel === 'left') {
        const w = Math.max(200, Math.min(500, startWidth + diff));
        leftWidthRef.current = w;
        setLeftWidth(w);
      } else {
        const w = Math.max(250, Math.min(500, startWidth - diff));
        rightWidthRef.current = w;
        setRightWidth(w);
      }
    };

    const stopResize = () => {
      localStorage.setItem('chat-left-width', String(leftWidthRef.current));
      localStorage.setItem('chat-right-width', String(rightWidthRef.current));
      document.removeEventListener('mousemove', onResize);
      document.removeEventListener('mouseup', stopResize);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.addEventListener('mousemove', onResize);
    document.addEventListener('mouseup', stopResize);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }

  useEffect(() => {
    void fetchConversations();
    return initSocket();
  }, [fetchConversations, initSocket]);

  // Ask for desktop-notification permission the first time the chat screen
  // opens (skipped when the user has disabled notifications).
  useEffect(() => {
    if (isNotificationEnabled()) void ensureNotificationPermission();
  }, []);

  // Notification click while already on /chat: open the exact conversation.
  useEffect(() => {
    const openHandler = (e: Event) => {
      const detail = (e as CustomEvent<{ conversationId?: string }>).detail;
      if (detail?.conversationId) void selectConversation(detail.conversationId);
      if (isMobile) setMobileView('thread');
    };
    window.addEventListener(OPEN_CHAT_EVENT, openHandler);
    return () => window.removeEventListener(OPEN_CHAT_EVENT, openHandler);
  }, [selectConversation, isMobile]);

  // Open a conversation passed by navigation. Session storage remains a
  // fallback for desktop-notification environments that drop URL state. The
  // query parameter is consumed once; leaving it in the URL would reopen the
  // notification conversation whenever the user selects a different chat.
  useEffect(() => {
    const queryConversation = searchParams.get('conversation');
    let pending = queryConversation;
    try {
      pending ||= sessionStorage.getItem(PENDING_CONV_KEY);
      if (pending) sessionStorage.removeItem(PENDING_CONV_KEY);
    } catch {
      // Ignore storage errors.
    }
    if (pending) {
      void selectConversation(pending);
      if (isMobile) setMobileView('thread');
    }
    if (queryConversation) {
      const nextParams = new URLSearchParams(searchParams);
      nextParams.delete('conversation');
      setSearchParams(nextParams, { replace: true });
    }
  }, [searchParams, setSearchParams, selectConversation, isMobile]);

  // Debounced search (300ms), mirroring the Vue watch on searchQuery.
  const firstSearchRun = useRef(true);
  useEffect(() => {
    if (firstSearchRun.current) {
      firstSearchRun.current = false;
      return;
    }
    const t = window.setTimeout(() => void fetchConversations(), 300);
    return () => window.clearTimeout(t);
  }, [searchQuery, fetchConversations]);

  function handleFilterAccount(id: string | null) {
    setAccountFilter(id);
    void fetchConversations();
  }

  function handleFilterThread(threadType: 'all' | 'user' | 'group') {
    setThreadFilter(threadType);
    void fetchConversations();
  }

  function handleSelect(id: string) {
    void selectConversation(id);
    if (isMobile) setMobileView('thread');
  }

  function handleSaved() {
    void fetchConversations();
  }

  const leftPanelVisible = isMobile ? mobileView === 'list' : true;
  const threadVisible = isMobile ? mobileView === 'thread' : true;

  return (
    <div className="chat-workspace -m-6 flex h-[calc(100vh-56px)]">
      {/* Conversation list — resizable */}
      {leftPanelVisible && (
        <aside
          className="chat-list-shell relative flex shrink-0 flex-col border-r border-default"
          style={{ width: isMobile ? '100%' : `${leftWidth}px` }}
        >
          <ConversationList
            conversations={conversations}
            selectedId={selectedConvId}
            loading={loadingConvs}
            search={searchQuery}
            threadFilter={threadFilter}
            onSearchChange={setSearchQuery}
            onSelect={handleSelect}
            onFilterAccount={handleFilterAccount}
            onFilterThread={handleFilterThread}
          />
          {!isMobile && (
            <div
              className="absolute top-0 right-[-2px] z-10 h-full w-[5px] cursor-col-resize bg-transparent transition-colors hover:bg-primary/30"
              onMouseDown={(e) => startResize('left', e)}
            />
          )}
        </aside>
      )}

      {/* Message thread — flexible center */}
      {threadVisible && (
        <section className="flex min-w-[300px] flex-1 flex-col" style={{ minWidth: isMobile ? 0 : 300 }}>
          <MessageThread
            conversation={selectedConv}
            messages={messages}
            loading={loadingMsgs}
            sending={sendingMsg}
            showContactPanel={showContactPanel}
            onSend={sendMessage}
            onSendFiles={sendAttachments}
            onToggleContactPanel={() => setShowContactPanel((v) => !v)}
            onOpenContactPanel={() => setShowContactPanel(true)}
            onOpenConversation={(conversationId) => {
              void fetchConversations();
              void selectConversation(conversationId);
              if (isMobile) setMobileView('thread');
            }}
            onRefreshMessages={() => {
              if (selectedConvId) void selectConversation(selectedConvId);
            }}
            onBack={isMobile ? () => setMobileView('list') : undefined}
          />
        </section>
      )}

      {/* Contact panel — resizable (desktop only) */}
      {showContactPanel && selectedConv && !isMobile && (
        <aside
          className="chat-contact-shell relative flex shrink-0 flex-col border-l border-default"
          style={{ width: `${rightWidth}px` }}
        >
          <div
            className="absolute top-0 left-[-2px] z-10 h-full w-[5px] cursor-col-resize bg-transparent transition-colors hover:bg-primary/30"
            onMouseDown={(e) => startResize('right', e)}
          />
          {selectedConv.threadType === 'group' ? (
            <ChatGroupPanel
              conversation={selectedConv}
              onClose={() => setShowContactPanel(false)}
            />
          ) : selectedConv.contact ? (
            <ChatContactPanel
              contactId={selectedConv.contact.id}
              contact={selectedConv.contact}
              onClose={() => setShowContactPanel(false)}
              onSaved={handleSaved}
              onStartChat={() => {
                setTimeout(() => document.getElementById('chat-message-input')?.focus(), 120);
              }}
            />
          ) : null}
        </aside>
      )}
    </div>
  );
}
