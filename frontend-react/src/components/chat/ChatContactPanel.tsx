import { useState } from 'react';
import { Alert, Avatar, Button, Chip, Input, Modal, ModalBody, ModalContent, Select, SelectItem, Textarea } from '@heroui/react';
import type { SharedSelection } from '@heroui/react';
import { ChatText, IdentificationCard, X } from '@phosphor-icons/react';
import type { Contact } from '../../hooks/use-contacts';
import { SOURCE_OPTIONS, STATUS_OPTIONS } from '../../hooks/use-contacts';
import { useChatContactPanel } from '../../hooks/use-chat-contact-panel';
import ChatAppointments from './ChatAppointments';
import ChatOrders from './ChatOrders';

interface Props {
  conversationId: string;
  contactId: string | null;
  contact: Contact | null;
  onClose: () => void;
  onSaved: () => void;
  onStartChat?: () => void;
}

function firstKey(keys: SharedSelection): string {
  if (keys === 'all') return '';
  if (typeof keys === 'string' || typeof keys === 'number') return String(keys);
  const first = keys[Symbol.iterator]().next();
  return first.done ? '' : String(first.value);
}

export default function ChatContactPanel({ conversationId, contactId, contact, onClose, onSaved, onStartChat }: Props) {
  const {
    form,
    setForm,
    saving,
    saveSuccess,
    setSaveSuccess,
    saveError,
    setSaveError,
    contactAppointments,
    saveContact,
    reloadAppointments,
  } = useChatContactPanel(contactId, contact, onSaved);

  const [tagInput, setTagInput] = useState('');
  const [avatarPreview, setAvatarPreview] = useState(false);

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

  return (
    <div className="chat-side-panel flex h-full flex-col overflow-y-auto">
      {/* Header */}
      <div className="chat-panel-header flex items-center gap-2 border-b border-default px-3 py-2">
        <IdentificationCard size={20} className="text-primary" />
        <span className="text-sm font-medium">Thông tin khách hàng</span>
        <Button isIconOnly size="sm" variant="light" aria-label="Đóng" className="ml-auto" onPress={onClose}>
          <X size={18} />
        </Button>
      </div>

      {/* Profile card — avatar preview + quick chat */}
      <div className="chat-contact-profile flex flex-col items-center gap-2 border-b border-default px-3 py-4">
        <button
          type="button"
          className="rounded-full transition-transform hover:scale-[1.03] focus:outline-none"
          aria-label="Xem ảnh đại diện"
          onClick={() => contact?.avatarUrl && setAvatarPreview(true)}
        >
          <Avatar
            src={contact?.avatarUrl || undefined}
            name={contact?.fullName || '?'}
            className="h-24 w-24 text-large bg-default-100"
            isBordered
            color="primary"
          />
        </button>
        <div className="text-center">
          <div className="text-base font-semibold text-foreground">{contact?.fullName || 'Chưa rõ tên'}</div>
          {contact?.phone && <div className="text-xs text-foreground-500">{contact.phone}</div>}
        </div>
        <Button
          color="primary"
          size="sm"
          startContent={<ChatText size={16} weight="fill" />}
          onPress={() => {
            onClose();
            onStartChat?.();
          }}
        >
          Nhắn tin
        </Button>
      </div>

      {/* Form */}
      <div className="space-y-2 p-3">
        <Input
          label="Họ tên"
          size="sm"
          variant="bordered"
          value={form.fullName}
          onValueChange={(v) => setForm((f) => ({ ...f, fullName: v }))}
        />
        <Input
          label="Số điện thoại"
          size="sm"
          variant="bordered"
          value={form.phone}
          onValueChange={(v) => setForm((f) => ({ ...f, phone: v }))}
        />
        <Input
          label="Email"
          type="email"
          size="sm"
          variant="bordered"
          value={form.email}
          onValueChange={(v) => setForm((f) => ({ ...f, email: v }))}
        />

        <Select
          label="Nguồn"
          placeholder="Chọn nguồn"
          size="sm"
          variant="bordered"
          selectedKeys={form.source ? [form.source] : []}
          onSelectionChange={(keys) => setForm((f) => ({ ...f, source: firstKey(keys) || null }))}
          onClear={() => setForm((f) => ({ ...f, source: null }))}
        >
          {SOURCE_OPTIONS.map((o) => (
            <SelectItem key={o.value}>{o.text}</SelectItem>
          ))}
        </Select>

        <Select
          label="Trạng thái"
          placeholder="Chọn trạng thái"
          size="sm"
          variant="bordered"
          selectedKeys={form.status ? [form.status] : []}
          onSelectionChange={(keys) => setForm((f) => ({ ...f, status: firstKey(keys) || null }))}
          onClear={() => setForm((f) => ({ ...f, status: null }))}
        >
          {STATUS_OPTIONS.map((o) => (
            <SelectItem key={o.value}>{o.text}</SelectItem>
          ))}
        </Select>

        <Input
          label="Ngày tiếp nhận"
          type="date"
          size="sm"
          variant="bordered"
          value={form.firstContactDate}
          onValueChange={(v) => setForm((f) => ({ ...f, firstContactDate: v }))}
        />

        <Input
          label="Hẹn tái khám"
          type="date"
          size="sm"
          variant="bordered"
          value={form.nextAppointmentDate}
          onValueChange={(v) => setForm((f) => ({ ...f, nextAppointmentDate: v }))}
        />

        <div>
          <Input
            label="Tags"
            placeholder="Nhập tag và nhấn Enter"
            size="sm"
            variant="bordered"
            value={tagInput}
            onValueChange={setTagInput}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addTag();
              }
            }}
          />
          {form.tags.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
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
          minRows={2}
          size="sm"
          variant="bordered"
          value={form.notes}
          onValueChange={(v) => setForm((f) => ({ ...f, notes: v }))}
        />

        <Button color="primary" className="w-full" isLoading={saving} onPress={() => void saveContact()}>
          Lưu thông tin
        </Button>

        {saveSuccess && (
          <Alert color="success" title="Đã lưu thành công!" onClose={() => setSaveSuccess(false)} />
        )}
        {saveError && <Alert color="danger" title="Lưu thất bại, thử lại!" onClose={() => setSaveError(false)} />}

        {contactId && (
          <>
            <ChatAppointments
              contactId={contactId}
              appointments={contactAppointments}
              onRefresh={() => void reloadAppointments()}
            />
            <ChatOrders contactId={contactId} conversationId={conversationId} />
          </>
        )}
      </div>

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
    </div>
  );
}
