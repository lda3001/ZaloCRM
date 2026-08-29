import { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Divider,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Select,
  SelectItem,
  Spinner,
} from '@heroui/react';
import type { SharedSelection } from '@heroui/react';
import { ShieldCheck, Trash, User } from '@phosphor-icons/react';
import { api } from '../../api/client';
import { useUsers } from '../../hooks/use-users';

interface AccessEntry {
  id: string;
  userId: string;
  fullName: string;
  email: string;
  permission: string;
}

interface Props {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  accountId: string;
  accountName: string;
}

const permissionOptions = [
  { label: 'Xem', value: 'read' },
  { label: 'Chat', value: 'chat' },
  { label: 'Quản lý', value: 'admin' },
];

function firstKey(keys: SharedSelection): string {
  if (keys === 'all') return '';
  if (typeof keys === 'string' || typeof keys === 'number') return String(keys);
  const first = keys[Symbol.iterator]().next();
  return first.done ? '' : String(first.value);
}

export default function ZaloAccessDialog({
  isOpen,
  onOpenChange,
  accountId,
  accountName,
}: Props) {
  const { users, fetchUsers } = useUsers();

  const [accessList, setAccessList] = useState<AccessEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dialogError, setDialogError] = useState('');
  const [newUserId, setNewUserId] = useState('');
  const [newPermission, setNewPermission] = useState('read');

  useEffect(() => {
    if (!isOpen) return;
    setDialogError('');
    void fetchAccess();
    void fetchUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, accountId]);

  async function fetchAccess() {
    if (!accountId) return;
    setLoading(true);
    try {
      const res = await api.get(`/zalo-accounts/${accountId}/access`);
      setAccessList(res.data.access ?? res.data);
    } catch {
      setAccessList([]);
    } finally {
      setLoading(false);
    }
  }

  async function handleAddAccess() {
    if (!newUserId) return;
    setSaving(true);
    setDialogError('');
    try {
      await api.post(`/zalo-accounts/${accountId}/access`, {
        userId: newUserId,
        permission: newPermission,
      });
      setNewUserId('');
      setNewPermission('read');
      await fetchAccess();
    } catch (err) {
      const e = err as { response?: { data?: { error?: string } } };
      setDialogError(e.response?.data?.error || 'Lỗi thêm quyền truy cập');
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdatePermission(accessId: string, permission: string) {
    try {
      await api.put(`/zalo-accounts/${accountId}/access/${accessId}`, { permission });
      await fetchAccess();
    } catch (err) {
      const e = err as { response?: { data?: { error?: string } } };
      setDialogError(e.response?.data?.error || 'Lỗi cập nhật quyền');
    }
  }

  async function handleRemoveAccess(accessId: string) {
    try {
      await api.delete(`/zalo-accounts/${accountId}/access/${accessId}`);
      await fetchAccess();
    } catch (err) {
      const e = err as { response?: { data?: { error?: string } } };
      setDialogError(e.response?.data?.error || 'Lỗi xóa quyền truy cập');
    }
  }

  const grantedIds = new Set(accessList.map((a) => a.userId));
  const availableUsers = users.filter((u) => !grantedIds.has(u.id));

  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange} size="lg" scrollBehavior="inside">
      <ModalContent>
        {(onClose) => (
          <>
            <ModalHeader className="flex items-center gap-2">
              <ShieldCheck size={20} weight="regular" className="text-secondary" />
              Phân quyền truy cập — {accountName}
            </ModalHeader>

            <ModalBody className="gap-4">
              {loading && <Spinner size="sm" label="Đang tải..." />}

              {!loading && accessList.length > 0 && (
                <div>
                  <p className="mb-2 text-sm font-medium">Người có quyền truy cập</p>
                  <div className="space-y-2">
                    {accessList.map((a) => (
                      <div
                        key={a.id}
                        className="flex items-center gap-2 rounded-lg border border-default p-2"
                      >
                        <User size={18} className="shrink-0 text-secondary" />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium">{a.fullName}</div>
                          <div className="truncate text-xs text-foreground-500">{a.email}</div>
                        </div>
                        <Select
                          aria-label="Quyền"
                          size="sm"
                          variant="bordered"
                          className="w-32"
                          selectedKeys={[a.permission]}
                          onSelectionChange={(keys) =>
                            void handleUpdatePermission(a.id, firstKey(keys))
                          }
                        >
                          {permissionOptions.map((o) => (
                            <SelectItem key={o.value}>{o.label}</SelectItem>
                          ))}
                        </Select>
                        <Button
                          isIconOnly
                          size="sm"
                          variant="light"
                          color="danger"
                          aria-label="Xóa quyền"
                          title="Xóa quyền"
                          onPress={() => void handleRemoveAccess(a.id)}
                        >
                          <Trash size={16} />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {!loading && accessList.length === 0 && (
                <p className="text-sm text-foreground-500">Chưa có người dùng nào được cấp quyền</p>
              )}

              <Divider />

              <div>
                <p className="mb-2 text-sm font-medium">Thêm người dùng</p>
                <div className="flex items-start gap-2">
                  <Select
                    label="Chọn nhân viên"
                    placeholder="Chọn nhân viên"
                    variant="bordered"
                    size="sm"
                    className="flex-1"
                    selectedKeys={newUserId ? [newUserId] : []}
                    onSelectionChange={(keys) => setNewUserId(firstKey(keys))}
                  >
                    {availableUsers.map((u) => (
                      <SelectItem key={u.id}>{u.fullName}</SelectItem>
                    ))}
                  </Select>
                  <Select
                    label="Quyền"
                    variant="bordered"
                    size="sm"
                    className="w-32"
                    selectedKeys={[newPermission]}
                    onSelectionChange={(keys) => setNewPermission(firstKey(keys))}
                  >
                    {permissionOptions.map((o) => (
                      <SelectItem key={o.value}>{o.label}</SelectItem>
                    ))}
                  </Select>
                  <Button
                    color="primary"
                    isLoading={saving}
                    isDisabled={!newUserId}
                    onPress={() => void handleAddAccess()}
                  >
                    Thêm
                  </Button>
                </div>
                {dialogError && (
                  <Alert color="danger" title={dialogError} className="mt-3" />
                )}
              </div>
            </ModalBody>

            <ModalFooter>
              <Button variant="light" onPress={onClose}>
                Đóng
              </Button>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
}
