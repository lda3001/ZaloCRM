import { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Chip,
  Input,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Skeleton,
  Spinner,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
} from '@heroui/react';
import {
  ArrowClockwise,
  ArrowsClockwise,
  CheckCircle,
  Plus,
  QrCode,
  ShieldCheck,
  Trash,
} from '@phosphor-icons/react';
import { api } from '../api/client';
import { selectIsAdmin, useAuthStore } from '../stores/auth';
import ZaloAccessDialog from '../components/zalo/ZaloAccessDialog';
import { statusColor, statusText, useZaloAccounts } from '../hooks/use-zalo-accounts';
import type { ZaloAccount } from '../hooks/use-zalo-accounts';

// Hook returns Vue-ish status colors (success/warning/error); map "error" → HeroUI "danger".
const zaloStatusChipColor: Record<string, 'success' | 'warning' | 'danger'> = {
  success: 'success',
  warning: 'warning',
  error: 'danger',
};

function chipColor(status: string) {
  return zaloStatusChipColor[statusColor(status)] ?? 'danger';
}

export default function ZaloAccountsView() {
  const {
    accounts,
    loading,
    adding,
    deleting,
    error,
    showQRDialog,
    qrImage,
    qrScanned,
    scannedName,
    qrError,
    fetchAccounts,
    addAccount,
    loginAccount,
    reconnectAccount,
    deleteAccount,
    cancelQR,
    setupSocket,
  } = useZaloAccounts();

  const isAdmin = useAuthStore(selectIsAdmin);

  const [showAddDialog, setShowAddDialog] = useState(false);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showAccessDialog, setShowAccessDialog] = useState(false);
  const [newAccountName, setNewAccountName] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<ZaloAccount | null>(null);
  const [accessTarget, setAccessTarget] = useState<ZaloAccount | null>(null);

  useEffect(() => {
    void fetchAccounts();
    return setupSocket();
  }, [fetchAccounts, setupSocket]);

  async function syncContacts(accountId: string) {
    setSyncing(accountId);
    try {
      const res = await api.post(`/zalo-accounts/${accountId}/sync-contacts`);
      window.alert(
        `Đồng bộ thành công: ${res.data.created} mới, ${res.data.updated} cập nhật`,
      );
    } catch (err) {
      const e = err as { response?: { data?: { error?: string } }; message?: string };
      window.alert('Đồng bộ thất bại: ' + (e.response?.data?.error || e.message));
    } finally {
      setSyncing(null);
    }
  }

  async function handleAddAccount() {
    const ok = await addAccount(newAccountName);
    if (ok) {
      setShowAddDialog(false);
      setNewAccountName('');
    }
  }

  function confirmDelete(account: ZaloAccount) {
    setDeleteTarget(account);
    setShowDeleteDialog(true);
  }

  function openAccess(account: ZaloAccount) {
    setAccessTarget(account);
    setShowAccessDialog(true);
  }

  async function handleDeleteAccount() {
    if (!deleteTarget) return;
    const ok = await deleteAccount(deleteTarget);
    if (ok) {
      setShowDeleteDialog(false);
      setDeleteTarget(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="mr-auto text-xl font-semibold text-foreground">Tài khoản Zalo</h1>
        <Button color="primary" startContent={<Plus size={18} />} onPress={() => setShowAddDialog(true)}>
          Thêm Zalo
        </Button>
      </div>

      {error && <Alert color="danger" title={error} />}

      <Table
        aria-label="Danh sách tài khoản Zalo"
        className="text-sm"
        classNames={{ wrapper: 'rounded-2xl border border-default p-0 shadow-sm' }}
      >
        <TableHeader>
          <TableColumn>Tên</TableColumn>
          <TableColumn>Zalo UID</TableColumn>
          <TableColumn>SĐT</TableColumn>
          <TableColumn>Trạng thái</TableColumn>
          <TableColumn align="end">Hành động</TableColumn>
        </TableHeader>
        <TableBody
          items={accounts}
          isLoading={loading}
          emptyContent={
            <div className="py-8 text-center text-sm text-foreground-500">
              Chưa có tài khoản Zalo nào
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
              <TableCell className="font-medium">{item.displayName ?? '—'}</TableCell>
              <TableCell className="tabular-nums">{item.zaloUid ?? '—'}</TableCell>
              <TableCell className="tabular-nums">{item.phone ?? '—'}</TableCell>
              <TableCell>
                <Chip size="sm" variant="flat" color={chipColor(item.liveStatus || item.status)}>
                  {statusText(item.liveStatus || item.status)}
                </Chip>
              </TableCell>
              <TableCell>
                <div className="flex items-center justify-end gap-1">
                  {isAdmin && (
                    <Button
                      isIconOnly
                      size="sm"
                      variant="light"
                      color="secondary"
                      aria-label="Phân quyền truy cập"
                      title="Phân quyền truy cập"
                      onPress={() => openAccess(item)}
                    >
                      <ShieldCheck size={16} />
                    </Button>
                  )}
                  <Button
                    isIconOnly
                    size="sm"
                    variant="light"
                    color="success"
                    aria-label="Đồng bộ danh bạ Zalo"
                    title="Đồng bộ danh bạ Zalo"
                    isLoading={syncing === item.id}
                    onPress={() => void syncContacts(item.id)}
                  >
                    <ArrowsClockwise size={16} />
                  </Button>
                  {item.liveStatus !== 'connected' && (
                    <Button
                      isIconOnly
                      size="sm"
                      variant="light"
                      color="primary"
                      aria-label="Đăng nhập QR"
                      title="Đăng nhập QR"
                      onPress={() => void loginAccount(item.id)}
                    >
                      <QrCode size={16} />
                    </Button>
                  )}
                  {item.liveStatus === 'disconnected' && Boolean(item.sessionData) && (
                    <Button
                      isIconOnly
                      size="sm"
                      variant="light"
                      color="secondary"
                      aria-label="Kết nối lại"
                      title="Kết nối lại"
                      onPress={() => void reconnectAccount(item.id)}
                    >
                      <ArrowClockwise size={16} />
                    </Button>
                  )}
                  <Button
                    isIconOnly
                    size="sm"
                    variant="light"
                    color="danger"
                    aria-label="Xóa"
                    title="Xóa"
                    onPress={() => confirmDelete(item)}
                  >
                    <Trash size={16} />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      {/* Add account dialog */}
      <Modal isOpen={showAddDialog} onOpenChange={setShowAddDialog} size="sm">
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader className="flex flex-col gap-1">Thêm tài khoản Zalo</ModalHeader>
              <ModalBody>
                <Input
                  label="Tên hiển thị (VD: Zalo Sale Hương)"
                  value={newAccountName}
                  onValueChange={setNewAccountName}
                  variant="bordered"
                  autoFocus
                />
              </ModalBody>
              <ModalFooter>
                <Button variant="light" onPress={onClose}>
                  Hủy
                </Button>
                <Button color="primary" isLoading={adding} onPress={() => void handleAddAccount()}>
                  Thêm
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>

      {/* QR code dialog */}
      <Modal
        isOpen={showQRDialog}
        onOpenChange={(open) => {
          if (!open) cancelQR();
        }}
        size="md"
        isDismissable={false}
        isKeyboardDismissDisabled
        hideCloseButton
      >
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader className="flex flex-col gap-1 text-center">
                Quét QR để đăng nhập Zalo
              </ModalHeader>
              <ModalBody className="items-center text-center">
                {qrImage ? (
                  <img
                    src={`data:image/png;base64,${qrImage}`}
                    alt="QR Code"
                    className="mx-auto"
                    style={{ maxWidth: 280 }}
                  />
                ) : qrScanned ? (
                  <div className="flex flex-col items-center gap-2">
                    <CheckCircle size={64} weight="regular" className="text-success" />
                    <p className="text-lg font-semibold">Đã quét! Xác nhận trên điện thoại...</p>
                    {scannedName && (
                      <p className="text-sm text-foreground-500">{scannedName}</p>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-3 py-4">
                    <Spinner size="lg" color="primary" />
                    <p className="text-sm text-foreground-500">Đang tạo QR code...</p>
                  </div>
                )}
                {qrError && <Alert color="danger" title={qrError} className="mt-2" />}
              </ModalBody>
              <ModalFooter className="justify-center">
                <Button onPress={onClose}>Đóng</Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>

      {/* Delete confirm dialog */}
      <Modal isOpen={showDeleteDialog} onOpenChange={setShowDeleteDialog} size="sm">
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader className="flex flex-col gap-1">Xác nhận xóa</ModalHeader>
              <ModalBody>
                Bạn có chắc muốn xóa tài khoản &quot;{deleteTarget?.displayName || deleteTarget?.id}
                &quot;?
              </ModalBody>
              <ModalFooter>
                <Button variant="light" onPress={onClose}>
                  Hủy
                </Button>
                <Button color="danger" isLoading={deleting} onPress={() => void handleDeleteAccount()}>
                  Xóa
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>

      {/* Access control dialog */}
      <ZaloAccessDialog
        isOpen={showAccessDialog}
        onOpenChange={setShowAccessDialog}
        accountId={accessTarget?.id ?? ''}
        accountName={accessTarget?.displayName ?? accessTarget?.id ?? ''}
      />
    </div>
  );
}
