import { useEffect, useState } from 'react';
import {
  Avatar,
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
  Textarea,
} from '@heroui/react';
import type { SharedSelection } from '@heroui/react';
import { ChatText } from '@phosphor-icons/react';
import { api } from '../../api/client';
import type { Contact } from '../../hooks/use-contacts';
import { SOURCE_OPTIONS, STATUS_OPTIONS, useContacts } from '../../hooks/use-contacts';

interface Props {
  contact: Contact | null;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
  onDeleted: () => void;
}

interface FormState {
  fullName: string;
  phone: string;
  email: string;
  source: string;
  status: string;
  nextAppointmentDate: string;
  firstContactDate: string;
  notes: string;
  tags: string[];
}

function emptyForm(): FormState {
  return {
    fullName: '',
    phone: '',
    email: '',
    source: '',
    status: '',
    nextAppointmentDate: '',
    firstContactDate: '',
    notes: '',
    tags: [],
  };
}

function firstKey(keys: SharedSelection): string {
  if (keys === 'all') return '';
  if (typeof keys === 'string' || typeof keys === 'number') return String(keys);
  const first = keys[Symbol.iterator]().next();
  return first.done ? '' : String(first.value);
}

export default function ContactDetailDialog({
  contact,
  isOpen,
  onOpenChange,
  onSaved,
  onDeleted,
}: Props) {
  const { saving, deleting, createContact, updateContact, deleteContact } = useContacts();
  const [form, setForm] = useState<FormState>(emptyForm());
  const [tagInput, setTagInput] = useState('');
  const [fullNameError, setFullNameError] = useState('');
  const [avatarPreview, setAvatarPreview] = useState(false);
  const [msgHint, setMsgHint] = useState('');

  const isNew = !contact?.id;

  useEffect(() => {
    setFullNameError('');
    setTagInput('');
    setMsgHint('');
    if (contact) {
      setForm({
        fullName: contact.fullName ?? '',
        phone: contact.phone ?? '',
        email: contact.email ?? '',
        source: contact.source ?? '',
        status: contact.status ?? '',
        nextAppointmentDate: contact.nextAppointment
          ? new Date(contact.nextAppointment).toISOString().split('T')[0]
          : '',
        firstContactDate: contact.firstContactDate
          ? new Date(contact.firstContactDate).toISOString().split('T')[0]
          : '',
        notes: contact.notes ?? '',
        tags: contact.tags ?? [],
      });
    } else {
      setForm(emptyForm());
    }
  }, [contact]);

  /** Open the Zalo conversation of this contact (same flow as notification click). */
  async function handleStartChat() {
    setMsgHint('');
    if (!contact?.id) return;
    try {
      const res = await api.get('/conversations', {
        params: { search: contact.phone || contact.fullName || '', limit: 50 },
      });
      const list: any[] = res.data.conversations ?? [];
      let convId = list.find((c) => c.contact?.id === contact.id)?.id;
      if (!convId) {
        // No conversation yet — create a shell for this contact. The first
        // message sent materializes it on Zalo.
        const created = await api.post('/conversations/for-contact', { contactId: contact.id });
        convId = created.data.conversation?.id;
      }
      if (!convId) {
        setMsgHint('Không tạo được hội thoại, thử lại sau.');
        return;
      }
      try {
        sessionStorage.setItem('zalocrm-pending-conv', convId);
      } catch {
        // ignore storage errors
      }
      onOpenChange(false);
      window.dispatchEvent(
        new CustomEvent('zalocrm:open-chat', { detail: { conversationId: convId } }),
      );
    } catch (err: any) {
      const msg = err?.response?.data?.error;
      setMsgHint(msg || 'Không tìm được hội thoại, thử lại sau.');
    }
  }

  function addTag() {
    const tag = tagInput.trim();
    if (tag && !form.tags.includes(tag)) {
      setForm((f) => ({ ...f, tags: [...f.tags, tag] }));
    }
    setTagInput('');
  }

  function removeTag(tag: string) {
    setForm((f) => ({ ...f, tags: f.tags.filter((t) => t !== tag) }));
  }

  async function handleSave() {
    if (!form.fullName.trim()) {
      setFullNameError('Bắt buộc');
      return;
    }

    const payload: Partial<Contact> = {
      fullName: form.fullName || null,
      phone: form.phone || null,
      email: form.email || null,
      source: form.source || null,
      status: form.status || null,
      nextAppointment: form.nextAppointmentDate
        ? new Date(form.nextAppointmentDate + 'T00:00:00').toISOString()
        : null,
      firstContactDate: form.firstContactDate
        ? new Date(form.firstContactDate + 'T00:00:00').toISOString()
        : null,
      notes: form.notes || null,
      tags: form.tags,
    };

    const result = isNew ? await createContact(payload) : await updateContact(contact!.id, payload);
    if (result) {
      onSaved();
      onOpenChange(false);
    }
  }

  async function handleDelete() {
    if (!contact?.id) return;
    const ok = await deleteContact(contact.id);
    if (ok) {
      onDeleted();
      onOpenChange(false);
    }
  }

  return (
    <>
    <Modal isOpen={isOpen} onOpenChange={onOpenChange} size="lg" scrollBehavior="inside">
      <ModalContent>
        {(onClose) => (
          <>
            <ModalHeader className="flex flex-col gap-1">
              {isNew ? 'Thêm khách hàng' : 'Chi tiết khách hàng'}
            </ModalHeader>

            <ModalBody>
              {!isNew && (
                <>
                  <div className="flex items-center gap-3 rounded-2xl border border-default p-3">
                    <button
                      type="button"
                      className="focus:outline-none"
                      aria-label="Xem ảnh đại diện"
                      onClick={() => contact?.avatarUrl && setAvatarPreview(true)}
                    >
                      <Avatar
                        src={contact?.avatarUrl || undefined}
                        name={contact?.fullName || '?'}
                        className="h-16 w-16 text-large bg-default-100"
                        isBordered
                        color="primary"
                      />
                    </button>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold text-foreground">
                        {contact?.fullName || 'Chưa rõ tên'}
                      </div>
                      <div className="truncate text-xs text-foreground-500">
                        {contact?.phone || 'Chưa có số điện thoại'}
                      </div>
                    </div>
                    <Button
                      color="primary"
                      size="sm"
                      startContent={<ChatText size={16} weight="fill" />}
                      onPress={() => void handleStartChat()}
                    >
                      Nhắn tin
                    </Button>
                  </div>
                  {msgHint && <div className="text-xs text-warning">{msgHint}</div>}
                </>
              )}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Input
                  label="Họ và tên"
                  value={form.fullName}
                  onValueChange={(v) => {
                    setForm((f) => ({ ...f, fullName: v }));
                    if (fullNameError && v.trim()) setFullNameError('');
                  }}
                  variant="bordered"
                  isRequired
                  isInvalid={Boolean(fullNameError)}
                  errorMessage={fullNameError}
                />

                <Input
                  label="Số điện thoại"
                  value={form.phone}
                  onValueChange={(v) => setForm((f) => ({ ...f, phone: v }))}
                  variant="bordered"
                />

                <Input
                  label="Email"
                  type="email"
                  value={form.email}
                  onValueChange={(v) => setForm((f) => ({ ...f, email: v }))}
                  variant="bordered"
                />

                <Select
                  label="Nguồn"
                  placeholder="Chọn nguồn"
                  variant="bordered"
                  selectedKeys={form.source ? [form.source] : []}
                  onSelectionChange={(keys) =>
                    setForm((f) => ({ ...f, source: firstKey(keys) }))
                  }
                >
                  {SOURCE_OPTIONS.map((o) => (
                    <SelectItem key={o.value}>{o.text}</SelectItem>
                  ))}
                </Select>

                <Select
                  label="Trạng thái"
                  placeholder="Chọn trạng thái"
                  variant="bordered"
                  selectedKeys={form.status ? [form.status] : []}
                  onSelectionChange={(keys) =>
                    setForm((f) => ({ ...f, status: firstKey(keys) }))
                  }
                >
                  {STATUS_OPTIONS.map((o) => (
                    <SelectItem key={o.value}>{o.text}</SelectItem>
                  ))}
                </Select>

                <Input
                  label="Ngày tái khám"
                  type="date"
                  value={form.nextAppointmentDate}
                  onValueChange={(v) => setForm((f) => ({ ...f, nextAppointmentDate: v }))}
                  variant="bordered"
                />

                <Input
                  label="Ngày tiếp nhận"
                  type="date"
                  value={form.firstContactDate}
                  onValueChange={(v) => setForm((f) => ({ ...f, firstContactDate: v }))}
                  variant="bordered"
                />

                <div className="sm:col-span-2">
                  <Input
                    label="Tags"
                    placeholder="Nhập tag và nhấn Enter"
                    value={tagInput}
                    onValueChange={setTagInput}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addTag();
                      }
                    }}
                    variant="bordered"
                  />
                  {form.tags.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {form.tags.map((tag) => (
                        <Chip key={tag} size="sm" variant="flat" onClose={() => removeTag(tag)}>
                          {tag}
                        </Chip>
                      ))}
                    </div>
                  )}
                </div>

                <Textarea
                  label="Ghi chú"
                  placeholder="Ghi chú về khách hàng"
                  value={form.notes}
                  onValueChange={(v) => setForm((f) => ({ ...f, notes: v }))}
                  variant="bordered"
                  minRows={3}
                  className="sm:col-span-2"
                />
              </div>
            </ModalBody>

            <ModalFooter>
              {!isNew && (
                <Button color="danger" variant="light" isLoading={deleting} onPress={handleDelete}>
                  Xoá
                </Button>
              )}
              <Button variant="light" onPress={onClose}>
                Huỷ
              </Button>
              <Button color="primary" isLoading={saving} onPress={handleSave}>
                Lưu
              </Button>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>

    {/* Avatar full preview */}
    <Modal isOpen={avatarPreview} onOpenChange={setAvatarPreview} size="sm" placement="center">
      <ModalContent>
        <ModalBody className="items-center p-4">
          <Avatar
            src={contact?.avatarUrl || undefined}
            name={contact?.fullName || '?'}
            className="h-56 w-56 text-large bg-default-100"
            isBordered
            color="primary"
          />
          <div className="mt-2 text-center text-sm font-medium text-foreground">
            {contact?.fullName || 'Ảnh đại diện'}
          </div>
        </ModalBody>
      </ModalContent>
    </Modal>
    </>
  );
}
