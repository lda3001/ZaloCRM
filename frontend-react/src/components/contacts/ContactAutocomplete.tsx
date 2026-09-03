import { useEffect, useRef, useState } from 'react';
import { Autocomplete, AutocompleteItem } from '@heroui/react';
import { api } from '../../api/client';

export interface ContactOption {
  id: string;
  fullName: string | null;
  phone: string | null;
}

interface Props {
  value: string;
  onChange: (contactId: string) => void;
  initialContact?: ContactOption | null;
  label?: string;
  isRequired?: boolean;
  className?: string;
}

export default function ContactAutocomplete({
  value,
  onChange,
  initialContact,
  label = 'Khách hàng',
  isRequired = false,
  className,
}: Props) {
  const [contacts, setContacts] = useState<ContactOption[]>(initialContact ? [initialContact] : []);
  const [loading, setLoading] = useState(false);
  const requestRef = useRef(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function loadContacts(search = '') {
    const requestId = ++requestRef.current;
    setLoading(true);
    try {
      const res = await api.get('/contacts', {
        params: { limit: 50, search: search.trim() || undefined },
      });
      if (requestId !== requestRef.current) return;
      const next = (res.data.contacts ?? res.data) as ContactOption[];
      setContacts(() => {
        if (initialContact && !next.some((contact) => contact.id === initialContact.id)) {
          return [initialContact, ...next];
        }
        return next;
      });
    } catch {
      // Keep the current choices available if searching fails.
    } finally {
      if (requestId === requestRef.current) setLoading(false);
    }
  }

  useEffect(() => {
    void loadContacts();
    return () => {
      requestRef.current += 1;
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // initialContact is only a seed for the dialog instance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleInputChange(input: string) {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => void loadContacts(input), 250);
  }

  return (
    <Autocomplete
      label={label}
      placeholder="Tìm theo tên hoặc số điện thoại"
      variant="bordered"
      selectedKey={value || null}
      onSelectionChange={(key) => onChange(key ? String(key) : '')}
      onInputChange={handleInputChange}
      isLoading={loading}
      isRequired={isRequired}
      className={className}
      items={contacts}
      allowsCustomValue={false}
    >
      {(contact) => (
        <AutocompleteItem
          key={contact.id}
          textValue={contact.fullName || contact.phone || contact.id}
        >
          <div className="flex flex-col">
            <span className="text-sm">{contact.fullName || 'Chưa rõ tên'}</span>
            <span className="text-xs text-foreground-500">{contact.phone || 'Chưa có SĐT'}</span>
          </div>
        </AutocompleteItem>
      )}
    </Autocomplete>
  );
}
