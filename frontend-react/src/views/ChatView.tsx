import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Modal, ModalContent } from '@heroui/react';
import ConversationList from '../components/chat/ConversationList';
import MessageThread from '../components/chat/MessageThread';
import FloatingChatWindow from '../components/chat/FloatingChatWindow';
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

function getFloatingChatLimit(viewportWidth = window.innerWidth): number {
  if (viewportWidth <= 767) return 0;
  const isTablet = viewportWidth <= 1100;
  const dockLeft = isTablet ? 72 : 88;
  const dockRight = isTablet ? 10 : 16;
  const windowWidth = isTablet ? 310 : 328;
  const gap = 8;
  const availableWidth = viewportWidth - dockLeft - dockRight;
  return Math.max(1, Math.floor((availableWidth + gap) / (windowWidth + gap)));
}

export default function ChatView() {
  const [searchParams, setSearchParams] = useSearchParams();
  const {
    conversations,
    selectedConvId,
    selectedConv,
    messages,
    loadingConvs,
    loadingMoreConvs,
    hasMoreConversations,
    loadingMsgs,
    loadingOlderMsgs,
    hasOlderMessages,
    messageError,
    sendingMsg,
    messageActionPending,
    searchQuery,
    setSearchQuery,
    setAccountFilter,
    threadFilter,
    setThreadFilter,
    fetchConversations,
    loadMoreConversations,
    selectConversation,
    loadOlderMessages,
    sendMessage,
    sendAttachments,
    deleteMessage,
    recallMessage,
    reactToMessage,
    forwardMessage,
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
  const floatingDockRef = useRef<HTMLDivElement | null>(null);

  // Mobile: list OR thread (desktop always shows both).
  const [isMobile, setIsMobile] = useState(
    () => window.matchMedia('(max-width: 767px)').matches,
  );
  const [mobileView, setMobileView] = useState<'list' | 'thread'>('list');
  const [floatingChats, setFloatingChats] = useState<typeof conversations>([]);
  const [minimizedChatIds, setMinimizedChatIds] = useState<Set<string>>(new Set());
  const [activeFloatingChatId, setActiveFloatingChatId] = useState<string | null>(null);
  const [maxFloatingChats, setMaxFloatingChats] = useState(() => getFloatingChatLimit());

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  useEffect(() => {
    let frame = 0;
    const updateLimit = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        setMaxFloatingChats(getFloatingChatLimit());
      });
    };
    window.addEventListener('resize', updateLimit);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('resize', updateLimit);
    };
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

  function openFloatingChat(conversationId: string) {
    if (isMobile) {
      handleSelect(conversationId);
      return;
    }
    const conversation = conversations.find((item) => item.id === conversationId);
    if (!conversation) return;
    setActiveFloatingChatId(conversationId);
    setFloatingChats((current) => {
      if (current.some((item) => item.id === conversationId)) {
        return current.map((item) => item.id === conversationId ? conversation : item);
      }
      const remainingSlots = Math.max(0, Math.max(1, maxFloatingChats) - 1);
      const retained = remainingSlots > 0 ? current.slice(-remainingSlots) : [];
      return [...retained, conversation];
    });
    setMinimizedChatIds((current) => {
      if (!current.has(conversationId)) return current;
      const next = new Set(current);
      next.delete(conversationId);
      return next;
    });
  }

  function closeFloatingChat(conversationId: string) {
    const nextActiveId = floatingChats
      .filter((item) => item.id !== conversationId)
      .at(-1)?.id ?? null;
    setFloatingChats((current) => current.filter((item) => item.id !== conversationId));
    setActiveFloatingChatId((activeId) => (
      activeId === conversationId ? nextActiveId : activeId
    ));
    setMinimizedChatIds((current) => {
      const next = new Set(current);
      next.delete(conversationId);
      return next;
    });
  }

  function toggleFloatingChat(conversationId: string) {
    setActiveFloatingChatId(conversationId);
    setMinimizedChatIds((current) => {
      const next = new Set(current);
      if (next.has(conversationId)) next.delete(conversationId);
      else next.add(conversationId);
      return next;
    });
  }

  useEffect(() => {
    if (conversations.length === 0) return;
    setFloatingChats((current) => current.map((opened) => (
      conversations.find((conversation) => conversation.id === opened.id) || opened
    )));
  }, [conversations]);

  // The dock capacity follows the viewport. When it shrinks, preserve the
  // newest chats and evict the oldest ones, matching Messenger-style popups.
  useEffect(() => {
    setFloatingChats((current) => (
      maxFloatingChats === 0
        ? []
        : current.length > maxFloatingChats ? current.slice(-maxFloatingChats) : current
    ));
  }, [maxFloatingChats]);

  // Remove state belonging to windows that were closed or automatically evicted.
  useEffect(() => {
    const openIds = new Set(floatingChats.map((conversation) => conversation.id));
    setMinimizedChatIds((current) => {
      const next = new Set([...current].filter((id) => openIds.has(id)));
      return next.size === current.size ? current : next;
    });
    setActiveFloatingChatId((activeId) => (
      activeId && openIds.has(activeId) ? activeId : floatingChats.at(-1)?.id ?? null
    ));
  }, [floatingChats]);

  // Keep the newest window visible while the dock is resizing.
  useEffect(() => {
    const dock = floatingDockRef.current;
    if (!dock) return;
    const frame = window.requestAnimationFrame(() => {
      dock.scrollTo({ left: dock.scrollWidth, behavior: 'smooth' });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [floatingChats.length]);

  function handleSaved() {
    void fetchConversations();
  }

  const leftPanelVisible = isMobile ? mobileView === 'list' : true;
  const threadVisible = isMobile ? mobileView === 'thread' : true;

  return (
    <div className="chat-workspace flex h-full min-h-0 min-w-0 overflow-hidden">
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
            loadingMore={loadingMoreConvs}
            hasMore={hasMoreConversations}
            search={searchQuery}
            threadFilter={threadFilter}
            onSearchChange={setSearchQuery}
            onSelect={handleSelect}
            onLoadMore={() => void loadMoreConversations()}
            onFilterAccount={handleFilterAccount}
            onFilterThread={handleFilterThread}
            onOpenWindow={!isMobile ? openFloatingChat : undefined}
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
        <section className="flex min-h-0 min-w-0 flex-1 flex-col">
          <MessageThread
            conversation={selectedConv}
            conversations={conversations}
            messages={messages}
            loading={loadingMsgs}
            loadingOlder={loadingOlderMsgs}
            hasOlderMessages={hasOlderMessages}
            messageError={messageError}
            sending={sendingMsg}
            messageActionPending={messageActionPending}
            showContactPanel={showContactPanel}
            onSend={sendMessage}
            onSendFiles={sendAttachments}
            onDeleteMessage={deleteMessage}
            onRecallMessage={recallMessage}
            onReactMessage={reactToMessage}
            onForwardMessage={forwardMessage}
            onLoadOlder={loadOlderMessages}
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
            onOpenWindow={!isMobile && selectedConvId
              ? () => openFloatingChat(selectedConvId)
              : undefined}
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
              conversationId={selectedConv.id}
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
      {isMobile && selectedConv && (
        <Modal isOpen={showContactPanel} onOpenChange={setShowContactPanel} size="full" hideCloseButton aria-label={selectedConv.threadType === 'group' ? 'Thông tin nhóm' : 'Thông tin khách hàng'}>
          <ModalContent className="mobile-chat-details">
            {selectedConv.threadType === 'group' ? (
              <ChatGroupPanel conversation={selectedConv} onClose={() => setShowContactPanel(false)} />
            ) : (
              <ChatContactPanel key={selectedConv.id} conversationId={selectedConv.id} contactId={selectedConv.contact?.id ?? null} contact={selectedConv.contact} onClose={() => setShowContactPanel(false)} onSaved={handleSaved} onStartChat={() => setShowContactPanel(false)} />
            )}
          </ModalContent>
        </Modal>
      )}
      {!isMobile && floatingChats.length > 0 && (
        <div
          ref={floatingDockRef}
          className="multi-chat-dock"
          aria-label="Các cửa sổ chat đang mở"
          onWheel={(event) => {
            const dock = event.currentTarget;
            if (dock.scrollWidth <= dock.clientWidth || Math.abs(event.deltaX) >= Math.abs(event.deltaY)) return;
            dock.scrollLeft += event.deltaY;
            event.preventDefault();
          }}
        >
          {floatingChats.map((conversation) => (
            <FloatingChatWindow
              key={conversation.id}
              conversation={conversation}
              conversations={conversations}
              minimized={minimizedChatIds.has(conversation.id)}
              active={activeFloatingChatId === conversation.id}
              onClose={() => closeFloatingChat(conversation.id)}
              onToggleMinimize={() => toggleFloatingChat(conversation.id)}
              onActivate={() => setActiveFloatingChatId(conversation.id)}
              onOpenConversation={openFloatingChat}
              onRefreshConversations={fetchConversations}
            />
          ))}
        </div>
      )}
    </div>
  );
}
