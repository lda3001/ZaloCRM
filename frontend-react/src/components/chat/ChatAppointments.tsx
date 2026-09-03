import { useState } from 'react';
import { Alert, Button, Chip, Divider, Input, Select, SelectItem } from '@heroui/react';
import type { SharedSelection } from '@heroui/react';
import { CalendarBlank, PencilSimple, Plus } from '@phosphor-icons/react';
import { api } from '../../api/client';
import type { ChatAppointment } from '../../hooks/use-chat-contact-panel';

interface Props {
  contactId: string;
  appointments: ChatAppointment[];
  onRefresh: () => void;
}

const STATUS_OPTIONS = [
  { title: 'Sắp tới', value: 'scheduled' },
  { title: 'Hoàn thành', value: 'completed' },
  { title: 'Hủy', value: 'cancelled' },
  { title: 'Không đến', value: 'no_show' },
];

// Vue status colors (blue/green/grey/orange) → HeroUI semantic colors.
const statusColorMap: Record<string, 'primary' | 'success' | 'default' | 'warning'> = {
  scheduled: 'primary',
  completed: 'success',
  cancelled: 'default',
  no_show: 'warning',
};

function statusColor(s: string) {
  return statusColorMap[s] ?? 'default';
}

function statusLabel(s: string): string {
  return STATUS_OPTIONS.find((o) => o.value === s)?.title || s;
}

function formatAptDate(d: string): string {
  return new Date(d).toLocaleDateString('vi-VN', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function firstKey(keys: SharedSelection): string {
  if (keys === 'all') return '';
  if (typeof keys === 'string' || typeof keys === 'number') return String(keys);
  const first = keys[Symbol.iterator]().next();
  return first.done ? '' : String(first.value);
}

export default function ChatAppointments({ contactId, appointments, onRefresh }: Props) {
  const [showForm, setShowForm] = useState(false);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const [createForm, setCreateForm] = useState({ date: '', time: '', notes: '' });
  const [editForm, setEditForm] = useState({ date: '', time: '', notes: '', status: '' });

  function startEdit(apt: ChatAppointment) {
    setEditingId(apt.id);
    setEditForm({
      date: apt.appointmentDate ? new Date(apt.appointmentDate).toISOString().split('T')[0] : '',
      time: apt.appointmentTime ?? '',
      notes: apt.notes ?? '',
      status: apt.status,
    });
  }

  async function submitCreate() {
    if (!createForm.date || !contactId) {
      setError('Vui lòng chọn ngày hẹn.');
      return;
    }
    setError('');
    setCreating(true);
    try {
      await api.post('/appointments', {
        contactId,
        appointmentDate: new Date(createForm.date + 'T' + (createForm.time || '09:00') + ':00').toISOString(),
        appointmentTime: createForm.time || '09:00',
        type: 'follow_up',
        notes: createForm.notes || null,
      });
      setShowForm(false);
      setCreateForm({ date: '', time: '', notes: '' });
      onRefresh();
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Tạo lịch hẹn thất bại.');
    } finally {
      setCreating(false);
    }
  }

  async function submitEdit(appointmentId: string) {
    if (!editForm.date) {
      setError('Vui lòng chọn ngày hẹn.');
      return;
    }
    setError('');
    setSaving(true);
    try {
      await api.put(`/appointments/${appointmentId}`, {
        appointmentDate: editForm.date
          ? new Date(editForm.date + 'T' + (editForm.time || '09:00') + ':00').toISOString()
          : undefined,
        appointmentTime: editForm.time || null,
        notes: editForm.notes || null,
        status: editForm.status,
      });
      setEditingId(null);
      onRefresh();
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Cập nhật lịch hẹn thất bại.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <Divider className="my-3" />
      <div className="mb-2 flex items-center gap-1">
        <CalendarBlank size={16} className="text-warning" />
        <span className="text-xs font-bold">Lịch hẹn ({appointments.length})</span>
        <Button
          isIconOnly
          size="sm"
          variant="light"
          color="primary"
          aria-label="Thêm lịch hẹn"
          className="ml-auto"
          onPress={() => setShowForm((v) => !v)}
        >
          <Plus size={14} />
        </Button>
      </div>

      {/* Quick create form */}
      {showForm && (
        <div className="mb-2 space-y-1 rounded-lg bg-warning/5 p-2">
          <Input
            label="Ngày"
            type="date"
            size="sm"
            variant="bordered"
            value={createForm.date}
            onValueChange={(v) => setCreateForm((f) => ({ ...f, date: v }))}
          />
          <Input
            label="Giờ"
            type="time"
            size="sm"
            variant="bordered"
            value={createForm.time}
            onValueChange={(v) => setCreateForm((f) => ({ ...f, time: v }))}
          />
          <Input
            label="Ghi chú"
            size="sm"
            variant="bordered"
            value={createForm.notes}
            onValueChange={(v) => setCreateForm((f) => ({ ...f, notes: v }))}
          />
          <Button
            size="sm"
            color="warning"
            className="w-full"
            isLoading={creating}
            onPress={() => void submitCreate()}
          >
            Tạo lịch hẹn
          </Button>
        </div>
      )}

      {/* Appointment list */}
      {error && <Alert color="warning" title={error} className="mb-2" />}

      {appointments.map((apt) => (
        <div
          key={apt.id}
          className="mb-1 rounded-lg border border-warning/10 bg-warning/5 p-2"
        >
          {editingId !== apt.id ? (
            <div className="flex items-center gap-1">
              <div className="min-w-0 flex-1">
                <div className="text-sm">
                  {formatAptDate(apt.appointmentDate)} {apt.appointmentTime || ''}
                </div>
                {apt.notes && <div className="text-xs opacity-60">{apt.notes}</div>}
              </div>
              <Chip size="sm" variant="flat" color={statusColor(apt.status)}>
                {statusLabel(apt.status)}
              </Chip>
              <Button
                isIconOnly
                size="sm"
                variant="light"
                color="primary"
                aria-label="Sửa"
                onPress={() => startEdit(apt)}
              >
                <PencilSimple size={12} />
              </Button>
            </div>
          ) : (
            <div className="space-y-1">
              <Input
                label="Ngày"
                type="date"
                size="sm"
                variant="bordered"
                value={editForm.date}
                onValueChange={(v) => setEditForm((f) => ({ ...f, date: v }))}
              />
              <Input
                label="Giờ"
                type="time"
                size="sm"
                variant="bordered"
                value={editForm.time}
                onValueChange={(v) => setEditForm((f) => ({ ...f, time: v }))}
              />
              <Input
                label="Ghi chú"
                size="sm"
                variant="bordered"
                value={editForm.notes}
                onValueChange={(v) => setEditForm((f) => ({ ...f, notes: v }))}
              />
              <Select
                label="Trạng thái"
                size="sm"
                variant="bordered"
                selectedKeys={[editForm.status]}
                onSelectionChange={(keys) =>
                  setEditForm((f) => ({ ...f, status: firstKey(keys) }))
                }
              >
                {STATUS_OPTIONS.map((o) => (
                  <SelectItem key={o.value}>{o.title}</SelectItem>
                ))}
              </Select>
              <div className="flex gap-1">
                <Button
                  size="sm"
                  color="warning"
                  isLoading={saving}
                  onPress={() => void submitEdit(apt.id)}
                >
                  Lưu
                </Button>
                <Button size="sm" variant="light" onPress={() => setEditingId(null)}>
                  Hủy
                </Button>
              </div>
            </div>
          )}
        </div>
      ))}

      {appointments.length === 0 && (
        <div className="text-xs opacity-50">Chưa có lịch hẹn</div>
      )}
    </div>
  );
}
