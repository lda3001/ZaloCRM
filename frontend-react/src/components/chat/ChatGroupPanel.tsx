import { useEffect, useMemo, useState } from 'react';
import { Alert, Avatar, Button, Chip, Input, Spinner } from '@heroui/react';
import { Crown, MagnifyingGlass, ShieldCheck, UsersThree, X } from '@phosphor-icons/react';
import { api } from '../../api/client';
import type { Conversation } from '../../hooks/use-chat';

interface GroupMember {
  id: string;
  displayName: string;
  zaloName: string | null;
  avatarUrl: string | null;
  isAdmin: boolean;
  isCreator: boolean;
}

interface GroupInfo {
  id: string;
  name: string;
  description: string;
  avatarUrl: string | null;
  type: 'group' | 'community';
  creatorId: string | null;
  memberCount: number;
  maxMember: number | null;
  createdAt: number | null;
  members: GroupMember[];
}

interface Props {
  conversation: Conversation;
  onClose: () => void;
}

function formatCreatedAt(value: number | null): string {
  if (!value) return '';
  const timestamp = value < 1_000_000_000_000 ? value * 1000 : value;
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('vi-VN');
}

export default function ChatGroupPanel({ conversation, onClose }: Props) {
  const [group, setGroup] = useState<GroupInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [memberSearch, setMemberSearch] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    setMemberSearch('');
    api
      .get(`/conversations/${conversation.id}/group-info`)
      .then((response) => {
        if (active) setGroup(response.data.group);
      })
      .catch((requestError) => {
        if (!active) return;
        setError(requestError?.response?.data?.error || 'Không tải được thông tin nhóm');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [conversation.id]);

  const members = useMemo(() => {
    const keyword = memberSearch.trim().toLocaleLowerCase('vi');
    const sorted = [...(group?.members ?? [])].sort((left, right) => {
      if (left.isCreator !== right.isCreator) return left.isCreator ? -1 : 1;
      if (left.isAdmin !== right.isAdmin) return left.isAdmin ? -1 : 1;
      return left.displayName.localeCompare(right.displayName, 'vi');
    });
    if (!keyword) return sorted;
    return sorted.filter((member) =>
      `${member.displayName} ${member.zaloName || ''}`.toLocaleLowerCase('vi').includes(keyword),
    );
  }, [group?.members, memberSearch]);

  const fallbackName = conversation.contact?.fullName || 'Nhóm Zalo';

  return (
    <div className="chat-side-panel flex h-full flex-col overflow-hidden">
      <div className="chat-panel-header flex items-center gap-2 border-b border-default px-3 py-2">
        <UsersThree size={20} className="text-primary" />
        <span className="text-sm font-medium">Thông tin nhóm</span>
        <Button isIconOnly size="sm" variant="light" aria-label="Đóng" className="ml-auto" onPress={onClose}>
          <X size={18} />
        </Button>
      </div>

      {loading ? (
        <div className="flex flex-1 items-center justify-center">
          <Spinner color="primary" label="Đang tải thông tin nhóm..." />
        </div>
      ) : error ? (
        <div className="p-3">
          <Alert color="warning" title={error} />
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          <div className="flex flex-col items-center gap-2 border-b border-default px-4 py-5 text-center">
            <Avatar
              src={group?.avatarUrl || undefined}
              name={group?.name || fallbackName}
              icon={<UsersThree size={34} />}
              showFallback
              className="h-24 w-24 bg-primary/10 text-primary"
              isBordered
              color="primary"
            />
            <div className="text-base font-semibold text-foreground">{group?.name || fallbackName}</div>
            <div className="flex flex-wrap justify-center gap-1">
              <Chip size="sm" color="primary" variant="flat">
                {group?.type === 'community' ? 'Cộng đồng' : 'Nhóm Zalo'}
              </Chip>
              <Chip size="sm" variant="flat" startContent={<UsersThree size={13} />}>
                {group?.memberCount || 0} thành viên
              </Chip>
            </div>
            {group?.description && (
              <p className="max-w-full whitespace-pre-wrap text-sm text-foreground-500">
                {group.description}
              </p>
            )}
            {formatCreatedAt(group?.createdAt ?? null) && (
              <div className="text-xs text-foreground-400">
                Tạo ngày {formatCreatedAt(group?.createdAt ?? null)}
              </div>
            )}
          </div>

          <div className="space-y-3 p-3">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold">Thành viên nhóm</div>
              <span className="text-xs text-foreground-500">
                {members.length}/{group?.memberCount || members.length}
              </span>
            </div>
            <Input
              size="sm"
              variant="bordered"
              placeholder="Tìm thành viên..."
              value={memberSearch}
              onValueChange={setMemberSearch}
              startContent={<MagnifyingGlass size={15} />}
              isClearable
              onClear={() => setMemberSearch('')}
            />
            <div className="space-y-1">
              {members.map((member) => {
                const isSelf = member.id === conversation.zaloAccount?.zaloUid;
                return (
                  <div key={member.id} className="flex items-center gap-2 rounded-xl px-2 py-2 hover:bg-default-100">
                    <Avatar
                      size="sm"
                      src={member.avatarUrl || undefined}
                      name={member.displayName}
                      showFallback
                      className="shrink-0 bg-default-100"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1">
                        <span className="truncate text-sm font-medium">{member.displayName}</span>
                        {isSelf && <span className="text-xs text-primary">(Bạn)</span>}
                      </div>
                      {member.zaloName && member.zaloName !== member.displayName && (
                        <div className="truncate text-xs text-foreground-500">{member.zaloName}</div>
                      )}
                    </div>
                    {member.isCreator ? (
                      <Chip size="sm" color="warning" variant="flat" startContent={<Crown size={12} />}>
                        Trưởng nhóm
                      </Chip>
                    ) : member.isAdmin ? (
                      <Chip size="sm" color="primary" variant="flat" startContent={<ShieldCheck size={12} />}>
                        Phó nhóm
                      </Chip>
                    ) : null}
                  </div>
                );
              })}
              {members.length === 0 && (
                <div className="py-8 text-center text-sm text-foreground-500">
                  Không tìm thấy thành viên
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
