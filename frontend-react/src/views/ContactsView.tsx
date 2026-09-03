import { useEffect, useState } from 'react';
import {
  Alert,
  Avatar,
  Button,
  Chip,
  Pagination,
  Skeleton,
} from '@heroui/react';
import { ChatsCircle, Plus } from '@phosphor-icons/react';
import { useSearchParams } from 'react-router-dom';
import ContactFilters from '../components/contacts/ContactFilters';
import ContactDetailDialog from '../components/contacts/ContactDetailDialog';
import { SOURCE_OPTIONS, STATUS_OPTIONS, useContacts } from '../hooks/use-contacts';
import type { Contact, ContactFilters as ContactFiltersState } from '../hooks/use-contacts';

const statusColorMap: Record<string, 'default' | 'primary' | 'warning' | 'success' | 'danger'> = {
  new: 'default',
  contacted: 'primary',
  interested: 'warning',
  converted: 'success',
  lost: 'danger',
};

function sourceLabel(value: string): string {
  return SOURCE_OPTIONS.find((o) => o.value === value)?.text ?? value;
}

function statusLabel(value: string): string {
  return STATUS_OPTIONS.find((o) => o.value === value)?.text ?? value;
}

function statusColor(status: string) {
  return statusColorMap[status] ?? 'default';
}

export default function ContactsView() {
  const [searchParams, setSearchParams] = useSearchParams();
  const {
    contacts,
    total,
    loading,
    error,
    filters,
    setFilters,
    pagination,
    setPagination,
    fetchContacts,
    fetchContact,
  } = useContacts();

  const [showDialog, setShowDialog] = useState(false);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);

  useEffect(() => {
    void fetchContacts();
    // Initial load only — subsequent fetches are driven by filter/page handlers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const contactId = searchParams.get('contact');
    if (!contactId) return;
    let active = true;
    void (async () => {
      const detail = await fetchContact(contactId);
      if (!active) return;
      if (detail) {
        setSelectedContact(detail);
        setShowDialog(true);
      }
      const nextParams = new URLSearchParams(searchParams);
      nextParams.delete('contact');
      setSearchParams(nextParams, { replace: true });
    })();
    return () => {
      active = false;
    };
  }, [searchParams, setSearchParams, fetchContact]);

  const totalPages = Math.max(1, Math.ceil(total / pagination.limit));

  function handleFiltersChange(next: ContactFiltersState) {
    setFilters(next);
    setPagination((p) => ({ ...p, page: 1 }));
    void fetchContacts({ ...next, page: 1 });
  }

  function handlePageChange(page: number) {
    setPagination((p) => ({ ...p, page }));
    void fetchContacts({ page });
  }

  function openCreate() {
    setSelectedContact(null);
    setShowDialog(true);
  }

  function onRowClick(contact: Contact) {
    setSelectedContact(contact);
    setShowDialog(true);
  }

  function handleSaved() {
    void fetchContacts();
  }

  function handleDeleted() {
    void fetchContacts();
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="mr-auto text-xl font-semibold text-foreground">Khách hàng</h1>
        <Button color="primary" startContent={<Plus size={18} />} onPress={openCreate}>
          Thêm KH
        </Button>
      </div>

      <ContactFilters filters={filters} onChange={handleFiltersChange} />

      {error && <Alert color="danger" title={error} />}

      {loading ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-40 rounded-2xl" />
          ))}
        </div>
      ) : contacts.length === 0 ? (
        <div className="crm-card rounded-2xl border border-default bg-content1 py-14 text-center text-sm text-foreground-500">
          Không có khách hàng
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
          {contacts.map((contact) => (
            <button
              key={contact.id}
              type="button"
              onClick={() => onRowClick(contact)}
              className="crm-card crm-card-interactive group flex flex-col items-center gap-1 rounded-2xl border border-default bg-content1 p-4 text-center hover:bg-content2"
            >
              <Avatar
                src={contact.avatarUrl ?? undefined}
                name={contact.fullName ?? '?'}
                isBordered
                color="primary"
                size="lg"
                className="bg-default-100 text-foreground-500"
              />
              <span className="mt-1 max-w-full truncate text-sm font-semibold text-foreground">
                {contact.fullName ?? 'Chưa rõ tên'}
              </span>
              <span className="max-w-full truncate font-mono text-[11px] text-foreground-500">
                {contact.phone || 'Chưa có SĐT'}
              </span>
              <div className="mt-1 flex flex-wrap items-center justify-center gap-1">
                {contact.source && <Chip size="sm" variant="flat">{sourceLabel(contact.source)}</Chip>}
                {contact.status && (
                  <Chip size="sm" variant="flat" color={statusColor(contact.status)}>
                    {statusLabel(contact.status)}
                  </Chip>
                )}
              </div>
              <span className="mt-1 inline-flex items-center gap-1.5 text-[11px] font-medium text-primary opacity-0 transition-opacity group-hover:opacity-100">
                <ChatsCircle size={13} /> Xem chi tiết và nhắn tin
              </span>
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="tabular-nums text-sm text-foreground-500">
          Tổng: {total} khách hàng
        </span>
        <Pagination
          total={totalPages}
          page={pagination.page}
          onChange={handlePageChange}
          showControls
          variant="bordered"
          size="sm"
          className="tabular-nums"
        />
      </div>

      <ContactDetailDialog
        contact={selectedContact}
        isOpen={showDialog}
        onOpenChange={setShowDialog}
        onSaved={handleSaved}
        onDeleted={handleDeleted}
      />
    </div>
  );
}
