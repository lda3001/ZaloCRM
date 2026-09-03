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
  Pagination,
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
import { Check, PencilSimple, Plus, Trash, X } from '@phosphor-icons/react';
import { useSearchParams } from 'react-router-dom';
import { formatDate } from '../lib/format';
import ContactAutocomplete from '../components/contacts/ContactAutocomplete';
import { api } from '../api/client';
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
  status: string;
  notes: string;
}

const emptyForm = (): CreateForm => ({
  contactId: '',
  appointmentDate: '',
  appointmentTime: '',
  type: 'follow_up',
  status: 'scheduled',
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
  const [searchParams, setSearchParams] = useSearchParams();
  const {
    appointments,
    total,
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
    updateAppointment,
    deleteAppointment,
    markComplete,
    cancelAppointment,
  } = useAppointments();

  const [activeTab, setActiveTab] = useState<TabKey>('today');
  const [allPage, setAllPage] = useState(1);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [createForm, setCreateForm] = useState<CreateForm>(emptyForm());
  const [editingAppointment, setEditingAppointment] = useState<Appointment | null>(null);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    void fetchToday();
    void fetchUpcoming();
    // Initial load only — tab switches are handled by the Tabs handler below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const appointmentId = searchParams.get('appointment');
    if (!appointmentId) return;
    let active = true;
    void (async () => {
      try {
        const res = await api.get(`/appointments/${appointmentId}`);
        if (!active) return;
        const appointment = res.data as Appointment;
        setEditingAppointment(appointment);
        setFormError('');
        setCreateForm({
          contactId: appointment.contactId,
          appointmentDate: appointment.appointmentDate.slice(0, 10),
          appointmentTime: appointment.appointmentTime || '',
          type: appointment.type,
          status: appointment.status,
          notes: appointment.notes || '',
        });
        setShowCreateDialog(true);
      } catch {
        // The list remains usable when a search result was removed meanwhile.
      } finally {
        if (active) {
          const nextParams = new URLSearchParams(searchParams);
          nextParams.delete('appointment');
          setSearchParams(nextParams, { replace: true });
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [searchParams, setSearchParams]);

  const activeList: Appointment[] =
    activeTab === 'today'
      ? todayAppointments
      : activeTab === 'upcoming'
        ? upcomingAppointments
        : appointments;

  function fetchForTab(tab: TabKey, page = allPage) {
    if (tab === 'today') void fetchToday();
    else if (tab === 'upcoming') void fetchUpcoming();
    else void fetchAppointments({ page, limit: 50 });
  }

  function handleTabChange(key: Key) {
    const tab = key as TabKey;
    setActiveTab(tab);
    fetchForTab(tab);
  }

  function handleStatusChange(status: string) {
    setFilters((prev) => ({ ...prev, status }));
    setAllPage(1);
    void fetchAppointments({ status, page: 1, limit: 50 });
  }

  function handleAllPageChange(page: number) {
    setAllPage(page);
    void fetchAppointments({ page, limit: 50 });
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
    if (!window.confirm('Xoá lịch hẹn này?')) return;
    await deleteAppointment(id);
    fetchForTab(activeTab);
  }

  function openCreate() {
    setEditingAppointment(null);
    setCreateForm(emptyForm());
    setFormError('');
    setShowCreateDialog(true);
  }

  function openEdit(appointment: Appointment) {
    setEditingAppointment(appointment);
    setFormError('');
    setCreateForm({
      contactId: appointment.contactId,
      appointmentDate: appointment.appointmentDate.slice(0, 10),
      appointmentTime: appointment.appointmentTime || '',
      type: appointment.type,
      status: appointment.status,
      notes: appointment.notes || '',
    });
    setShowCreateDialog(true);
  }

  async function onCreateSave() {
    if (!createForm.contactId || !createForm.appointmentDate) {
      setFormError('Vui lòng chọn khách hàng và ngày hẹn.');
      return;
    }
    setFormError('');
    const payload = {
      contactId: createForm.contactId,
      appointmentDate: createForm.appointmentDate,
      appointmentTime: createForm.appointmentTime,
      type: createForm.type,
      status: createForm.status,
      notes: createForm.notes || null,
    };
    const result = editingAppointment
      ? await updateAppointment(editingAppointment.id, payload)
      : await createAppointment(payload);
    if (result) {
      setShowCreateDialog(false);
      setCreateForm(emptyForm());
      setEditingAppointment(null);
      fetchForTab(activeTab);
    } else {
      setFormError('Không thể lưu lịch hẹn. Có thể khách hàng đã có lịch trong ngày này.');
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="mr-auto text-xl font-semibold text-foreground">Lịch hẹn</h1>
        <Button color="primary" startContent={<Plus size={18} />} onPress={openCreate}>
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
                    aria-label="Chỉnh sửa"
                    title="Chỉnh sửa"
                    onPress={() => openEdit(item)}
                  >
                    <PencilSimple size={18} />
                  </Button>
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

      {activeTab === 'all' && total > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-sm tabular-nums text-foreground-500">Tổng: {total} lịch hẹn</span>
          <Pagination
            page={allPage}
            total={Math.max(1, Math.ceil(total / 50))}
            onChange={handleAllPageChange}
            showControls
            variant="bordered"
            size="sm"
          />
        </div>
      )}

      <Modal
        isOpen={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        size="lg"
        scrollBehavior="inside"
      >
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader className="flex flex-col gap-1">
                {editingAppointment ? 'Chỉnh sửa lịch hẹn' : 'Tạo lịch hẹn'}
              </ModalHeader>

              <ModalBody>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <ContactAutocomplete
                    key={editingAppointment?.id ?? 'create'}
                    value={createForm.contactId}
                    onChange={(contactId) => setCreateForm((f) => ({ ...f, contactId }))}
                    initialContact={editingAppointment?.contact}
                    isRequired
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

                  {editingAppointment && (
                    <Select
                      label="Trạng thái"
                      variant="bordered"
                      selectedKeys={[createForm.status]}
                      onSelectionChange={(keys) =>
                        setCreateForm((f) => ({ ...f, status: firstKey(keys) }))
                      }
                      className="sm:col-span-2"
                    >
                      {APPOINTMENT_STATUS_OPTIONS.map((o) => (
                        <SelectItem key={o.value}>{o.text}</SelectItem>
                      ))}
                    </Select>
                  )}

                  <Textarea
                    label="Ghi chú"
                    value={createForm.notes}
                    onValueChange={(v) => setCreateForm((f) => ({ ...f, notes: v }))}
                    variant="bordered"
                    minRows={2}
                    className="sm:col-span-2"
                  />
                  {formError && (
                    <Alert color="danger" title={formError} className="sm:col-span-2" />
                  )}
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
