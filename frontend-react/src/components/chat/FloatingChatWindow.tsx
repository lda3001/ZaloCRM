import { useEffect } from 'react';
import { Avatar, Button } from '@heroui/react';
import { CaretUp, Minus, User, UsersThree, X } from '@phosphor-icons/react';
import type { Conversation } from '../../hooks/use-chat';
import { useFloatingChat } from '../../hooks/use-floating-chat';
import MessageThread from './MessageThread';

interface Props {
  conversation: Conversation;
  conversations: Conversation[];
  minimized: boolean;
  active: boolean;
  onClose: () => void;
  onToggleMinimize: () => void;
  onActivate: () => void;
  onOpenConversation: (conversationId: string) => void;
  onRefreshConversations: () => void;
}

export default function FloatingChatWindow({
  conversation,
  conversations,
  minimized,
  active,
  onClose,
  onToggleMinimize,
  onActivate,
  onOpenConversation,
  onRefreshConversations,
}: Props) {
  const chat = useFloatingChat(conversation.id, !minimized, onRefreshConversations);
  const inputId = `floating-chat-input-${conversation.id}`;
  const displayName = conversation.contact?.fullName
    || (conversation.threadType === 'group' ? 'Nhóm Zalo' : 'Khách hàng');

  useEffect(() => {
    if (minimized) return;
    const timer = window.setTimeout(() => document.getElementById(inputId)?.focus(), 160);
    return () => window.clearTimeout(timer);
  }, [inputId, minimized]);

  return (
    <section
      className={`multi-chat-window ${minimized ? 'multi-chat-window--minimized' : ''} ${active ? 'multi-chat-window--active' : ''}`}
      aria-label={`Cửa sổ chat với ${displayName}`}
      onPointerDown={onActivate}
      onFocusCapture={onActivate}
    >
      <header
        className="multi-chat-window__header flex items-center gap-2 border-b border-default px-2.5 py-2"
        onDoubleClick={onToggleMinimize}
      >
        <Avatar
          src={conversation.contact?.avatarUrl ?? undefined}
          name={displayName}
          icon={conversation.threadType === 'group' ? <UsersThree size={17} /> : <User size={17} />}
          showFallback
          size="sm"
          className="h-8 w-8 shrink-0 bg-default-100 text-foreground-500"
        />
        <button
          type="button"
          className="min-w-0 flex-1 text-left"
          title={minimized ? 'Mở rộng cửa sổ chat' : 'Nhấp đúp để thu nhỏ'}
          onClick={() => minimized && onToggleMinimize()}
        >
          <div className="flex items-center gap-1.5">
            <span className="truncate text-sm font-semibold">{displayName}</span>
            {conversation.unreadCount > 0 && (
              <span className="shrink-0 rounded-full bg-danger px-1.5 py-0.5 text-[10px] font-bold text-white">
                {conversation.unreadCount > 99 ? '99+' : conversation.unreadCount}
              </span>
            )}
          </div>
          <div className="truncate text-[11px] text-foreground-500">
            {conversation.zaloAccount?.displayName || 'Zalo'}
          </div>
        </button>
        <Button
          isIconOnly
          size="sm"
          variant="light"
          aria-label={minimized ? 'Mở rộng cửa sổ chat' : 'Thu nhỏ cửa sổ chat'}
          title={minimized ? 'Mở rộng' : 'Thu nhỏ'}
          className="h-8 min-h-8 w-8 min-w-8"
          onPress={onToggleMinimize}
        >
          {minimized ? <CaretUp size={17} /> : <Minus size={17} />}
        </Button>
        <Button
          isIconOnly
          size="sm"
          variant="light"
          aria-label="Đóng cửa sổ chat"
          title="Đóng"
          className="h-8 min-h-8 w-8 min-w-8"
          onPress={onClose}
        >
          <X size={17} />
        </Button>
      </header>

      {!minimized && (
        <div className="multi-chat-window__body min-h-0 flex-1">
          <MessageThread
            conversation={conversation}
            conversations={conversations}
            messages={chat.messages}
            loading={chat.loading}
            loadingOlder={chat.loadingOlder}
            hasOlderMessages={chat.hasOlder}
            messageError={chat.error}
            sending={chat.sending}
            messageActionPending={chat.messageActionPending}
            hideHeader
            inputId={inputId}
            onSend={chat.sendMessage}
            onSendFiles={chat.sendAttachments}
            onDeleteMessage={chat.deleteMessage}
            onRecallMessage={chat.recallMessage}
            onReactMessage={chat.reactToMessage}
            onForwardMessage={chat.forwardMessage}
            onLoadOlder={chat.loadOlder}
            onToggleContactPanel={() => undefined}
            onOpenConversation={onOpenConversation}
            onRefreshMessages={() => void chat.refresh()}
          />
        </div>
      )}
    </section>
  );
}
