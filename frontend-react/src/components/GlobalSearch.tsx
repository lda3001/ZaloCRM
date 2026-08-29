import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardBody, Divider, Input, Spinner } from '@heroui/react';
import { CalendarCheck, ChatText, MagnifyingGlass, User } from '@phosphor-icons/react';
import { api } from '../api/client';

interface ContactResult {
  id: string;
  fullName: string | null;
  phone: string | null;
  diseaseCode: string | null;
  diseaseName: string | null;
}

interface MessageResult {
  id: string;
  content: string | null;
  senderName: string | null;
  sentAt: string;
  conversation?: { id: string; contact?: { fullName: string | null } } | null;
}

interface AppointmentResult {
  id: string;
  appointmentDate: string;
  appointmentTime: string | null;
  notes: string | null;
  contact?: { fullName: string | null } | null;
}

interface SearchResults {
  contacts: ContactResult[];
  messages: MessageResult[];
  appointments: AppointmentResult[];
}

const emptyResults: SearchResults = { contacts: [], messages: [], appointments: [] };

export default function GlobalSearch() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [results, setResults] = useState<SearchResults>(emptyResults);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const hasResults =
    results.contacts.length + results.messages.length + results.appointments.length > 0;

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowResults(false);
      }
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  function debouncedSearch(value: string) {
    setQuery(value);
    clearTimeout(debounceRef.current);
    if (!value || value.length < 2) {
      setShowResults(false);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await api.get('/search', { params: { q: value } });
        setResults(res.data);
        setShowResults(true);
      } catch {
        // Silently ignore search errors.
      } finally {
        setLoading(false);
      }
    }, 300);
  }

  function goTo(path: string) {
    setShowResults(false);
    setQuery('');
    navigate(path);
  }

  function truncate(s: string | null, len: number): string {
    return s && s.length > len ? s.slice(0, len) + '...' : s || '';
  }

  function formatDate(d: string): string {
    return new Date(d).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
  }

  return (
    <div ref={containerRef} className="relative w-72">
      <Input
        value={query}
        onValueChange={debouncedSearch}
        placeholder="Tìm kiếm..."
        startContent={<MagnifyingGlass size={18} />}
        size="sm"
        radius="lg"
        aria-label="Tìm kiếm"
        isClearable
        onClear={() => {
          setQuery('');
          setShowResults(false);
        }}
      />

      {showResults && (
        <div className="absolute left-0 top-full z-50 mt-2 w-[24rem]">
          <Card className="crm-card max-h-[400px] overflow-y-auto rounded-2xl border border-default shadow-sm">
            <CardBody className="p-0">
              {hasResults ? (
                <div className="py-2">
                  {results.contacts.length > 0 && (
                    <>
                      <p className="px-3 py-1 text-xs font-semibold uppercase tracking-wide text-foreground-500">
                        Khách hàng
                      </p>
                      {results.contacts.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => goTo('/contacts')}
                          className="flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-default-100"
                        >
                          <User size={18} className="mt-0.5 shrink-0 text-primary" />
                          <span className="min-w-0">
                            <span className="block truncate text-sm">
                              {c.fullName || c.phone}
                            </span>
                            {c.diseaseName && (
                              <span className="block truncate text-xs text-foreground-500">
                                {c.diseaseName}
                              </span>
                            )}
                          </span>
                        </button>
                      ))}
                    </>
                  )}

                  {results.messages.length > 0 && (
                    <>
                      <Divider />
                      <p className="px-3 py-1 text-xs font-semibold uppercase tracking-wide text-foreground-500">
                        Tin nhắn
                      </p>
                      {results.messages.map((m) => (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => goTo('/chat')}
                          className="flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-default-100"
                        >
                          <ChatText size={18} className="mt-0.5 shrink-0 text-primary" />
                          <span className="min-w-0">
                            <span className="block truncate text-sm">
                              {truncate(m.content, 60)}
                            </span>
                            <span className="block truncate text-xs text-foreground-500">
                              {m.senderName} · {formatDate(m.sentAt)}
                            </span>
                          </span>
                        </button>
                      ))}
                    </>
                  )}

                  {results.appointments.length > 0 && (
                    <>
                      <Divider />
                      <p className="px-3 py-1 text-xs font-semibold uppercase tracking-wide text-foreground-500">
                        Lịch hẹn
                      </p>
                      {results.appointments.map((a) => (
                        <button
                          key={a.id}
                          type="button"
                          onClick={() => goTo('/appointments')}
                          className="flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-default-100"
                        >
                          <CalendarCheck size={18} className="mt-0.5 shrink-0 text-warning" />
                          <span className="min-w-0">
                            <span className="block truncate text-sm">
                              {a.contact?.fullName} · {formatDate(a.appointmentDate)}
                            </span>
                            {a.notes && (
                              <span className="block truncate text-xs text-foreground-500">
                                {a.notes}
                              </span>
                            )}
                          </span>
                        </button>
                      ))}
                    </>
                  )}
                </div>
              ) : (
                !loading && (
                  <p className="px-4 py-4 text-center text-sm text-foreground-500">
                    Không tìm thấy kết quả
                  </p>
                )
              )}

              {loading && (
                <div className="flex justify-center px-4 py-4">
                  <Spinner size="sm" />
                </div>
              )}
            </CardBody>
          </Card>
        </div>
      )}
    </div>
  );
}
