import { useEffect, useState, type Key } from 'react';
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
  Select,
  SelectItem,
  Skeleton,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
  Tabs,
  Textarea,
} from '@heroui/react';
import type { SharedSelection } from '@heroui/react';
import { Check, Plus, Trash, X } from '@phosphor-icons/react';
import { formatDate } from '../lib/format';
import {
  APPOINTMENT_STATUS_OPTIONS,
  APPOINTMENT_TYPE_OPTIONS,
  statusLabel,
  useAppointments,
} from '../hooks/use-appointments';
import type { Appointment } from '../hooks/use-appointments';

type TabKey = 'today' | 'upcoming' | 'all';

interface CreateForm {
  contactId: string;
  appointmentDate: string;
  appointmentTime: string;
  type: string;
  notes: string;
}

const emptyForm = (): CreateForm => ({
  contactId: '',
  appointmentDate: '',
  appointmentTime: '',
  type: 'follow_up',
  notes: '',
});

// Vue status colors (blue/green/grey/red) mapped to HeroUI semantic colors.
const statusColorMap: Record<string, 'default' | 'primary' | 'success' | 'warning' | 'danger'> = {
  scheduled: 'primary',
  completed: 'success',
  cancelled: 'default',
  no_show: 'danger',
};

function statusColor(status: string) {
  return statusColorMap[status] ?? 'default';
}

function typeLabel(type: string): string {
  return APPOINTMENT_TYPE_OPTIONS.find((o) => o.value === type)?.text ?? type;
}

function firstKey(keys: SharedSelection): string {
  if (keys === 'all') return '';
  if (typeof keys === 'string' || typeof keys === 'number') return String(keys);
  const first = keys[Symbol.iterator]().next();
  return first.done ? '' : String(first.value);
}

export default function AppointmentsView() {
  const {
    appointments,
    todayAppointments,
    upcomingAppointments,
    loading,
    saving,
    error,
    filters,
    setFilters,
    fetchAppointments,
    fetchToday,
    fetchUpcoming,
    createAppointment,
    deleteAppointment,
    markComplete,
    cancelAppointment,
  } = useAppointments();

  const [activeTab, setActiveTab] = useState<TabKey>('today');
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [createForm, setCreateForm] = useState<CreateForm>(emptyForm());

  useEffect(() => {
    void fetchToday();
    void fetchUpcoming();
    // Initial load only — tab switches are handled by the Tabs handler below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const activeList: Appointment[] =
    activeTab === 'today'
      ? todayAppointments
      : activeTab === 'upcoming'
        ? upcomingAppointments
        : appointments;

  function fetchForTab(tab: TabKey) {
    if (tab === 'today') void fetchToday();
    else if (tab === 'upcoming') void fetchUpcoming();
    else void fetchAppointments();
  }

  function handleTabChange(key: Key) {
    const tab = key as TabKey;
    setActiveTab(tab);
    fetchForTab(tab);
  }

  function handleStatusChange(status: string) {
    setFilters((prev) => ({ ...prev, status }));
    void fetchAppointments({ status });
  }

  async function onMarkComplete(id: string) {
    await markComplete(id);
    fetchForTab(activeTab);
  }

  async function onCancel(id: string) {
    await cancelAppointment(id);
    fetchForTab(activeTab);
  }

  async function onDelete(id: string) {
    await deleteAppointment(id);
    fetchForTab(activeTab);
  }

  async function onCreateSave() {
    const result = await createAppointment({
      contactId: createForm.contactId,
      appointmentDate: createForm.appointmentDate,
      appointmentTime: createForm.appointmentTime,
      type: createForm.type,
      notes: createForm.notes || null,
    });
    if (result) {
      setShowCreateDialog(false);
      setCreateForm(emptyForm());
      fetchForTab(activeTab);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="mr-auto text-xl font-semibold text-foreground">Lịch hẹn</h1>
        <Button color="primary" startContent={<Plus size={18} />} onPress={() => setShowCreateDialog(true)}>
          Tạo lịch hẹn
        </Button>
      </div>

      <Tabs
        aria-label="Lịch hẹn"
        selectedKey={activeTab}
        onSelectionChange={handleTabChange}
        variant="underlined"
      >
        <Tab key="today" title="Hôm nay" />
        <Tab key="upcoming" title="Sắp tới" />
        <Tab key="all" title="Tất cả" />
      </Tabs>

      {activeTab === 'all' && (
        <div className="max-w-[220px]">
          <Select
            label="Trạng thái"
            placeholder="Tất cả"
            variant="bordered"
            size="sm"
            selectedKeys={filters.status ? [filters.status] : []}
            onSelectionChange={(keys) => handleStatusChange(firstKey(keys))}
            onClear={() => handleStatusChange('')}
          >
            {APPOINTMENT_STATUS_OPTIONS.map((o) => (
              <SelectItem key={o.value}>{o.text}</SelectItem>
            ))}
          </Select>
        </div>
      )}

      {error && <Alert color="danger" title={error} />}

      <Table
        aria-label="Danh sách lịch hẹn"
        className="text-sm"
        classNames={{ wrapper: 'rounded-2xl border border-default p-0 shadow-sm' }}
      >
        <TableHeader>
          <TableColumn>Ngày</TableColumn>
          <TableColumn>Giờ</TableColumn>
          <TableColumn>Khách hàng</TableColumn>
          <TableColumn>Loại</TableColumn>
          <TableColumn>Trạng thái</TableColumn>
          <TableColumn>Ghi chú</TableColumn>
          <TableColumn width={120}>{''}</TableColumn>
        </TableHeader>
        <TableBody
          items={activeList}
          isLoading={loading}
          emptyContent={
            <div className="py-8 text-center text-sm text-foreground-500">Không có lịch hẹn</div>
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
              <TableCell className="tabular-nums">{formatDate(item.appointmentDate)}</TableCell>
              <TableCell className="tabular-nums">{item.appointmentTime}</TableCell>
              <TableCell>
                <div>{item.contact?.fullName ?? '—'}</div>
                <div className="text-xs text-foreground-500">{item.contact?.phone ?? ''}</div>
              </TableCell>
              <TableCell>{typeLabel(item.type)}</TableCell>
              <TableCell>
                <Chip size="sm" variant="flat" color={statusColor(item.status)}>
                  {statusLabel(item.status)}
                </Chip>
              </TableCell>
              <TableCell className="text-foreground-600">{item.notes ?? '—'}</TableCell>
              <TableCell>
                <div className="flex items-center gap-1">
                  {item.status === 'scheduled' && (
                    <Button
                      isIconOnly
                      size="sm"
                      variant="light"
                      color="success"
                      aria-label="Hoàn thành"
                      title="Hoàn thành"
                      onPress={() => void onMarkComplete(item.id)}
                    >
                      <Check size={18} />
                    </Button>
                  )}
                  {item.status === 'scheduled' && (
                    <Button
                      isIconOnly
                      size="sm"
                      variant="light"
                      color="default"
                      aria-label="Huỷ"
                      title="Huỷ"
                      onPress={() => void onCancel(item.id)}
                    >
                      <X size={18} />
                    </Button>
                  )}
                  <Button
                    isIconOnly
                    size="sm"
                    variant="light"
                    color="danger"
                    aria-label="Xoá"
                    title="Xoá"
                    onPress={() => void onDelete(item.id)}
                  >
                    <Trash size={18} />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      <Modal
        isOpen={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        size="lg"
        scrollBehavior="inside"
      >
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader className="flex flex-col gap-1">Tạo lịch hẹn</ModalHeader>

              <ModalBody>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Input
                    label="ID khách hàng"
                    description="Nhập ID khách hàng"
                    value={createForm.contactId}
                    onValueChange={(v) => setCreateForm((f) => ({ ...f, contactId: v }))}
                    variant="bordered"
                    className="sm:col-span-2"
                  />

                  <Input
                    label="Ngày hẹn"
                    type="date"
                    value={createForm.appointmentDate}
                    onValueChange={(v) => setCreateForm((f) => ({ ...f, appointmentDate: v }))}
                    variant="bordered"
                  />

                  <Input
                    label="Giờ hẹn"
                    type="time"
                    value={createForm.appointmentTime}
                    onValueChange={(v) => setCreateForm((f) => ({ ...f, appointmentTime: v }))}
                    variant="bordered"
                  />

                  <Select
                    label="Loại"
                    placeholder="Chọn loại"
                    variant="bordered"
                    selectedKeys={[createForm.type]}
                    onSelectionChange={(keys) =>
                      setCreateForm((f) => ({ ...f, type: firstKey(keys) }))
                    }
                    className="sm:col-span-2"
                  >
                    {APPOINTMENT_TYPE_OPTIONS.map((o) => (
                      <SelectItem key={o.value}>{o.text}</SelectItem>
                    ))}
                  </Select>

                  <Textarea
                    label="Ghi chú"
                    value={createForm.notes}
                    onValueChange={(v) => setCreateForm((f) => ({ ...f, notes: v }))}
                    variant="bordered"
                    minRows={2}
                    className="sm:col-span-2"
                  />
                </div>
              </ModalBody>

              <ModalFooter>
                <Button variant="light" onPress={onClose}>
                  Huỷ
                </Button>
                <Button color="primary" isLoading={saving} onPress={() => void onCreateSave()}>
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
