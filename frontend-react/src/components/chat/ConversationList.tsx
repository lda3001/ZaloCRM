import { useEffect, useState } from 'react';
import { Avatar, Chip, Input, Select, SelectItem, Spinner } from '@heroui/react';
import type { SharedSelection } from '@heroui/react';
import { MagnifyingGlass, User, UsersThree } from '@phosphor-icons/react';
import { api } from '../../api/client';
import type { Conversation, ConversationTypeFilter } from '../../hooks/use-chat';

interface Props {
  conversations: Conversation[];
  selectedId: string | null;
  loading: boolean;
  search: string;
  threadFilter: ConversationTypeFilter;
  onSearchChange: (value: string) => void;
  onSelect: (id: string) => void;
  onFilterAccount: (accountId: string | null) => void;
  onFilterThread: (threadType: ConversationTypeFilter) => void;
}

interface AccountOption {
  text: string;
  value: string;
}

function firstKey(keys: SharedSelection): string {
  if (keys === 'all') return '';
  if (typeof keys === 'string' || typeof keys === 'number') return String(keys);
  const first = keys[Symbol.iterator]().next();
  return first.done ? '' : String(first.value);
}

function lastMessagePreview(conv: Conversation): string {
  const msg = conv.messages?.[0];
  if (!msg) return '';
  if (msg.isDeleted) return '(đã thu hồi)';
  const prefix = msg.senderType === 'self' ? 'Bạn: ' : '';

  switch (msg.contentType) {
    case 'image':
      return prefix + 'Hình ảnh';
    case 'sticker':
      return prefix + 'Sticker';
    case 'video':
      return prefix + 'Video';
    case 'voice':
      return prefix + 'Tin nhắn thoại';
    case 'gif':
      return prefix + 'GIF';
    case 'file':
      return prefix + 'Tệp đính kèm';
    case 'link':
      return prefix + 'Liên kết';
    case 'contact_card': {
      try {
        const card = JSON.parse(msg.content || '{}');
        if (typeof card.action === 'string' && (card.action.includes('calltime') || card.action.includes('misscall'))) {
          const params = typeof card.params === 'string' ? JSON.parse(card.params) : card.params || {};
          const dur = Number(params.duration || 0);
          const durText = dur > 0 ? (dur < 60 ? dur + ' giây' : Math.floor(dur / 60) + ' phút ' + (dur % 60) + ' giây') : 'nhỡ';
          return prefix + (card.description || 'Cuộc gọi') + ' (' + durText + ')';
        }
        if (card.title) return prefix + card.title.slice(0, 50);
      } catch {
        /* not JSON */
      }
      return prefix + 'Thẻ liên hệ';
    }
  }

  // Reminder/calendar messages.
  if (msg.content) {
    try {
      const p = JSON.parse(msg.content);
      if (p.action === 'msginfo.actionlist' && p.title) {
        return prefix + p.title.slice(0, 50);
      }
    } catch {
      /* not JSON */
    }
  }

  const text = msg.content || '';
  return prefix + (text.length > 50 ? text.slice(0, 50) + '...' : text);
}

function formatTime(dateStr: string | null): string {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return 'Vừa xong';
  if (diffMins < 60) return `${diffMins} phút`;

  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours} giờ`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return 'Hôm qua';
  if (diffDays < 7) return `${diffDays} ngày`;

  return date.toLocaleDateString('vi-VN');
}

export default function ConversationList({
  conversations,
  selectedId,
  loading,
  search,
  threadFilter,
  onSearchChange,
  onSelect,
  onFilterAccount,
  onFilterThread,
}: Props) {
  const [accountOptions, setAccountOptions] = useState<AccountOption[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await api.get('/zalo-accounts');
        const accounts = Array.isArray(res.data) ? res.data : res.data.accounts || [];
        const options: AccountOption[] = accounts.map((a: { displayName?: string; zaloUid?: string; id: string }) => ({
          text: a.displayName || a.zaloUid || a.id,
          value: a.id,
        }));
        if (active) setAccountOptions(options);
      } catch {
        // Non-critical — filter just won't show accounts.
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="chat-side-panel flex h-full flex-col bg-content1">
      {/* Account filter + search */}
      <div className="space-y-2 p-2">
        <Select
          label="Tài khoản Zalo"
          placeholder="Tất cả Zalo"
          variant="bordered"
          size="sm"
          selectedKeys={selectedAccountId ? [selectedAccountId] : []}
          onSelectionChange={(keys) => {
            const id = firstKey(keys) || null;
            setSelectedAccountId(id);
            onFilterAccount(id);
          }}
          onClear={() => {
            setSelectedAccountId(null);
            onFilterAccount(null);
          }}
        >
          {accountOptions.map((o) => (
            <SelectItem key={o.value}>{o.text}</SelectItem>
          ))}
        </Select>

        <div className="grid grid-cols-3 rounded-xl bg-default-100 p-1" aria-label="Loại hội thoại">
          {([
            { value: 'all', label: 'Tất cả' },
            { value: 'user', label: 'Khách hàng' },
            { value: 'group', label: 'Nhóm' },
          ] as const).map((option) => (
            <button
              key={option.value}
              type="button"
              className={`rounded-lg px-2 py-1.5 text-xs font-medium transition-colors ${
                threadFilter === option.value
                  ? 'bg-background text-primary shadow-sm'
                  : 'text-foreground-500 hover:text-foreground'
              }`}
              onClick={() => onFilterThread(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>

        <Input
          placeholder="Tìm kiếm..."
          value={search}
          onValueChange={onSearchChange}
          startContent={<MagnifyingGlass size={16} />}
          variant="bordered"
          size="sm"
          isClearable
          onClear={() => onSearchChange('')}
        />
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {loading && (
          <div className="flex justify-center p-3">
            <Spinner size="sm" color="primary" />
          </div>
        )}

        {conversations.map((conv) => {
          const isActive = conv.id === selectedId;
          const hasUnread = conv.unreadCount > 0 && !isActive;
          const name =
            conv.threadType === 'group'
              ? conv.contact?.fullName || 'Nhóm'
              : conv.contact?.fullName || 'Unknown';

          return (
            <button
              key={conv.id}
              type="button"
              onClick={() => onSelect(conv.id)}
              className={`chat-conversation-row flex w-full items-start gap-3 px-3 py-2.5 text-left transition-colors ${
                isActive
                  ? 'chat-conversation-row--active bg-primary-50 text-primary-700 shadow-[inset_3px_0_0_#0868e8] dark:bg-primary-500/15 dark:text-foreground dark:shadow-none'
                  : hasUnread
                    ? 'chat-conversation-row--unread bg-default-100 hover:bg-default-200'
                    : 'hover:bg-default-100'
              }`}
            >
              <Avatar
                src={conv.threadType === 'group' ? undefined : conv.contact?.avatarUrl ?? undefined}
                icon={
                  conv.threadType === 'group' ? (
                    <UsersThree size={20} />
                  ) : (
                    <User size={20} />
                  )
                }
                showFallback
                size="sm"
                className="shrink-0 bg-default-100 text-foreground-500"
              />

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1">
                  <span
                    className={`truncate text-sm ${
                      conv.unreadCount > 0 ? 'font-bold' : 'font-medium'
                    }`}
                  >
                    {name}
                  </span>
                  {conv.threadType === 'group' && (
                    <Chip size="sm" variant="flat" color="primary" className="h-4 px-1 text-[10px]">
                      Nhóm
                    </Chip>
                  )}
                  <span className="ml-auto shrink-0 pl-1 text-[11px] tabular-nums text-foreground-400">
                    {formatTime(conv.lastMessageAt)}
                  </span>
                </div>

                <div className="flex items-center gap-1">
                  <span
                    className={`min-w-0 flex-1 truncate text-xs text-foreground-500 ${
                      conv.unreadCount > 0 ? 'font-medium' : ''
                    }`}
                  >
                    {lastMessagePreview(conv)}
                  </span>
                  {conv.unreadCount > 0 && (
                    <span className="shrink-0 rounded-full bg-danger px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-white">
                      {conv.unreadCount}
                    </span>
                  )}
                </div>
              </div>

              {conv.zaloAccount?.displayName && (
                <span className="hidden max-w-[60px] shrink-0 overflow-hidden text-ellipsis whitespace-nowrap text-[10px] text-foreground-400 md:inline">
                  {conv.zaloAccount.displayName}
                </span>
              )}
            </button>
          );
        })}

        {!loading && conversations.length === 0 && (
          <div className="py-8 text-center text-sm text-foreground-500">
            Chưa có cuộc trò chuyện nào
          </div>
        )}
      </div>
    </div>
  );
}
