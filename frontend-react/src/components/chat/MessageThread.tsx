import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Alert, Avatar, Button, Input, Modal, ModalBody, ModalContent, ModalFooter, Spinner, Textarea } from '@heroui/react';
import {
  ArrowLeft,
  ArrowsClockwise,
  CalendarBlank,
  CalendarCheck,
  ChatText,
  Clock,
  DownloadSimple,
  FileText,
  Bell,
  BellSlash,
  IdentificationCard,
  Image as ImageIcon,
  Paperclip,
  PaperPlaneTilt,
  PhoneCall,
  Smiley,
  Sticker,
  VideoCamera,
  User,
  UsersThree,
  X,
} from '@phosphor-icons/react';
import { api } from '../../api/client';
import {
  isConversationMuted,
  setConversationMuted,
} from '../../utils/desktop-notify';
import type { Conversation, Message, SendMessageResult } from '../../hooks/use-chat';
import { getGroupInfoCached } from '../../services/group-info-cache';

interface Props {
  conversation: Conversation | null;
  messages: Message[];
  loading: boolean;
  loadingOlder?: boolean;
  hasOlderMessages?: boolean;
  messageError?: string;
  sending: boolean;
  showContactPanel?: boolean;
  onSend: (
    content: string,
    opts?: import('../../hooks/use-chat').SendMessageOptions,
  ) => Promise<SendMessageResult>;
  onSendFiles?: (files: File[], caption?: string) => Promise<boolean>;
  onLoadOlder?: () => Promise<boolean>;
  onToggleContactPanel: () => void;
  onOpenContactPanel?: () => void;
  onOpenConversation?: (conversationId: string) => void;
  onBack?: () => void;
  onRefreshMessages?: () => void;
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

/** Caption typed alongside an image — Zalo stores it in `title` of the image payload. */
function getImageCaption(msg: Message): string | null {
  if (msg.contentType !== 'image' || !msg.content?.startsWith('{')) return null;
  try {
    const p = JSON.parse(msg.content);
    return typeof p.title === 'string' && p.title.trim() ? p.title.trim() : null;
  } catch {
    return null;
  }
}

/**
 * Image with retry — Zalo's CDN can 404 for a few seconds right after upload,
 * and a plain <img> never recovers from that first failure.
 */
function ChatImage({ src, onClick }: { src: string; onClick: () => void }) {
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);
  const retryTimer = useRef<number | null>(null);

  useEffect(() => {
    setAttempt(0);
    setFailed(false);
    return () => {
      if (retryTimer.current) window.clearTimeout(retryTimer.current);
    };
  }, [src]);

  if (failed) {
    return (
      <button
        type="button"
        className="flex items-center gap-2 rounded-lg bg-black/10 px-3 py-2 text-sm underline"
        onClick={() => {
          setFailed(false);
          setAttempt((n) => n + 1);
        }}
      >
        <ImageIcon size={18} /> Không tải được ảnh — bấm để thử lại
      </button>
    );
  }

  const url = attempt === 0 ? src : `${src}${src.includes('?') ? '&' : '?'}retry=${attempt}`;
  return (
    <img
      src={url}
      alt="Hình ảnh"
      className="max-h-[300px] max-w-full cursor-pointer rounded-xl transition-transform hover:scale-[1.02]"
      style={{ minWidth: 48, minHeight: 48 }}
      onClick={onClick}
      onError={() => {
        if (attempt < 5) {
          retryTimer.current = window.setTimeout(
            () => setAttempt((n) => n + 1),
            1500 * (attempt + 1),
          );
        } else {
          setFailed(true);
        }
      }}
    />
  );
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

/** Extract playable video URL (+poster) from JSON content. */
function getVideoInfo(msg: Message): { href: string; thumb: string | null } | null {
  if (msg.contentType !== 'video' || !msg.content) return null;
  if (msg.content.startsWith('http')) return { href: msg.content, thumb: null };
  try {
    const p = JSON.parse(msg.content);
    if (p.href) return { href: p.href, thumb: p.thumb || null };
  } catch {
    /* not JSON */
  }
  return null;
}

/** Extract voice-message audio URL from JSON content. */
function getVoiceUrl(msg: Message): string | null {
  if (msg.contentType !== 'voice' || !msg.content) return null;
  if (msg.content.startsWith('http')) return msg.content;
  try {
    const p = JSON.parse(msg.content);
    return p.href || null;
  } catch {
    return null;
  }
}

function formatBytes(bytes: number): string {
  if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
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

interface ChatProfile {
  uid: string | null;
  name: string;
  avatarUrl: string | null;
  phone?: string | null;
  kind: 'self' | 'contact' | 'group-member';
}

interface GroupMemberProfile {
  id: string;
  displayName: string;
  avatarUrl: string | null;
}

const DEFAULT_STICKER_CATE = 11901;

function PendingFileChip({ file, onRemove }: { file: File; onRemove: () => void }) {
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!file.type.startsWith('image/')) return;
    const url = URL.createObjectURL(file);
    setThumbUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const isVideo = file.type.startsWith('video/');
  return (
    <div className="relative flex items-center gap-2 rounded-xl border border-default bg-content2 p-1.5 pr-2">
      {thumbUrl ? (
        <img src={thumbUrl} alt={file.name} className="h-12 w-12 rounded-lg object-cover" />
      ) : (
        <span className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
          {isVideo ? (
            <VideoCamera size={22} className="text-primary" />
          ) : (
            <FileText size={22} className="text-primary" />
          )}
        </span>
      )}
      <div className="min-w-0 max-w-[140px]">
        <div className="truncate text-xs font-medium">{file.name}</div>
        <div className="text-[0.65rem] text-foreground-500">{formatBytes(file.size)}</div>
      </div>
      <button
        type="button"
        aria-label={`Bỏ ${file.name}`}
        className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-default-200 text-foreground-600 transition-colors hover:bg-danger hover:text-white"
        onClick={onRemove}
      >
        <X size={12} weight="bold" />
      </button>
    </div>
  );
}

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
  loadingOlder = false,
  hasOlderMessages = false,
  messageError = '',
  sending,
  showContactPanel = false,
  onSend,
  onSendFiles,
  onLoadOlder,
  onToggleContactPanel,
  onOpenContactPanel,
  onOpenConversation,
  onBack,
  onRefreshMessages,
}: Props) {
  const groupSenderIds = Array.from(new Set(
    messages
      .filter((message) => message.senderType !== 'self' && message.senderUid)
      .map((message) => String(message.senderUid).split('_')[0]),
  ));
  const groupSenderIdsKey = groupSenderIds.join(',');
  const [inputText, setInputText] = useState('');
  const [previewImageUrl, setPreviewImageUrl] = useState('');
  const [selectedProfile, setSelectedProfile] = useState<ChatProfile | null>(null);
  const [groupMembers, setGroupMembers] = useState<Record<string, GroupMemberProfile>>({});
  const groupMembersRef = useRef<Record<string, GroupMemberProfile>>({});
  const [openingPrivateChat, setOpeningPrivateChat] = useState(false);
  const [downloadingFileId, setDownloadingFileId] = useState<string | null>(null);
  const [syncSnack, setSyncSnack] = useState({ show: false, text: '', color: 'success' });
  const containerRef = useRef<HTMLDivElement | null>(null);
  const preserveScrollRef = useRef<{ height: number; top: number } | null>(null);
  const nearBottomRef = useRef(true);
  const previousConversationRef = useRef<string | null>(null);
  const [showJumpToBottom, setShowJumpToBottom] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    setPendingFiles([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversation?.id]);

  useEffect(() => {
    groupMembersRef.current = {};
    setGroupMembers({});
  }, [conversation?.id]);

  useEffect(() => {
    let active = true;
    if (!conversation || conversation.threadType !== 'group' || groupSenderIds.length === 0) {
      return () => {
        active = false;
      };
    }
    const missingIds = groupSenderIds.filter((id) => !groupMembersRef.current[id]);
    if (missingIds.length === 0) return () => {
      active = false;
    };
    getGroupInfoCached(conversation.id, { memberIds: missingIds })
      .then((group) => {
        if (!active) return;
        const members = group.members as GroupMemberProfile[];
        const next = Object.fromEntries(
          members.map((member) => [String(member.id).replace(/_0$/, ''), member]),
        );
        groupMembersRef.current = { ...groupMembersRef.current, ...next };
        setGroupMembers(groupMembersRef.current);
      })
      .catch(() => {
        // Message bubbles still show initials when Zalo group info is unavailable.
      });
    return () => {
      active = false;
    };
  }, [conversation?.id, conversation?.threadType, groupSenderIdsKey]);
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
    setStickers([]);
    setStickerKeyword('');
    setPicker(null);
  }, [conversation?.zaloAccount?.id]);

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
        .catch((err: any) => {
          setSyncSnack({
            show: true,
            text: err?.response?.data?.error || 'Không tải được sticker.',
            color: 'warning',
          });
        })
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
        .catch((err: any) => {
          setSyncSnack({
            show: true,
            text: err?.response?.data?.error || 'Tìm sticker thất bại.',
            color: 'warning',
          });
        })
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

  async function sendStickerItem(st: StickerItem) {
    if (sending) return;
    const result = await onSend('', {
      contentType: 'sticker',
      sticker: { id: st.id, catId: st.catId, type: st.type },
    });
    if (result.ok) setPicker(null);
    else {
      setSyncSnack({
        show: true,
        text: result.error || 'Gửi sticker thất bại.',
        color: 'error',
      });
    }
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

  const [syncing, setSyncing] = useState(false);
  async function handleSyncMessages() {
    if (!conversation || syncing) return;
    setSyncing(true);
    try {
      const res = await api.post(`/conversations/${conversation.id}/sync-messages`, { count: 200 });
      const d = res.data as { created?: number; fetched?: number };
      setSyncSnack({
        show: true,
        text: `Đã đồng bộ ${d.created ?? 0} tin mới (quét ${d.fetched ?? 0} tin từ Zalo)`,
        color: 'success',
      });
      onRefreshMessages?.();
    } catch (err: any) {
      const msg = err?.response?.data?.error || 'Đồng bộ thất bại, thử lại sau.';
      setSyncSnack({ show: true, text: msg, color: 'warning' });
    } finally {
      setSyncing(false);
    }
  }

  async function handleSend() {
    if (sending) return;
    if (pendingFiles.length > 0) {
      await handleSendFiles();
      return;
    }
    if (!inputText.trim()) return;
    const draft = inputText;
    const result = await onSend(draft);
    if (result.ok) {
      setInputText((current) => (current === draft ? '' : current));
    } else {
      setSyncSnack({
        show: true,
        text: result.error || 'Gửi tin nhắn thất bại.',
        color: 'error',
      });
    }
  }

  async function handleLoadOlder() {
    if (!onLoadOlder || loadingOlder) return;
    const element = containerRef.current;
    if (element) {
      preserveScrollRef.current = { height: element.scrollHeight, top: element.scrollTop };
    }
    const loaded = await onLoadOlder();
    if (!loaded) preserveScrollRef.current = null;
  }

  function handleMessageScroll() {
    const element = containerRef.current;
    if (!element) return;
    const nearBottom = element.scrollHeight - element.scrollTop - element.clientHeight < 120;
    nearBottomRef.current = nearBottom;
    if (nearBottom) setShowJumpToBottom(false);
  }

  function jumpToBottom() {
    const element = containerRef.current;
    if (!element) return;
    element.scrollTo({ top: element.scrollHeight, behavior: 'smooth' });
    nearBottomRef.current = true;
    setShowJumpToBottom(false);
  }

  const MAX_FILES = 10;
  const MAX_FILE_SIZE = 100 * 1024 * 1024;

  function addFiles(list: FileList | File[] | null) {
    if (!list) return;
    const incoming = Array.from(list).filter((f) => f.size > 0);
    const oversized = incoming.filter((f) => f.size > MAX_FILE_SIZE);
    if (oversized.length > 0) {
      setSyncSnack({ show: true, text: `File quá lớn (tối đa 100MB): ${oversized[0].name}`, color: 'error' });
    }
    const valid = incoming.filter((f) => f.size <= MAX_FILE_SIZE);
    if (valid.length === 0) return;
    setPendingFiles((prev) => {
      const next = [...prev, ...valid];
      if (next.length > MAX_FILES) {
        setSyncSnack({ show: true, text: `Tối đa ${MAX_FILES} file mỗi lần gửi`, color: 'warning' });
      }
      return next.slice(0, MAX_FILES);
    });
  }

  function removePendingFile(index: number) {
    setPendingFiles((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSendFiles() {
    if (!onSendFiles || pendingFiles.length === 0 || sending) return;
    const files = pendingFiles;
    const caption = inputText.trim();
    const ok = await onSendFiles(files, caption || undefined);
    if (ok) {
      setPendingFiles([]);
      setInputText('');
    } else {
      setSyncSnack({ show: true, text: 'Gửi file thất bại — thử lại sau', color: 'error' });
    }
  }

  function handlePaste(e: React.ClipboardEvent) {
    const items = e.clipboardData?.files;
    if (items && items.length > 0) {
      e.preventDefault();
      addFiles(items);
    }
  }

  async function downloadFile(messageId: string, file: { name: string; href: string }) {
    if (downloadingFileId) return;
    setDownloadingFileId(messageId);
    try {
      const response = await api.get(`/messages/${messageId}/download`, {
        responseType: 'blob',
        timeout: 180_000,
      });
      const blobUrl = URL.createObjectURL(response.data as Blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = file.name || 'zalo-file';
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(blobUrl), 10_000);
      setSyncSnack({ show: true, text: `Đã tải ${file.name}`, color: 'success' });
    } catch (err: any) {
      let errorText = 'Không thể tải file';
      const data = err?.response?.data;
      if (data instanceof Blob) {
        try {
          const parsed = JSON.parse(await data.text());
          if (parsed?.error) errorText = parsed.error;
        } catch {
          // Keep the generic message for non-JSON upstream errors.
        }
      }
      setSyncSnack({ show: true, text: errorText, color: 'error' });
    } finally {
      setDownloadingFileId(null);
    }
  }

  function profileForMessage(msg: Message): ChatProfile {
    if (msg.senderType === 'self') {
      return {
        uid: conversation?.zaloAccount?.zaloUid || msg.senderUid,
        name: conversation?.zaloAccount?.displayName || msg.senderName || 'Bạn',
        avatarUrl: conversation?.zaloAccount?.avatarUrl || null,
        phone: conversation?.zaloAccount?.phone,
        kind: 'self',
      };
    }
    const uid = String(msg.senderUid || '').replace(/_0$/, '');
    if (conversation?.threadType === 'group') {
      const member = groupMembers[uid];
      return {
        uid: uid || null,
        name: member?.displayName || msg.senderName || 'Thành viên',
        avatarUrl: member?.avatarUrl || null,
        kind: 'group-member',
      };
    }
    return {
      uid: uid || null,
      name: conversation?.contact?.fullName || msg.senderName || 'Khách hàng',
      avatarUrl: conversation?.contact?.avatarUrl || null,
      phone: conversation?.contact?.phone,
      kind: 'contact',
    };
  }

  async function openPrivateChat(profile: ChatProfile) {
    if (!conversation?.zaloAccount?.id || !profile.uid || openingPrivateChat) return;
    setOpeningPrivateChat(true);
    try {
      const response = await api.post(
        `/zalo-accounts/${conversation.zaloAccount.id}/conversations/for-user`,
        { zaloUid: profile.uid },
      );
      const conversationId = response.data?.conversation?.id;
      if (!conversationId) throw new Error('Missing conversation id');
      setSelectedProfile(null);
      onOpenConversation?.(conversationId);
    } catch (err: any) {
      setSyncSnack({
        show: true,
        text: err?.response?.data?.error || 'Không thể mở trò chuyện riêng',
        color: 'error',
      });
    } finally {
      setOpeningPrivateChat(false);
    }
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
        type: 'follow_up',
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

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const conversationChanged = previousConversationRef.current !== (conversation?.id ?? null);
    previousConversationRef.current = conversation?.id ?? null;
    const preserved = preserveScrollRef.current;
    if (preserved) {
      el.scrollTop = preserved.top + (el.scrollHeight - preserved.height);
      preserveScrollRef.current = null;
    } else if (
      conversationChanged
      || nearBottomRef.current
      || messages[messages.length - 1]?.senderType === 'self'
    ) {
      el.scrollTop = el.scrollHeight;
      nearBottomRef.current = true;
      setShowJumpToBottom(false);
    } else if (messages.length > 0) {
      setShowJumpToBottom(true);
    }
  }, [conversation?.id, messages.length]);

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
        <button
          type="button"
          className="shrink-0 rounded-full transition-transform hover:scale-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          aria-label={conversation.threadType === 'group' ? 'Xem thông tin nhóm' : 'Xem thông tin liên hệ'}
          onClick={() => {
            if (conversation.threadType === 'group') {
              onToggleContactPanel();
            } else {
              setSelectedProfile({
                uid: conversation.contact?.zaloUid || null,
                name: conversation.contact?.fullName || 'Khách hàng',
                avatarUrl: conversation.contact?.avatarUrl || null,
                phone: conversation.contact?.phone,
                kind: 'contact',
              });
            }
          }}
        >
          <Avatar
            src={conversation.threadType === 'group' ? undefined : conversation.contact?.avatarUrl ?? undefined}
            name={conversation.contact?.fullName || undefined}
            icon={
              conversation.threadType === 'group' ? <UsersThree size={18} /> : <User size={18} />
            }
            showFallback
            size="sm"
            className="bg-default-100 text-foreground-500"
          />
        </button>
        <button
          type="button"
          className="min-w-0 flex-1 text-left"
          onClick={() => conversation.threadType === 'group' ? onToggleContactPanel() : setSelectedProfile({
            uid: conversation.contact?.zaloUid || null,
            name: conversation.contact?.fullName || 'Khách hàng',
            avatarUrl: conversation.contact?.avatarUrl || null,
            phone: conversation.contact?.phone,
            kind: 'contact',
          })}
        >
          <div className="truncate text-sm font-medium">
            {conversation.contact?.fullName || 'Unknown'}
          </div>
          <div className="truncate text-xs text-foreground-500">
            {conversation.zaloAccount?.displayName || 'Zalo'}
          </div>
        </button>
        {conversation.threadType === 'group' && (
          <Button
            isIconOnly
            size="sm"
            variant="light"
            isLoading={syncing}
            aria-label="Đồng bộ tin nhắn từ Zalo"
            title="Đồng bộ tối đa 200 tin nhắn nhóm gần nhất từ Zalo"
            onPress={() => void handleSyncMessages()}
          >
            <ArrowsClockwise size={20} />
          </Button>
        )}
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
      <div
        ref={containerRef}
        className="chat-message-list flex-1 overflow-y-auto px-3 py-3"
        onScroll={handleMessageScroll}
      >
        {loading && (
          <div className="flex justify-center pb-2">
            <Spinner size="sm" color="primary" />
          </div>
        )}

        {hasOlderMessages && (
          <div className="flex justify-center pb-3">
            <Button
              size="sm"
              variant="flat"
              isLoading={loadingOlder}
              onPress={() => void handleLoadOlder()}
            >
              Tải tin nhắn cũ hơn
            </Button>
          </div>
        )}

        {messageError && (
          <div className="mx-auto mb-3 flex max-w-xl items-center gap-2">
            <Alert color="warning" title={messageError} className="flex-1" />
            <Button
              size="sm"
              variant="flat"
              onPress={() => {
                if (messages.length > 0 && hasOlderMessages) void handleLoadOlder();
                else onRefreshMessages?.();
              }}
            >
              Thử lại
            </Button>
          </div>
        )}

        {messages.map((msg, idx) => {
          const profile = profileForMessage(msg);
          const isSelf = msg.senderType === 'self';
          return (
          <Fragment key={msg.id}>
            {isNewDay(idx > 0 ? messages[idx - 1].sentAt : undefined, msg.sentAt) && (
              <div className="my-3 flex justify-center">
                <span className="chat-day-divider rounded-full bg-default-100 px-3 py-0.5 text-xs text-foreground-500">
                  {formatDayDivider(msg.sentAt)}
                </span>
              </div>
            )}
          <div
            className={`mb-2 flex items-end gap-2 ${isSelf ? 'justify-end' : 'justify-start'}`}
          >
            {!isSelf && (
              <button
                type="button"
                className="mb-0.5 shrink-0 rounded-full transition-transform hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                aria-label={`Mở liên hệ ${profile.name}`}
                title={`Mở liên hệ ${profile.name}`}
                onClick={() => setSelectedProfile(profile)}
              >
                <Avatar
                  size="sm"
                  src={profile.avatarUrl || undefined}
                  name={profile.name}
                  showFallback
                  className="h-8 w-8 bg-default-100 text-xs"
                />
              </button>
            )}
            <div style={{ maxWidth: '70%' }} title={`${formatMessageTime(msg.sentAt)}, ${formatDayDivider(msg.sentAt)}`}>
              {conversation.threadType === 'group' && msg.senderType !== 'self' && (
                <button
                  type="button"
                  className="mb-1 block max-w-full truncate text-left text-xs font-medium text-primary hover:underline"
                  onClick={() => setSelectedProfile(profile)}
                >
                  {profile.name}
                </button>
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
                ) : getVideoInfo(msg) ? (
                  <video
                    src={getVideoInfo(msg)!.href}
                    poster={getVideoInfo(msg)!.thumb ?? undefined}
                    controls
                    preload="metadata"
                    className="max-h-[300px] max-w-full rounded-xl"
                  />
                ) : getVoiceUrl(msg) ? (
                  <audio src={getVoiceUrl(msg)!} controls preload="metadata" className="max-w-full" />
                ) : getImageUrl(msg) ? (
                  <div>
                    <ChatImage
                      src={getImageUrl(msg)!}
                      onClick={() => setPreviewImageUrl(getImageUrl(msg)!)}
                    />
                    {getImageCaption(msg) && (
                      <div className="mt-1 whitespace-pre-wrap">{getImageCaption(msg)}</div>
                    )}
                  </div>
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
                        isLoading={downloadingFileId === msg.id}
                        aria-label="Tải xuống"
                        onPress={() => void downloadFile(msg.id, getFileInfo(msg)!)}
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
            {isSelf && (
              <button
                type="button"
                className="mb-0.5 shrink-0 rounded-full transition-transform hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                aria-label="Xem tài khoản gửi tin"
                title="Tài khoản gửi tin"
                onClick={() => setSelectedProfile(profile)}
              >
                <Avatar
                  size="sm"
                  src={profile.avatarUrl || undefined}
                  name={profile.name}
                  showFallback
                  color="primary"
                  className="h-8 w-8 text-xs"
                />
              </button>
            )}
          </div>
          </Fragment>
          );
        })}

        {!loading && !messageError && messages.length === 0 && (
          <div className="py-8 text-center text-foreground-500">Chưa có tin nhắn</div>
        )}
      </div>

      {showJumpToBottom && (
        <Button
          size="sm"
          color="primary"
          variant="shadow"
          className="absolute bottom-24 right-4 z-20"
          onPress={jumpToBottom}
        >
          Tin nhắn mới ↓
        </Button>
      )}

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

      {/* Pending attachments strip */}
      {pendingFiles.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-t border-default bg-content1 px-3 py-2">
          {pendingFiles.map((file, index) => (
            <PendingFileChip
              key={`${file.name}-${file.size}-${index}`}
              file={file}
              onRemove={() => removePendingFile(index)}
            />
          ))}
        </div>
      )}

      {/* Input */}
      <div className="chat-toolbar chat-toolbar--composer relative flex items-end gap-2 border-t border-default p-2">
        <input
          ref={imageInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif,video/mp4"
          multiple
          className="hidden"
          onChange={(e) => {
            addFiles(e.target.files);
            e.target.value = '';
          }}
        />
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            addFiles(e.target.files);
            e.target.value = '';
          }}
        />
        <Textarea
          id="chat-message-input"
          placeholder={pendingFiles.length > 0 ? 'Thêm chú thích (tuỳ chọn)...' : 'Nhập tin nhắn...'}
          value={inputText}
          onValueChange={setInputText}
          minRows={1}
          maxRows={3}
          variant="bordered"
          className="flex-1"
          onPaste={handlePaste}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void handleSend();
            }
          }}
        />
        <div className="flex items-center gap-1 pb-1">
          <Button
            isIconOnly
            size="sm"
            variant="light"
            aria-label="Gửi hình ảnh hoặc video"
            onPress={() => imageInputRef.current?.click()}
          >
            <ImageIcon size={18} />
          </Button>
          <Button
            isIconOnly
            size="sm"
            variant="light"
            aria-label="Đính kèm file"
            onPress={() => fileInputRef.current?.click()}
          >
            <Paperclip size={18} />
          </Button>
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
          isDisabled={!inputText.trim() && pendingFiles.length === 0}
          aria-label="Gửi"
          onPress={() => void handleSend()}
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
                          onClick={() => void sendStickerItem(st)}
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

      {/* Clickable sender / recipient profile */}
      <Modal
        isOpen={Boolean(selectedProfile)}
        onOpenChange={(open) => !open && setSelectedProfile(null)}
        size="sm"
        placement="center"
      >
        <ModalContent>
          {(onClose) => (
            <>
              <ModalBody className="items-center px-5 pb-2 pt-6 text-center">
                <Avatar
                  src={selectedProfile?.avatarUrl || undefined}
                  name={selectedProfile?.name || '?'}
                  showFallback
                  isBordered
                  color="primary"
                  className="h-24 w-24 text-2xl"
                />
                <div>
                  <div className="text-lg font-semibold">{selectedProfile?.name}</div>
                  <div className="text-sm text-foreground-500">
                    {selectedProfile?.kind === 'self'
                      ? 'Tài khoản Zalo đang gửi tin'
                      : selectedProfile?.kind === 'group-member'
                        ? 'Thành viên nhóm Zalo'
                        : selectedProfile?.phone || 'Liên hệ Zalo'}
                  </div>
                </div>
              </ModalBody>
              <ModalFooter className="justify-center">
                <Button variant="light" onPress={onClose}>Đóng</Button>
                {selectedProfile?.kind === 'contact' && (
                  <>
                    {selectedProfile.phone && (
                      <Button
                        variant="flat"
                        color="success"
                        startContent={<PhoneCall size={17} />}
                        onPress={() => { window.location.href = `tel:${selectedProfile.phone}`; }}
                      >
                        Gọi điện
                      </Button>
                    )}
                    <Button
                      color="primary"
                      startContent={<IdentificationCard size={17} />}
                      onPress={() => {
                        onClose();
                        onOpenContactPanel?.();
                      }}
                    >
                      Xem liên hệ
                    </Button>
                  </>
                )}
                {selectedProfile?.kind === 'group-member' && selectedProfile.uid && (
                  <Button
                    color="primary"
                    isLoading={openingPrivateChat}
                    startContent={<ChatText size={17} />}
                    onPress={() => void openPrivateChat(selectedProfile)}
                  >
                    Nhắn tin riêng
                  </Button>
                )}
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>

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
