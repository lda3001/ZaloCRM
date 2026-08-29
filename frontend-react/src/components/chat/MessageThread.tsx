import { Fragment, useEffect, useRef, useState } from 'react';
import { Avatar, Button, Input, Modal, ModalBody, ModalContent, Spinner, Textarea } from '@heroui/react';
import {
  ArrowLeft,
  CalendarBlank,
  CalendarCheck,
  ChatText,
  Clock,
  DownloadSimple,
  FileText,
  Bell,
  BellSlash,
  IdentificationCard,
  PaperPlaneTilt,
  PhoneCall,
  Smiley,
  Sticker,
  VideoCamera,
  User,
  UsersThree,
} from '@phosphor-icons/react';
import { api } from '../../api/client';
import {
  isConversationMuted,
  setConversationMuted,
} from '../../utils/desktop-notify';
import type { Conversation, Message } from '../../hooks/use-chat';

interface Props {
  conversation: Conversation | null;
  messages: Message[];
  loading: boolean;
  sending: boolean;
  showContactPanel?: boolean;
  onSend: (content: string, opts?: import('../../hooks/use-chat').SendMessageOptions) => void;
  onToggleContactPanel: () => void;
  onBack?: () => void;
}

function formatMessageTime(d: string): string {
  return new Date(d).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
}

/** 'Hôm nay' / 'Hôm qua' / 'T4 26/08/2026' — same style as Zalo. */
function formatDayDivider(d: string): string {
  const date = new Date(d);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (sameDay(date, today)) return 'Hôm nay';
  if (sameDay(date, yesterday)) return 'Hôm qua';
  const weekday = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'][date.getDay()];
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  return `${weekday} ${dd}/${mm}/${date.getFullYear()}`;
}

/** True when two messages fall on different calendar days. */
function isNewDay(prev: string | undefined, current: string): boolean {
  if (!prev) return true;
  const a = new Date(prev);
  const b = new Date(current);
  return (
    a.getFullYear() !== b.getFullYear() || a.getMonth() !== b.getMonth() || a.getDate() !== b.getDate()
  );
}

/** Extract image URL from JSON content. */
function getImageUrl(msg: Message): string | null {
  if (msg.contentType === 'image' && msg.content) {
    if (msg.content.startsWith('http')) return msg.content;
    try {
      const p = JSON.parse(msg.content);
      return p.href || p.thumb || p.hdUrl || null;
    } catch {
      /* not JSON */
    }
  }
  if (msg.content?.startsWith('{')) {
    try {
      const p = JSON.parse(msg.content);
      const href = p.href || p.thumb || '';
      if (href && /\.(jpg|jpeg|png|webp|gif)/i.test(href)) return href;
      if (href && href.includes('zdn.vn') && !p.params?.includes('fileExt')) return href;
    } catch {
      /* not JSON */
    }
  }
  return null;
}

/** Extract file info from JSON content (PDF, docs, etc.). */
function getFileInfo(msg: Message): { name: string; size: string; href: string } | null {
  if (!msg.content?.startsWith('{')) return null;
  try {
    const p = JSON.parse(msg.content);
    const params = typeof p.params === 'string' ? JSON.parse(p.params) : p.params;
    if (params?.fileExt || params?.fType === 1) {
      const bytes = parseInt(params.fileSize || '0', 10);
      const size =
        bytes > 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`;
      return { name: p.title || `file.${params.fileExt || 'unknown'}`, size, href: p.href || '' };
    }
  } catch {
    /* not JSON */
  }
  return null;
}

interface CallInfo {
  duration: number;
  isCaller: number;
  calltype: number;
}

/** Zalo call-log bubble: action 'recommened.calltime' with duration/calltype params. */
function parseCallInfo(msg: Message): CallInfo | null {
  if (!msg.content || !msg.content.startsWith('{')) return null;
  try {
    const p = JSON.parse(msg.content);
    if (typeof p.action === 'string' && (p.action.includes('calltime') || p.action.includes('misscall'))) {
      const params = typeof p.params === 'string' ? JSON.parse(p.params) : p.params || {};
      return {
        duration: Number(params.duration || 0),
        isCaller: Number(params.isCaller || 0),
        calltype: Number(params.calltype || 0),
      };
    }
  } catch {
    // not JSON
  }
  return null;
}

function CallBubble({ info }: { info: CallInfo }) {
  const isVideo = info.calltype !== 0;
  const label = isVideo ? 'Cuộc gọi video' : 'Cuộc gọi thoại';
  const durationText =
    info.duration > 0
      ? info.duration < 60
        ? `${info.duration} giây`
        : `${Math.floor(info.duration / 60)} phút ${info.duration % 60} giây`
      : 'Cuộc gọi nhỡ';
  return (
    <div className="flex items-center gap-2 py-1">
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/15">
        {isVideo ? <VideoCamera size={20} className="text-primary" /> : <PhoneCall size={20} className="text-primary" />}
      </span>
      <div>
        <div className="text-sm font-medium">{label}</div>
        <div className="text-xs text-foreground-500">{durationText}</div>
      </div>
    </div>
  );
}

function parseDisplayContent(content: string | null): string {
  if (!content) return '';
  if (!content.startsWith('{')) return content;
  try {
    const p = JSON.parse(content);
    if (p.title && p.href) return `Liên kết: ${p.title}`;
    if (p.title) return p.title;
    if (p.href) return `Liên kết: ${p.description || p.href}`;
    return content;
  } catch {
    return content;
  }
}

function isReminderMessage(msg: Message): boolean {
  if (!msg.content) return false;
  try {
    const p = JSON.parse(msg.content);
    return p.action === 'msginfo.actionlist';
  } catch {
    return false;
  }
}

function getReminderTitle(msg: Message): string {
  try {
    return JSON.parse(msg.content!).title || '';
  } catch {
    return msg.content || '';
  }
}

function getReminderTime(msg: Message): string | null {
  try {
    const p = JSON.parse(msg.content!);
    const params = typeof p.params === 'string' ? JSON.parse(p.params) : p.params;
    for (const h of params?.highLightsV2 || []) {
      if (h.ts > 1e12) {
        return new Date(h.ts).toLocaleString('vi-VN', {
          weekday: 'long',
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        });
      }
    }
  } catch {
    /* not JSON */
  }
  return null;
}

interface ParsedSticker {
  id: number;
  catId: number;
  type: number;
}

const stickerUrlCache = new Map<number, string>();

function parseSticker(msg: Message): ParsedSticker | null {
  if (msg.contentType !== 'sticker' || !msg.content) return null;
  try {
    const p = JSON.parse(msg.content);
    if (typeof p.id === 'number') {
      return { id: p.id, catId: p.catId ?? 0, type: p.type ?? 3 };
    }
  } catch {
    // not JSON
  }
  return null;
}

function StickerImage({ sticker }: { sticker: ParsedSticker }) {
  const [url, setUrl] = useState<string | null>(stickerUrlCache.get(sticker.id) || null);

  useEffect(() => {
    if (stickerUrlCache.has(sticker.id)) return;
    let alive = true;
    api
      .get(`/stickers/detail?ids=${sticker.id}`)
      .then((res) => {
        const s = (res.data as any)?.stickers?.[0];
        if (s?.stickerUrl && alive) {
          stickerUrlCache.set(sticker.id, s.stickerUrl);
          setUrl(s.stickerUrl);
        }
      })
      .catch(() => {
        // Fall back to the placeholder below.
      });
    return () => {
      alive = false;
    };
  }, [sticker.id]);

  if (!url) {
    return (
      <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-content3 text-xs text-foreground-500">
        Sticker
      </div>
    );
  }
  return <img src={url} alt="Sticker" className="h-24 w-24 object-contain" loading="lazy" />;
}

const EMOJI_GROUPS = [
  {
    id: 'smileys',
    label: 'Cảm xúc',
    icon: '😀',
    emojis: [
      '😀','😃','😄','😁','😆','😅','😂','🤣','😊','😇','🙂','🙃','😉','😌','😍','🥰',
      '😘','😗','😙','😚','😋','😛','😝','😜','🤪','🤨','🧐','🤓','😎','🤩','🥳','😏',
      '😒','😞','😔','😟','😕','🙁','☹️','😣','😖','😫','😩','🥺','😢','😭','😤','😠',
      '😡','🤬','🤯','😳','🥵','🥶','😱','😨','😰','😥','😓','🤗','🤔','🫢','🤭','🤫',
      '🤥','😶','😐','😑','😬','🙄','😯','😦','😧','😮','😲','🥱','😴','🤤','😪','😵',
    ],
  },
  {
    id: 'gestures',
    label: 'Cử chỉ',
    icon: '👋',
    emojis: [
      '👋','🤚','🖐️','✋','🖖','👌','🤌','🤏','✌️','🤞','🫰','🤟','🤘','🤙','👈','👉',
      '👆','👇','☝️','👍','👎','✊','👊','🤛','🤜','👏','🙌','👐','🤲','🤝','🙏','✍️',
      '💅','🤳','💪','🦾','🫶','🫵','👀','👁️','👂','👃','🧠','🫀','🫁','🗣️','👤','👥',
    ],
  },
  {
    id: 'hearts',
    label: 'Tình cảm',
    icon: '❤️',
    emojis: [
      '❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','🩷','🩵','🩶','💔','❤️‍🔥','❤️‍🩹','❣️',
      '💕','💞','💓','💗','💖','💘','💝','💟','💌','💋','🌹','🌷','🌸','💐','🫶','🥰',
      '😍','😘','💍','👩‍❤️‍👨','👨‍❤️‍👨','👩‍❤️‍👩','💏','💑','🧸','🎁','🍫','🍓','✨','🌙','⭐','🦋',
    ],
  },
  {
    id: 'animals',
    label: 'Con vật',
    icon: '🐶',
    emojis: [
      '🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐻‍❄️','🐨','🐯','🦁','🐮','🐷','🐸','🐵',
      '🙈','🙉','🙊','🐒','🐔','🐧','🐦','🐤','🦆','🦅','🦉','🦇','🐺','🐗','🐴','🦄',
      '🐝','🪲','🐞','🦋','🐌','🐛','🐜','🕷️','🐢','🐍','🦎','🐙','🦑','🦀','🐠','🐬',
    ],
  },
  {
    id: 'food',
    label: 'Đồ ăn',
    icon: '🍔',
    emojis: [
      '🍏','🍎','🍐','🍊','🍋','🍌','🍉','🍇','🍓','🫐','🍈','🍒','🍑','🥭','🍍','🥥',
      '🥑','🍅','🥕','🌽','🌶️','🥐','🍞','🥨','🧀','🍳','🥞','🍔','🍟','🍕','🌭','🥪',
      '🌮','🍜','🍲','🍣','🍱','🍛','🍚','🍰','🎂','🧁','🍭','🍫','🍿','☕','🧋','🍺',
    ],
  },
  {
    id: 'activities',
    label: 'Hoạt động',
    icon: '🎉',
    emojis: [
      '⚽','🏀','🏈','⚾','🎾','🏐','🏓','🏸','🥊','🎯','🎮','🎲','🎸','🎹','🎤','🎧',
      '🎬','🎨','🚗','🏍️','✈️','🚀','🏠','🏖️','⛰️','🎉','🎊','🎈','🎁','🏆','🥇','🏅',
      '🔥','✨','💫','⭐','🌟','💥','💯','✅','❌','⚠️','❓','❗','💡','📌','📞','💬',
    ],
  },
] as const;

const RECENT_EMOJIS_KEY = 'zalocrm:recent-emojis';

const STICKER_SUGGESTIONS = [
  { label: 'Phổ biến', keyword: '' },
  { label: 'Vui vẻ', keyword: 'vui vẻ' },
  { label: 'Cảm ơn', keyword: 'cảm ơn' },
  { label: 'Yêu thương', keyword: 'yêu thương' },
  { label: 'Xin chào', keyword: 'xin chào' },
  { label: 'Chúc mừng', keyword: 'chúc mừng' },
];

interface StickerItem {
  id: number;
  catId: number;
  type: number;
  stickerUrl?: string | null;
}

const DEFAULT_STICKER_CATE = 11901;

function normalizeStickers(arr: any[]): StickerItem[] {
  return (Array.isArray(arr) ? arr : []).map((s: any) => ({
    id: s.id ?? s.sticker_id,
    catId: s.catId ?? s.cateId,
    type: s.type ?? 7,
    stickerUrl: s.stickerUrl || null,
  }));
}

function MessageThread({
  conversation,
  messages,
  loading,
  sending,
  showContactPanel = false,
  onSend,
  onToggleContactPanel,
  onBack,
}: Props) {
  const [inputText, setInputText] = useState('');
  const [previewImageUrl, setPreviewImageUrl] = useState('');
  const [syncSnack, setSyncSnack] = useState({ show: false, text: '', color: 'success' });
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [muted, setMuted] = useState(false);
  useEffect(() => {
    setMuted(conversation ? isConversationMuted(conversation.id) : false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversation?.id]);
  const [picker, setPicker] = useState<'emoji' | 'sticker' | null>(null);
  const [emojiGroup, setEmojiGroup] = useState('smileys');
  const [recentEmojis, setRecentEmojis] = useState<string[]>(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(RECENT_EMOJIS_KEY) || '[]');
      return Array.isArray(stored)
        ? stored.filter((emoji): emoji is string => typeof emoji === 'string').slice(0, 24)
        : [];
    } catch {
      return [];
    }
  });
  const [stickers, setStickers] = useState<StickerItem[]>([]);
  const [stickerLoading, setStickerLoading] = useState(false);
  const [stickerKeyword, setStickerKeyword] = useState('');

  useEffect(() => {
    if (picker === 'sticker' && stickers.length === 0 && !stickerKeyword) {
      setStickerLoading(true);
      api
        .get('/stickers/category', {
          params: {
            cateId: DEFAULT_STICKER_CATE,
            accountId: conversation?.zaloAccount?.id || undefined,
          },
        })
        .then((res) => {
          setStickers(normalizeStickers((res.data as any)?.stickers ?? []));
        })
        .catch(() => {})
        .finally(() => setStickerLoading(false));
    }
  }, [picker, stickers.length, stickerKeyword, conversation?.zaloAccount?.id]);

  const stickerSearchTimer = useRef<number | null>(null);
  function handleStickerKeyword(v: string) {
    setStickerKeyword(v);
    if (stickerSearchTimer.current) window.clearTimeout(stickerSearchTimer.current);
    const kw = v.trim();
    if (!kw) {
      setStickers([]);
      return;
    }
    stickerSearchTimer.current = window.setTimeout(() => {
      setStickerLoading(true);
      api
        .get('/stickers/search', {
          params: {
            keyword: kw,
            accountId: conversation?.zaloAccount?.id || undefined,
          },
        })
        .then((res) => {
          setStickers(normalizeStickers((res.data as any)?.stickers ?? []));
        })
        .catch(() => {})
        .finally(() => setStickerLoading(false));
    }, 400);
  }

  function insertEmoji(e: string) {
    setInputText((t) => t + e);
    setRecentEmojis((current) => {
      const next = [e, ...current.filter((emoji) => emoji !== e)].slice(0, 24);
      try {
        localStorage.setItem(RECENT_EMOJIS_KEY, JSON.stringify(next));
      } catch {
        // Ignore storage errors.
      }
      return next;
    });
  }

  function selectStickerSuggestion(keyword: string) {
    handleStickerKeyword(keyword);
  }

  function sendStickerItem(st: StickerItem) {
    setPicker(null);
    onSend('', { contentType: 'sticker', sticker: { id: st.id, catId: st.catId, type: st.type } });
  }

  function togglePicker(kind: 'emoji' | 'sticker') {
    setPicker((cur) => (cur === kind ? null : kind));
  }

  function toggleMuted() {
    if (!conversation) return;
    const next = !muted;
    setConversationMuted(conversation.id, next);
    setMuted(next);
  }

  function handleSend() {
    if (!inputText.trim()) return;
    onSend(inputText);
    setInputText('');
  }

  function openFile(url: string) {
    window.open(url, '_blank');
  }

  /** Sync Zalo reminder to CRM appointments via API. */
  async function syncAppointment(msg: Message) {
    if (!conversation?.contact?.id) {
      setSyncSnack({ show: true, text: 'Không có thông tin khách hàng', color: 'error' });
      return;
    }
    try {
      const p = JSON.parse(msg.content!);
      const params = typeof p.params === 'string' ? JSON.parse(p.params) : p.params;
      let appointmentDate: string | null = null;
      for (const h of params?.highLightsV2 || []) {
        if (h.ts > 1e12) {
          appointmentDate = new Date(h.ts).toISOString();
          break;
        }
      }
      if (!appointmentDate) {
        setSyncSnack({ show: true, text: 'Không tìm thấy thời gian hẹn', color: 'warning' });
        return;
      }
      await api.post('/appointments', {
        contactId: conversation.contact.id,
        appointmentDate,
        appointmentTime: new Date(appointmentDate).toLocaleTimeString('vi-VN', {
          hour: '2-digit',
          minute: '2-digit',
        }),
        type: 'tai_kham',
        notes: `[Zalo] ${p.title || ''}`,
      });
      setSyncSnack({ show: true, text: 'Đã đồng bộ lịch hẹn thành công!', color: 'success' });
    } catch (err) {
      const e = err as { response?: { data?: { error?: string } } };
      setSyncSnack({
        show: true,
        text: e.response?.data?.error || 'Đồng bộ thất bại',
        color: 'error',
      });
    }
  }

  useEffect(() => {
    const el = containerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  useEffect(() => {
    if (!syncSnack.show) return;
    const t = window.setTimeout(() => setSyncSnack((s) => ({ ...s, show: false })), 3000);
    return () => window.clearTimeout(t);
  }, [syncSnack]);

  // Empty state
  if (!conversation) {
    return (
      <div className="chat-canvas flex h-full flex-1 items-center justify-center">
        <div className="text-center text-foreground-500">
          <ChatText size={96} weight="thin" className="mx-auto text-foreground-200" />
          <p className="mt-4 text-lg font-medium">Chọn cuộc trò chuyện</p>
        </div>
      </div>
    );
  }

  return (
    <div className="chat-canvas relative flex h-full flex-1 flex-col">
      {/* Header */}
      <div className="chat-toolbar chat-toolbar--header flex items-center gap-2 border-b border-default px-3 py-2">
        {onBack && (
          <Button
            isIconOnly
            size="sm"
            variant="light"
            aria-label="Quay lại danh sách"
            onPress={onBack}
          >
            <ArrowLeft size={20} />
          </Button>
        )}
        <Avatar
          src={conversation.threadType === 'group' ? undefined : conversation.contact?.avatarUrl ?? undefined}
          icon={
            conversation.threadType === 'group' ? <UsersThree size={18} /> : <User size={18} />
          }
          showFallback
          size="sm"
          className="bg-default-100 text-foreground-500"
        />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">
            {conversation.contact?.fullName || 'Unknown'}
          </div>
          <div className="truncate text-xs text-foreground-500">
            {conversation.zaloAccount?.displayName || 'Zalo'}
          </div>
        </div>
        <Button
          isIconOnly
          size="sm"
          variant="light"
          color={muted ? 'warning' : 'default'}
          aria-label={
            muted
              ? 'Bật thông báo cho cuộc trò chuyện này'
              : 'Tắt thông báo cho cuộc trò chuyện này'
          }
          title={muted ? 'Bật thông báo' : 'Tắt thông báo'}
          onPress={toggleMuted}
        >
          {muted ? <BellSlash size={20} weight="fill" /> : <Bell size={20} />}
        </Button>
        <Button
          isIconOnly
          size="sm"
          variant="light"
          color={showContactPanel ? 'primary' : 'default'}
          aria-label={conversation.threadType === 'group' ? 'Xem thông tin nhóm' : 'Xem thông tin khách hàng'}
          onPress={onToggleContactPanel}
        >
          {conversation.threadType === 'group' ? (
            <UsersThree size={20} weight={showContactPanel ? 'fill' : 'regular'} />
          ) : (
            <IdentificationCard size={20} weight={showContactPanel ? 'fill' : 'regular'} />
          )}
        </Button>
      </div>

      {/* Messages */}
      <div ref={containerRef} className="chat-message-list flex-1 overflow-y-auto px-3 py-3">
        {loading && (
          <div className="flex justify-center pb-2">
            <Spinner size="sm" color="primary" />
          </div>
        )}

        {messages.map((msg, idx) => (
          <Fragment key={msg.id}>
            {isNewDay(idx > 0 ? messages[idx - 1].sentAt : undefined, msg.sentAt) && (
              <div className="my-3 flex justify-center">
                <span className="chat-day-divider rounded-full bg-default-100 px-3 py-0.5 text-xs text-foreground-500">
                  {formatDayDivider(msg.sentAt)}
                </span>
              </div>
            )}
          <div
            className={`mb-2 flex ${msg.senderType === 'self' ? 'justify-end' : 'justify-start'}`}
          >
            <div style={{ maxWidth: '70%' }} title={`${formatMessageTime(msg.sentAt)}, ${formatDayDivider(msg.sentAt)}`}>
              {conversation.threadType === 'group' && msg.senderType !== 'self' && (
                <div className="mb-1 text-xs font-medium text-primary">{msg.senderName || 'Unknown'}</div>
              )}
              <div
                className={`chat-message-bubble px-3 py-2 text-sm ${
                  msg.senderType === 'self'
                    ? 'chat-message-bubble--self bg-primary text-white rounded-2xl rounded-br-md'
                    : 'chat-message-bubble--received bg-content2 text-foreground rounded-2xl rounded-tl-md'
                }`}
                style={{ wordWrap: 'break-word' }}
              >
                {/* Deleted */}
                {msg.isDeleted ? (
                  <div className="italic line-through opacity-60">
                    {msg.content || '(tin nhắn)'}
                    <span className="text-xs"> (đã thu hồi)</span>
                  </div>
                ) : getImageUrl(msg) ? (
                  <img
                    src={getImageUrl(msg)!}
                    alt="Hình ảnh"
                    className="max-h-[300px] max-w-full cursor-pointer rounded-xl transition-transform hover:scale-[1.02]"
                    onClick={() => setPreviewImageUrl(getImageUrl(msg)!)}
                  />
                ) : getFileInfo(msg) ? (
                  <div className="flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 p-2">
                    <FileText size={20} className="text-primary" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{getFileInfo(msg)!.name}</div>
                      <div className="text-xs opacity-60">{getFileInfo(msg)!.size}</div>
                    </div>
                    {getFileInfo(msg)!.href && (
                      <Button
                        isIconOnly
                        size="sm"
                        variant="light"
                        aria-label="Tải xuống"
                        onPress={() => openFile(getFileInfo(msg)!.href)}
                      >
                        <DownloadSimple size={16} />
                      </Button>
                    )}
                  </div>
                ) : parseSticker(msg) ? (
                  <StickerImage sticker={parseSticker(msg)!} />
                ) : msg.contentType === 'video' ? (
                  'Video'
                ) : msg.contentType === 'voice' ? (
                  'Tin nhắn thoại'
                ) : msg.contentType === 'gif' ? (
                  'GIF'
                ) : parseCallInfo(msg) ? (
                  <CallBubble info={parseCallInfo(msg)!} />
                ) : isReminderMessage(msg) ? (
                  <div className="rounded-lg border-l-[3px] border-warning bg-warning/10 p-2">
                    <div className="mb-1 flex items-center gap-1">
                      <CalendarBlank size={16} className="text-warning" />
                      <span className="text-xs font-bold text-warning">Nhắc hẹn</span>
                    </div>
                    <div className="text-sm">{getReminderTitle(msg)}</div>
                    {getReminderTime(msg) && (
                      <div className="mt-1 flex items-center gap-1 text-xs opacity-70">
                        <Clock size={12} />
                        {getReminderTime(msg)}
                      </div>
                    )}
                    <Button
                      size="sm"
                      variant="flat"
                      color="warning"
                      className="mt-2"
                      startContent={<CalendarCheck size={14} />}
                      onPress={() => void syncAppointment(msg)}
                    >
                      Đồng bộ lịch
                    </Button>
                  </div>
                ) : (
                  parseDisplayContent(msg.content)
                )}

                {/* Timestamp */}
                <div
                  className={`mt-1 text-[0.7rem] tabular-nums ${
                    msg.senderType === 'self' ? 'text-white/65' : 'text-foreground-500'
                  }`}
                >
                  {formatMessageTime(msg.sentAt)}
                </div>
              </div>
            </div>
          </div>
          </Fragment>
        ))}

        {!loading && messages.length === 0 && (
          <div className="py-8 text-center text-foreground-500">Chưa có tin nhắn</div>
        )}
      </div>

      {/* Sync snackbar */}
      {syncSnack.show && (
        <div
          className={`absolute bottom-20 left-1/2 z-20 -translate-x-1/2 rounded-lg px-4 py-2 text-sm text-white ${
            syncSnack.color === 'success'
              ? 'bg-success'
              : syncSnack.color === 'error'
                ? 'bg-danger'
                : 'bg-warning'
          }`}
        >
          {syncSnack.text}
        </div>
      )}

      {/* Input */}
      <div className="chat-toolbar chat-toolbar--composer relative flex items-end gap-2 border-t border-default p-2">
        <Textarea
          id="chat-message-input"
          placeholder="Nhập tin nhắn..."
          value={inputText}
          onValueChange={setInputText}
          minRows={1}
          maxRows={3}
          variant="bordered"
          className="flex-1"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
        />
        <div className="flex items-center gap-1 pb-1">
          <Button
            isIconOnly
            size="sm"
            variant="light"
            color={picker === 'emoji' ? 'primary' : 'default'}
            aria-label="Chèn biểu tượng cảm xúc"
            onPress={() => togglePicker('emoji')}
          >
            <Smiley size={18} />
          </Button>
          <Button
            isIconOnly
            size="sm"
            variant="light"
            color={picker === 'sticker' ? 'primary' : 'default'}
            aria-label="Gửi sticker"
            onPress={() => togglePicker('sticker')}
          >
            <Sticker size={18} />
          </Button>
        </div>
        <Button
          isIconOnly
          color="primary"
          isLoading={sending}
          isDisabled={!inputText.trim()}
          aria-label="Gửi"
          onPress={handleSend}
        >
          <PaperPlaneTilt size={18} />
        </Button>

        {picker && (
          <div className="absolute bottom-full right-2 z-30 mb-2 w-[420px] max-w-[calc(100%-1rem)] rounded-2xl border border-default bg-background p-3 shadow-xl">
            <div className="mb-3 flex rounded-xl bg-default-100 p-1">
              <button
                type="button"
                className={`flex-1 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                  picker === 'emoji' ? 'bg-background text-primary shadow-sm' : 'text-foreground-500'
                }`}
                onClick={() => setPicker('emoji')}
              >
                Emoji
              </button>
              <button
                type="button"
                className={`flex-1 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                  picker === 'sticker' ? 'bg-background text-primary shadow-sm' : 'text-foreground-500'
                }`}
                onClick={() => setPicker('sticker')}
              >
                Sticker
              </button>
            </div>
            {picker === 'emoji' ? (
              <div>
                <div className="mb-2 flex gap-1 overflow-x-auto pb-1">
                  {recentEmojis.length > 0 && (
                    <button
                      type="button"
                      title="Gần đây"
                      className={`flex h-9 min-w-9 items-center justify-center rounded-lg text-lg transition-colors ${
                        emojiGroup === 'recent' ? 'bg-primary/15' : 'hover:bg-default-100'
                      }`}
                      onClick={() => setEmojiGroup('recent')}
                    >
                      🕘
                    </button>
                  )}
                  {EMOJI_GROUPS.map((group) => (
                    <button
                      key={group.id}
                      type="button"
                      title={group.label}
                      className={`flex h-9 min-w-9 items-center justify-center rounded-lg text-lg transition-colors ${
                        emojiGroup === group.id ? 'bg-primary/15' : 'hover:bg-default-100'
                      }`}
                      onClick={() => setEmojiGroup(group.id)}
                    >
                      {group.icon}
                    </button>
                  ))}
                </div>
                <div className="max-h-[280px] overflow-y-auto pr-1">
                  <div className="mb-2 text-xs font-semibold text-foreground-500">
                    {emojiGroup === 'recent'
                      ? 'Gần đây'
                      : EMOJI_GROUPS.find((group) => group.id === emojiGroup)?.label}
                  </div>
                  <div className="grid grid-cols-9 gap-1">
                    {(emojiGroup === 'recent'
                      ? recentEmojis
                      : EMOJI_GROUPS.find((group) => group.id === emojiGroup)?.emojis || []
                    ).map((emoji, index) => (
                      <button
                        key={`${emoji}-${index}`}
                        type="button"
                        className="flex h-9 w-9 items-center justify-center rounded-lg text-xl transition-colors hover:bg-default-100"
                        onClick={() => insertEmoji(emoji)}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <Input
                  size="sm"
                  variant="bordered"
                  placeholder="Tìm sticker..."
                  value={stickerKeyword}
                  onValueChange={handleStickerKeyword}
                  aria-label="Tìm sticker"
                />
                <div className="flex gap-1 overflow-x-auto pb-1">
                  {STICKER_SUGGESTIONS.map((suggestion) => (
                    <button
                      key={suggestion.label}
                      type="button"
                      className={`whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                        stickerKeyword === suggestion.keyword
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-default-100 text-foreground-600 hover:bg-default-200'
                      }`}
                      onClick={() => selectStickerSuggestion(suggestion.keyword)}
                    >
                      {suggestion.label}
                    </button>
                  ))}
                </div>
                <div className="max-h-[260px] overflow-y-auto">
                  {stickerLoading ? (
                    <div className="flex justify-center py-6">
                      <Spinner size="sm" color="primary" />
                    </div>
                  ) : stickers.length === 0 ? (
                    <div className="py-6 text-center text-sm text-foreground-500">
                      {stickerKeyword ? 'Không tìm thấy sticker' : 'Đang tải sticker...'}
                    </div>
                  ) : (
                    <div className="grid grid-cols-5 gap-1">
                      {stickers.map((st) => (
                        <button
                          key={st.id}
                          type="button"
                          className="flex aspect-square items-center justify-center rounded-lg transition-colors hover:bg-default-100"
                          onClick={() => sendStickerItem(st)}
                        >
                          <img
                            src={st.stickerUrl || undefined}
                            alt=""
                            className="h-12 w-12 object-contain"
                            loading="lazy"
                          />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Image preview dialog */}
      <Modal isOpen={Boolean(previewImageUrl)} onOpenChange={(open) => !open && setPreviewImageUrl('')} size="2xl">
        <ModalContent>
          {(onClose) => (
            <>
              <ModalBody className="items-center p-4 text-center">
                <img
                  src={previewImageUrl}
                  alt="Preview"
                  className="max-h-[85vh] max-w-full cursor-pointer rounded-xl"
                  onClick={onClose}
                />
                <div className="mt-2 text-xs text-foreground-500">Nhấn để đóng</div>
              </ModalBody>
            </>
          )}
        </ModalContent>
      </Modal>
    </div>
  );
}

export default MessageThread;
