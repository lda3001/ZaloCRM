import { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  CardBody,
  Chip,
  Input,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Select,
  SelectItem,
  Skeleton,
  Switch,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
  Tabs,
} from '@heroui/react';
import type { SharedSelection } from '@heroui/react';
import { BellSimple, GearSix, LockKey, PencilSimple, Plus, SpeakerHigh, Trash } from '@phosphor-icons/react';
import OrgSettings from '../components/settings/OrgSettings';
import TeamManagement from '../components/settings/TeamManagement';
import { useUsers, type OrgUser } from '../hooks/use-users';
import { selectIsAdmin, selectIsOwner, useAuthStore } from '../stores/auth';
import {
  ensureNotificationPermission,
  isNotificationEnabled,
  isSoundEnabled,
  notificationPermission,
  playNotifySound,
  setNotificationEnabled,
  setSoundEnabled as persistSoundEnabled,
} from '../utils/desktop-notify';

interface UserForm {
  fullName: string;
  email: string;
  password: string;
  role: string;
}

const emptyForm = (): UserForm => ({ fullName: '', email: '', password: '', role: 'member' });

const roleOptions = [
  { label: 'Nhân viên', value: 'member' },
  { label: 'Quản trị viên', value: 'admin' },
];

// Vue role colors (owner=primary, admin=info, member=default) → HeroUI semantic colors.
function roleColor(role: string): 'default' | 'primary' | 'secondary' {
  if (role === 'owner') return 'primary';
  if (role === 'admin') return 'secondary';
  return 'default';
}

function roleLabel(role: string): string {
  if (role === 'owner') return 'Chủ sở hữu';
  if (role === 'admin') return 'Quản trị viên';
  return 'Nhân viên';
}

function firstKey(keys: SharedSelection): string {
  if (keys === 'all') return '';
  if (typeof keys === 'string' || typeof keys === 'number') return String(keys);
  const first = keys[Symbol.iterator]().next();
  return first.done ? '' : String(first.value);
}

export default function SettingsView() {
  const { users, loading, error, fetchUsers, createUser, updateUser, resetPassword, deleteUser } =
    useUsers();
  const isAdmin = useAuthStore(selectIsAdmin);
  const isOwner = useAuthStore(selectIsOwner);
  const currentUserId = useAuthStore((s) => s.user?.id);

  // Notification preferences (desktop notifications for incoming messages).
  const [notifyEnabled, setNotifyEnabled] = useState<boolean>(() => isNotificationEnabled());
  const [permState, setPermState] = useState(() => notificationPermission());
  const [soundEnabled, setSoundEnabledState] = useState<boolean>(() => isSoundEnabled());

  function refreshPerm() {
    setPermState(notificationPermission());
  }

  async function handleEnableNotifications() {
    const granted = await ensureNotificationPermission();
    setPermState(granted ? 'granted' : notificationPermission());
    if (granted) setNotifyEnabled(true);
  }

  const [tab, setTab] = useState<string>('users');

  const [showCreate, setShowCreate] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dialogError, setDialogError] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [selectedUser, setSelectedUser] = useState<OrgUser | null>(null);
  const [form, setForm] = useState<UserForm>(emptyForm());

  useEffect(() => {
    void fetchUsers();
    // Initial load only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function openCreate() {
    setForm(emptyForm());
    setDialogError('');
    setShowCreate(true);
  }

  function openEdit(user: OrgUser) {
    setSelectedUser(user);
    setForm({ fullName: user.fullName, email: user.email, password: '', role: user.role });
    setDialogError('');
    setShowEdit(true);
  }

  function openPassword(user: OrgUser) {
    setSelectedUser(user);
    setNewPassword('');
    setDialogError('');
    setShowPassword(true);
  }

  function confirmDelete(user: OrgUser) {
    setSelectedUser(user);
    setShowDelete(true);
  }

  async function handleCreate() {
    setSaving(true);
    setDialogError('');
    const res = await createUser(form);
    setSaving(false);
    if (res.ok) setShowCreate(false);
    else setDialogError(res.error || '');
  }

  async function handleUpdate() {
    if (!selectedUser) return;
    setSaving(true);
    setDialogError('');
    const res = await updateUser(selectedUser.id, {
      fullName: form.fullName,
      email: form.email,
      role: form.role,
    });
    setSaving(false);
    if (res.ok) setShowEdit(false);
    else setDialogError(res.error || '');
  }

  async function handlePassword() {
    if (!selectedUser) return;
    setSaving(true);
    setDialogError('');
    const res = await resetPassword(selectedUser.id, newPassword);
    setSaving(false);
    if (res.ok) setShowPassword(false);
    else setDialogError(res.error || '');
  }

  async function handleDelete() {
    if (!selectedUser) return;
    setSaving(true);
    const res = await deleteUser(selectedUser.id);
    setSaving(false);
    if (res.ok) setShowDelete(false);
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="flex items-center gap-2 text-xl font-semibold text-foreground">
        <GearSix size={22} weight="regular" className="text-primary" />
        Cài đặt
      </h1>

      <Tabs
        aria-label="Cài đặt"
        selectedKey={tab}
        onSelectionChange={(key) => setTab(String(key))}
        destroyInactiveTabPanel
      >
        <Tab key="users" title="Nhân viên">
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="mr-auto text-lg font-semibold text-foreground">Danh sách nhân viên</h2>
              {isAdmin && (
                <Button color="primary" startContent={<Plus size={18} />} onPress={openCreate}>
                  Thêm nhân viên
                </Button>
              )}
            </div>

            {error && <Alert color="danger" title={error} onClose={() => undefined} />}

            <Table
              aria-label="Danh sách nhân viên"
              className="text-sm"
              classNames={{ wrapper: 'rounded-2xl border border-default p-0 shadow-sm' }}
            >
              <TableHeader>
                <TableColumn>Họ tên</TableColumn>
                <TableColumn>Email</TableColumn>
                <TableColumn>Vai trò</TableColumn>
                <TableColumn>Trạng thái</TableColumn>
                <TableColumn align="end">Hành động</TableColumn>
              </TableHeader>
              <TableBody
                items={users}
                isLoading={loading}
                emptyContent={
                  <div className="py-8 text-center text-sm text-foreground-500">
                    Chưa có nhân viên nào
                  </div>
                }
                loadingContent={
                  <div className="space-y-3 py-3">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Skeleton key={i} className="h-9 w-full rounded-lg" />
                    ))}
                  </div>
                }
              >
                {(item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">{item.fullName}</TableCell>
                    <TableCell>{item.email}</TableCell>
                    <TableCell>
                      <Chip size="sm" variant="flat" color={roleColor(item.role)}>
                        {roleLabel(item.role)}
                      </Chip>
                    </TableCell>
                    <TableCell>
                      <Chip size="sm" variant="flat" color={item.isActive ? 'success' : 'default'}>
                        {item.isActive ? 'Hoạt động' : 'Vô hiệu'}
                      </Chip>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        {isAdmin && (
                          <Button
                            isIconOnly
                            size="sm"
                            variant="light"
                            aria-label="Chỉnh sửa"
                            title="Chỉnh sửa"
                            onPress={() => openEdit(item)}
                          >
                            <PencilSimple size={16} />
                          </Button>
                        )}
                        {isAdmin && (
                          <Button
                            isIconOnly
                            size="sm"
                            variant="light"
                            aria-label="Đặt lại mật khẩu"
                            title="Đặt lại mật khẩu"
                            onPress={() => openPassword(item)}
                          >
                            <LockKey size={16} />
                          </Button>
                        )}
                        {isOwner && item.id !== currentUserId && (
                          <Button
                            isIconOnly
                            size="sm"
                            variant="light"
                            color="danger"
                            aria-label="Vô hiệu hóa"
                            title="Vô hiệu hóa"
                            onPress={() => confirmDelete(item)}
                          >
                            <Trash size={16} />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </Tab>

        <Tab key="teams" title="Đội nhóm">
          <TeamManagement />
        </Tab>

        <Tab key="org" title="Tổ chức">
          <OrgSettings />
        </Tab>
        <Tab key="notify" title="Thông báo">
          <div className="flex max-w-2xl flex-col gap-4">
            <Card className="crm-card rounded-2xl border border-default">
              <CardBody className="gap-3 p-5">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                      <BellSimple size={20} className="text-primary" />
                    </span>
                    <div>
                      <h2 className="font-semibold text-foreground">Thông báo tin nhắn đến</h2>
                      <p className="mt-0.5 text-sm text-foreground-500">
                        Hiển thị thông báo trên desktop khi có tin nhắn Zalo mới.
                        Nhấp vào thông báo để mở ngay cuộc trò chuyện.
                        Để tắt thông báo riêng cho từng người / nhóm, dùng nút chuông
                        ở đầu màn hình Chat.
                      </p>
                    </div>
                  </div>
                  <Switch
                    isSelected={notifyEnabled}
                    onValueChange={(v) => {
                      setNotifyEnabled(v);
                      setNotificationEnabled(v);
                    }}
                    aria-label="Bật thông báo tin nhắn"
                  />
                </div>
                <div className="flex flex-wrap items-center gap-3 pt-1">
                  {permState === 'granted' ? (
                    <Chip size="sm" variant="flat" color="success">
                      Đã cấp quyền thông báo
                    </Chip>
                  ) : permState === 'denied' ? (
                    <Alert
                      color="warning"
                      title="Quyền thông báo đang bị tắt"
                      description="Bật lại trong cấu hình trình duyệt / hệ điều hành cho ứng dụng."
                    />
                  ) : permState === 'unsupported' ? (
                    <Chip size="sm" variant="flat" color="default">
                      Trình duyệt không hỗ trợ thông báo
                    </Chip>
                  ) : (
                    <Button size="sm" color="primary" onPress={() => void handleEnableNotifications()}>
                      Bật thông báo
                    </Button>
                  )}
                  <Button size="sm" variant="flat" onPress={refreshPerm}>
                    Kiểm tra lại
                  </Button>
                </div>
              </CardBody>
            </Card>

            <Card className="crm-card rounded-2xl border border-default">
              <CardBody className="gap-3 p-5">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                      <SpeakerHigh size={20} className="text-primary" />
                    </span>
                    <div>
                      <h2 className="font-semibold text-foreground">Âm thanh thông báo</h2>
                      <p className="mt-0.5 text-sm text-foreground-500">
                        Phát âm báo khi có tin nhắn Zalo mới đến, kể cả khi bạn đang ở trang khác.
                      </p>
                    </div>
                  </div>
                  <Switch
                    isSelected={soundEnabled}
                    onValueChange={(v2) => {
                      setSoundEnabledState(v2);
                      persistSoundEnabled(v2);
                    }}
                    aria-label="Bật âm thanh thông báo"
                  />
                </div>
                <div className="flex flex-wrap items-center gap-3 pt-1">
                  <Button size="sm" color="primary" variant="flat" onPress={playNotifySound}>
                    Phát thử âm thanh
                  </Button>
                  <Chip size="sm" variant="flat" color={soundEnabled ? 'success' : 'default'}>
                    {soundEnabled ? 'Đã bật âm thanh' : 'Đã tắt âm thanh'}
                  </Chip>
                </div>
              </CardBody>
            </Card>
          </div>
        </Tab>
      </Tabs>

      {/* Create user dialog */}
      <Modal isOpen={showCreate} onOpenChange={setShowCreate} size="sm">
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader className="flex flex-col gap-1">Thêm nhân viên</ModalHeader>
              <ModalBody>
                <div className="flex flex-col gap-3">
                  <Input
                    label="Họ tên *"
                    value={form.fullName}
                    onValueChange={(v) => setForm((f) => ({ ...f, fullName: v }))}
                    variant="bordered"
                  />
                  <Input
                    label="Email *"
                    type="email"
                    value={form.email}
                    onValueChange={(v) => setForm((f) => ({ ...f, email: v }))}
                    variant="bordered"
                  />
                  <Input
                    label="Mật khẩu *"
                    type="password"
                    value={form.password}
                    onValueChange={(v) => setForm((f) => ({ ...f, password: v }))}
                    variant="bordered"
                  />
                  <Select
                    label="Vai trò"
                    variant="bordered"
                    selectedKeys={[form.role]}
                    onSelectionChange={(keys) => setForm((f) => ({ ...f, role: firstKey(keys) }))}
                  >
                    {roleOptions.map((o) => (
                      <SelectItem key={o.value}>{o.label}</SelectItem>
                    ))}
                  </Select>
                  {dialogError && <Alert color="danger" title={dialogError} />}
                </div>
              </ModalBody>
              <ModalFooter>
                <Button variant="light" onPress={onClose}>
                  Hủy
                </Button>
                <Button color="primary" isLoading={saving} onPress={() => void handleCreate()}>
                  Tạo
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>

      {/* Edit user dialog */}
      <Modal isOpen={showEdit} onOpenChange={setShowEdit} size="sm">
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader className="flex flex-col gap-1">Chỉnh sửa nhân viên</ModalHeader>
              <ModalBody>
                <div className="flex flex-col gap-3">
                  <Input
                    label="Họ tên"
                    value={form.fullName}
                    onValueChange={(v) => setForm((f) => ({ ...f, fullName: v }))}
                    variant="bordered"
                  />
                  <Input
                    label="Email"
                    type="email"
                    value={form.email}
                    onValueChange={(v) => setForm((f) => ({ ...f, email: v }))}
                    variant="bordered"
                  />
                  {isOwner && (
                    <Select
                      label="Vai trò"
                      variant="bordered"
                      selectedKeys={[form.role]}
                      onSelectionChange={(keys) => setForm((f) => ({ ...f, role: firstKey(keys) }))}
                    >
                      {roleOptions.map((o) => (
                        <SelectItem key={o.value}>{o.label}</SelectItem>
                      ))}
                    </Select>
                  )}
                  {dialogError && <Alert color="danger" title={dialogError} />}
                </div>
              </ModalBody>
              <ModalFooter>
                <Button variant="light" onPress={onClose}>
                  Hủy
                </Button>
                <Button color="primary" isLoading={saving} onPress={() => void handleUpdate()}>
                  Lưu
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>

      {/* Reset password dialog */}
      <Modal isOpen={showPassword} onOpenChange={setShowPassword} size="sm">
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader className="flex flex-col gap-1">Đặt lại mật khẩu</ModalHeader>
              <ModalBody>
                <div className="flex flex-col gap-3">
                  <Input
                    label="Mật khẩu mới *"
                    type="password"
                    value={newPassword}
                    onValueChange={setNewPassword}
                    variant="bordered"
                  />
                  {dialogError && <Alert color="danger" title={dialogError} />}
                </div>
              </ModalBody>
              <ModalFooter>
                <Button variant="light" onPress={onClose}>
                  Hủy
                </Button>
                <Button color="primary" isLoading={saving} onPress={() => void handlePassword()}>
                  Đặt lại
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>

      {/* Deactivate confirm dialog */}
      <Modal isOpen={showDelete} onOpenChange={setShowDelete} size="sm">
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader className="flex flex-col gap-1">Xác nhận vô hiệu hóa</ModalHeader>
              <ModalBody>
                Bạn có chắc muốn vô hiệu hóa nhân viên &quot;{selectedUser?.fullName}&quot;?
              </ModalBody>
              <ModalFooter>
                <Button variant="light" onPress={onClose}>
                  Hủy
                </Button>
                <Button color="danger" isLoading={saving} onPress={() => void handleDelete()}>
                  Vô hiệu hóa
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
    </div>
  );
}
