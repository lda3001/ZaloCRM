// App-level Socket.IO singleton for chat real-time updates.
//
// Lives for the whole authenticated session instead of being tied to the Chat
// screen mount: closing the chat tab no longer disconnects the socket, so
// incoming messages still update state and trigger desktop notifications from
// any page.

import { io, type Socket } from 'socket.io-client';
import { isConversationMuted, notifyIncomingMessage, playNotifySound } from '../utils/desktop-notify';

export interface ChatSocketMessage {
  id: string;
  content: string | null;
  contentType: string;
  senderType: string;
  senderName: string | null;
  sentAt: string;
  isDeleted: boolean;
  zaloMsgId: string | null;
}

export interface ChatMessagePayload {
  message: ChatSocketMessage;
  conversationId: string;
  /** Present on newer backends: 'user' | 'group' for the source thread. */
  threadType?: 'user' | 'group';
  /** Display name of the source thread (group name for group threads). */
  conversationName?: string | null;
}

type MessageListener = (payload: ChatMessagePayload) => void;
type DeletedListener = (payload: { msgId: string }) => void;

const msgListeners = new Set<MessageListener>();
const delListeners = new Set<DeletedListener>();
let socket: Socket | null = null;
let activeConversationId: string | null = null;

function messagePreview(m: ChatSocketMessage): string {
  // Content-type first: images/files may carry empty or JSON-stringified content.
  const type = m.contentType ?? '';
  if (type === 'image' || type === 'video') return '[' + (type === 'image' ? 'Hình ảnh' : 'Video') + ']';
  if (type === 'file') return '[Tệp tin]';
  if (type === 'audio' || type === 'voice') return '[Tin thoại]';
  const content = m.content?.trim();
  if (!content) return '(không có nội dung)';
  return content.length > 200 ? content.slice(0, 200) + '...' : content;
}

export function startChatSocket(): void {
  if (socket) return;
  const s = io({ transports: ['websocket', 'polling'] });
  socket = s;

  s.on('chat:message', (data: ChatMessagePayload) => {
    const { message, conversationId } = data;

    // Desktop notification for incoming (contact) messages, unless the app
    // has focus on exactly this conversation.
    if (message.senderType === 'contact' && !message.isDeleted) {
      const appFocused = typeof document !== 'undefined' && document.hasFocus();
      const viewingThis = conversationId === activeConversationId;
      if (!viewingThis || !appFocused) {
        // Per-conversation mute: no toast, no chime.
        if (!isConversationMuted(conversationId)) {
          const isGroup = data.threadType === 'group';
          // Group messages show the group name as the title and prefix the
          // sender in the body; direct messages use the sender name.
          const title = isGroup
            ? data.conversationName || message.senderName || 'Tin nhắn nhóm'
            : message.senderName || 'Tin nhắn mới';
          const body = isGroup && message.senderName
            ? message.senderName + ': ' + messagePreview(message)
            : messagePreview(message);
          playNotifySound();
          notifyIncomingMessage({
            conversationId,
            title,
            body,
          });
        }
      }
    }

    msgListeners.forEach((fn) => fn(data));
  });

  s.on('chat:deleted', (data: { msgId: string }) => {
    delListeners.forEach((fn) => fn(data));
  });
}

export function stopChatSocket(): void {
  socket?.disconnect();
  socket = null;
  msgListeners.clear();
  delListeners.clear();
  activeConversationId = null;
}

export function onChatMessage(fn: MessageListener): () => void {
  msgListeners.add(fn);
  return () => void msgListeners.delete(fn);
}

export function onChatDeleted(fn: DeletedListener): () => void {
  delListeners.add(fn);
  return () => void delListeners.delete(fn);
}

/** Which conversation is currently open in the UI (used to suppress own-conv toasts). */
export function setActiveConversation(id: string | null): void {
  activeConversationId = id;
}
