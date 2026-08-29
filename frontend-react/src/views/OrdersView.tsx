import { useEffect, useState, type ReactNode } from 'react';
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
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
  Textarea,
} from '@heroui/react';
import type { SharedSelection } from '@heroui/react';
import {
  CalendarBlank,
  CheckCircle,
  CurrencyCircleDollar,
  MagnifyingGlass,
  PencilSimple,
  Plus,
  ShoppingCart,
  Trash,
} from '@phosphor-icons/react';
import { formatDate, formatVND } from '../lib/format';
import OrderStaffTable from '../components/orders/OrderStaffTable';
import { ORDER_STATUS_OPTIONS, useOrders } from '../hooks/use-orders';
import type { Order } from '../hooks/use-orders';

interface OrderForm {
  contactId: string;
  totalAmount: string;
  status: string;
  notes: string;
}

const emptyForm = (): OrderForm => ({ contactId: '', totalAmount: '', status: 'new', notes: '' });

// Vue order status colors (grey/blue/teal/indigo/green/red) → HeroUI semantic colors.
const orderStatusColorMap: Record<
  string,
  'default' | 'primary' | 'secondary' | 'success' | 'warning' | 'danger'
> = {
  new: 'default',
  confirmed: 'primary',
  paid: 'secondary',
  shipped: 'warning',
  completed: 'success',
  cancelled: 'danger',
};

function statusColor(status: string) {
  return orderStatusColorMap[status] ?? 'default';
}

function firstKey(keys: SharedSelection): string {
  if (keys === 'all') return '';
  if (typeof keys === 'string' || typeof keys === 'number') return String(keys);
  const first = keys[Symbol.iterator]().next();
  return first.done ? '' : String(first.value);
}

function StatCard({
  icon,
  value,
  label,
}: {
  icon: ReactNode;
  value: string;
  label: string;
}) {
  return (
    <Card className="rounded-2xl border border-default bg-content1 shadow-sm">
      <CardBody className="flex flex-col items-center gap-2 px-4 py-5 text-center">
        {icon}
        <div className="tabular-nums text-xl font-semibold text-foreground">{value}</div>
        <div className="text-xs text-foreground-600">{label}</div>
      </CardBody>
    </Card>
  );
}

export default function OrdersView() {
  const {
    orders,
    loading,
    saving,
    stats,
    staffStats,
    error,
    fetchOrders,
    createOrder,
    updateOrder,
    deleteOrder,
    fetchStats,
    fetchStaffStats,
    statusLabel,
  } = useOrders();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [dialog, setDialog] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<OrderForm>(emptyForm());

  useEffect(() => {
    void fetchOrders();
    void fetchStats();
    void fetchStaffStats();
    // Initial load only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function buildParams(searchVal: string, statusVal: string): Record<string, string> {
    const p: Record<string, string> = {};
    if (searchVal) p.search = searchVal;
    if (statusVal) p.status = statusVal;
    return p;
  }

  function handleSearchChange(v: string) {
    setSearch(v);
    void fetchOrders(buildParams(v, statusFilter));
  }

  function handleStatusChange(status: string) {
    setStatusFilter(status);
    void fetchOrders(buildParams(search, status));
  }

  function openCreate() {
    setEditingId(null);
    setForm(emptyForm());
    setDialog(true);
  }

  function openEdit(o: Order) {
    setEditingId(o.id);
    setForm({
      contactId: o.contactId,
      totalAmount: String(o.totalAmount),
      status: o.status,
      notes: o.notes || '',
    });
    setDialog(true);
  }

  async function submit() {
    const payload = {
      totalAmount: Number(form.totalAmount) || 0,
      status: form.status,
      notes: form.notes || null,
    };
    if (editingId) {
      await updateOrder(editingId, payload);
    } else {
      await createOrder({ contactId: form.contactId, ...payload });
    }
    setDialog(false);
    void fetchOrders(buildParams(search, statusFilter));
    void fetchStats();
  }

  async function confirmDelete(id: string) {
    if (!window.confirm('Xoá đơn hàng này?')) return;
    await deleteOrder(id);
    void fetchOrders(buildParams(search, statusFilter));
    void fetchStats();
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="mr-auto flex items-center gap-2 text-xl font-semibold text-foreground">
          <ShoppingCart size={22} weight="regular" className="text-primary" />
          Đơn hàng
        </h1>
        <Button color="primary" startContent={<Plus size={18} />} onPress={openCreate}>
          Tạo đơn
        </Button>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard
          icon={<ShoppingCart size={24} weight="regular" className="text-primary" />}
          value={String(stats?.totalOrders ?? '—')}
          label="Tổng đơn"
        />
        <StatCard
          icon={<CheckCircle size={24} weight="regular" className="text-success" />}
          value={String(stats?.completedOrders ?? '—')}
          label="Hoàn thành"
        />
        <StatCard
          icon={<CurrencyCircleDollar size={24} weight="regular" className="text-secondary" />}
          value={formatVND(stats?.totalRevenue ?? 0)}
          label="Doanh thu"
        />
        <StatCard
          icon={<CalendarBlank size={24} weight="regular" className="text-warning" />}
          value={formatVND(stats?.todayRevenue ?? 0)}
          label="Doanh thu hôm nay"
        />
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Input
          label="Tìm kiếm mã đơn, khách hàng..."
          placeholder="Tìm kiếm..."
          value={search}
          onValueChange={handleSearchChange}
          startContent={<MagnifyingGlass size={18} />}
          variant="bordered"
          size="sm"
          isClearable
          onClear={() => handleSearchChange('')}
          className="sm:col-span-2"
        />

        <Select
          label="Trạng thái"
          placeholder="Tất cả"
          variant="bordered"
          size="sm"
          selectedKeys={statusFilter ? [statusFilter] : []}
          onSelectionChange={(keys) => handleStatusChange(firstKey(keys))}
          onClear={() => handleStatusChange('')}
        >
          {ORDER_STATUS_OPTIONS.map((o) => (
            <SelectItem key={o.value}>{o.text}</SelectItem>
          ))}
        </Select>
      </div>

      {error && <Alert color="danger" title={error} />}

      {/* Orders table */}
      <Card className="rounded-2xl border border-default bg-content1 shadow-sm">
        <CardBody className="gap-3 p-0">
          <Table
            aria-label="Danh sách đơn hàng"
            className="text-sm"
            classNames={{ wrapper: 'rounded-2xl p-0' }}
          >
            <TableHeader>
              <TableColumn>Mã đơn</TableColumn>
              <TableColumn>Khách hàng</TableColumn>
              <TableColumn>Tổng tiền</TableColumn>
              <TableColumn>Trạng thái</TableColumn>
              <TableColumn>Nhân viên</TableColumn>
              <TableColumn>Ngày tạo</TableColumn>
              <TableColumn width={96}>{''}</TableColumn>
            </TableHeader>
            <TableBody
              items={orders}
              isLoading={loading}
              emptyContent={
                <div className="py-6 text-center text-sm text-foreground-500">
                  Không có đơn hàng
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
              {(o) => (
                <TableRow key={o.id}>
                  <TableCell className="font-medium tabular-nums">{o.orderCode}</TableCell>
                  <TableCell>{o.contact?.fullName || '—'}</TableCell>
                  <TableCell className="tabular-nums">{formatVND(o.totalAmount)}</TableCell>
                  <TableCell>
                    <Chip size="sm" variant="flat" color={statusColor(o.status)}>
                      {statusLabel(o.status)}
                    </Chip>
                  </TableCell>
                  <TableCell>{o.createdBy?.fullName || '—'}</TableCell>
                  <TableCell className="tabular-nums">{formatDate(o.createdAt)}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button
                        isIconOnly
                        size="sm"
                        variant="light"
                        aria-label="Chỉnh sửa"
                        title="Chỉnh sửa"
                        onPress={() => openEdit(o)}
                      >
                        <PencilSimple size={16} />
                      </Button>
                      <Button
                        isIconOnly
                        size="sm"
                        variant="light"
                        color="danger"
                        aria-label="Xoá"
                        title="Xoá"
                        onPress={() => void confirmDelete(o.id)}
                      >
                        <Trash size={16} />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardBody>
      </Card>

      {/* Staff performance */}
      <OrderStaffTable staffStats={staffStats} />

      {/* Create / Edit dialog */}
      <Modal isOpen={dialog} onOpenChange={setDialog} size="md" scrollBehavior="inside">
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader className="flex flex-col gap-1">
                {editingId ? 'Cập nhật đơn hàng' : 'Tạo đơn hàng'}
              </ModalHeader>

              <ModalBody>
                <div className="flex flex-col gap-4">
                  {!editingId && (
                    <Input
                      label="ID Khách hàng"
                      value={form.contactId}
                      onValueChange={(v) => setForm((f) => ({ ...f, contactId: v }))}
                      variant="bordered"
                    />
                  )}

                  <Input
                    label="Tổng tiền (VND)"
                    type="number"
                    value={form.totalAmount}
                    onValueChange={(v) => setForm((f) => ({ ...f, totalAmount: v }))}
                    variant="bordered"
                  />

                  <Select
                    label="Trạng thái"
                    placeholder="Chọn trạng thái"
                    variant="bordered"
                    selectedKeys={[form.status]}
                    onSelectionChange={(keys) =>
                      setForm((f) => ({ ...f, status: firstKey(keys) }))
                    }
                  >
                    {ORDER_STATUS_OPTIONS.map((o) => (
                      <SelectItem key={o.value}>{o.text}</SelectItem>
                    ))}
                  </Select>

                  <Textarea
                    label="Ghi chú"
                    value={form.notes}
                    onValueChange={(v) => setForm((f) => ({ ...f, notes: v }))}
                    variant="bordered"
                    minRows={2}
                  />
                </div>
              </ModalBody>

              <ModalFooter>
                <Button variant="light" onPress={onClose}>
                  Huỷ
                </Button>
                <Button color="primary" isLoading={saving} onPress={() => void submit()}>
                  Lưu
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
    </div>
  );
}
