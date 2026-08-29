import { useEffect, useRef, useState } from 'react';
import { Input, Select, SelectItem } from '@heroui/react';
import type { SharedSelection } from '@heroui/react';
import { MagnifyingGlass } from '@phosphor-icons/react';
import type { ContactFilters as ContactFiltersState } from '../../hooks/use-contacts';
import { SOURCE_OPTIONS, STATUS_OPTIONS } from '../../hooks/use-contacts';

interface Props {
  filters: ContactFiltersState;
  onChange: (filters: ContactFiltersState) => void;
}

function firstKey(keys: SharedSelection): string {
  if (keys === 'all') return '';
  if (typeof keys === 'string' || typeof keys === 'number') return String(keys);
  const first = keys[Symbol.iterator]().next();
  return first.done ? '' : String(first.value);
}

export default function ContactFilters({ filters, onChange }: Props) {
  const [search, setSearch] = useState(filters.search);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const filtersRef = useRef(filters);

  // Keep the latest filters available to the debounced search callback.
  useEffect(() => {
    filtersRef.current = filters;
  }, [filters]);

  // Sync the search box when filters are reset externally (e.g. resetFilters).
  useEffect(() => {
    setSearch(filters.search);
  }, [filters.search]);

  // Debounced search — fires 300ms after the user stops typing (matches GlobalSearch).
  useEffect(() => {
    if (search === filtersRef.current.search) return;
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      onChange({ ...filtersRef.current, search });
    }, 300);
    return () => clearTimeout(timerRef.current);
  }, [search]);

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <Input
        label="Tìm kiếm tên / SĐT / email"
        placeholder="Tìm kiếm..."
        value={search}
        onValueChange={setSearch}
        startContent={<MagnifyingGlass size={18} />}
        variant="bordered"
        size="sm"
        isClearable
        onClear={() => setSearch('')}
      />

      <Select
        label="Nguồn"
        placeholder="Tất cả"
        variant="bordered"
        size="sm"
        selectedKeys={filters.source ? [filters.source] : []}
        onSelectionChange={(keys) => onChange({ ...filters, source: firstKey(keys) })}
        onClear={() => onChange({ ...filters, source: '' })}
      >
        {SOURCE_OPTIONS.map((o) => (
          <SelectItem key={o.value}>{o.text}</SelectItem>
        ))}
      </Select>

      <Select
        label="Trạng thái"
        placeholder="Tất cả"
        variant="bordered"
        size="sm"
        selectedKeys={filters.status ? [filters.status] : []}
        onSelectionChange={(keys) => onChange({ ...filters, status: firstKey(keys) })}
        onClear={() => onChange({ ...filters, status: '' })}
      >
        {STATUS_OPTIONS.map((o) => (
          <SelectItem key={o.value}>{o.text}</SelectItem>
        ))}
      </Select>
    </div>
  );
}
