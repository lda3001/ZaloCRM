import { useEffect, useState, type Key } from 'react';
import {
  Alert,
  Button,
  Input,
  Skeleton,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
  Tabs,
} from '@heroui/react';
import { ArrowsClockwise, FileXls } from '@phosphor-icons/react';
import { api } from '../api/client';

type TabKey = 'messages' | 'contacts' | 'appointments';

interface Column {
  key: string;
  title: string;
}

type MessageRow = {
  date: string;
  sent: number;
  received: number;
};

type CountRow = {
  label: string;
  count: number;
};

function fmt(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function initialRange(): { from: string; to: string } {
  const today = new Date();
  const prior = new Date(today);
  prior.setDate(prior.getDate() - 30);
  return { from: fmt(prior), to: fmt(today) };
}

function ReportTable({
  ariaLabel,
  columns,
  rows,
  loading,
}: {
  ariaLabel: string;
  columns: Column[];
  rows: Array<Record<string, string | number>>;
  loading: boolean;
}) {
  return (
    <Table
      aria-label={ariaLabel}
      className="text-sm"
      classNames={{ wrapper: 'rounded-2xl border border-default p-0 shadow-sm' }}
    >
      <TableHeader>
        {columns.map((c) => (
          <TableColumn key={c.key}>{c.title}</TableColumn>
        ))}
      </TableHeader>
      <TableBody
        items={rows}
        isLoading={loading}
        emptyContent={
          <div className="py-8 text-center text-sm text-foreground-500">Không có dữ liệu</div>
        }
        loadingContent={
          <div className="space-y-3 py-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-9 w-full rounded-lg" />
            ))}
          </div>
        }
      >
        {(row) => (
          <TableRow key={JSON.stringify(row)}>
            {columns.map((c) => (
              <TableCell key={c.key} className="tabular-nums">
                {row[c.key]}
              </TableCell>
            ))}
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
}

export default function ReportsView() {
  const [range] = useState(initialRange);
  const [dateFrom, setDateFrom] = useState(range.from);
  const [dateTo, setDateTo] = useState(range.to);
  const [tab, setTab] = useState<TabKey>('messages');
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [msgData, setMsgData] = useState<MessageRow[]>([]);
  const [contactData, setContactData] = useState<CountRow[]>([]);
  const [aptData, setAptData] = useState<CountRow[]>([]);

  async function fetchReport(tabKey: TabKey) {
    setLoading(true);
    setError(null);
    try {
      const params = { from: dateFrom, to: dateTo };
      if (tabKey === 'messages') {
        const res = await api.get('/reports/messages', { params });
        setMsgData(res.data.data || res.data);
      } else if (tabKey === 'contacts') {
        const res = await api.get('/reports/contacts', { params });
        const raw = res.data;
        // Combine treatmentProgress + medicationStatus distributions.
        const rows: CountRow[] = [];
        const days = Array.isArray(raw.newPerDay) ? raw.newPerDay : [];
        for (const d of days) {
          rows.push({ label: `Mới ${d.date}`, count: Number(d.count ?? 0) });
        }
        for (const t of raw.treatmentProgress ?? []) {
          rows.push({ label: `Tiến triển: ${t.status}`, count: Number(t.count ?? 0) });
        }
        for (const m of raw.medicationStatus ?? []) {
          rows.push({ label: `Thuốc: ${m.status}`, count: Number(m.count ?? 0) });
        }
        setContactData(rows);
      } else {
        const res = await api.get('/reports/appointments', { params });
        const raw = res.data;
        const rows: CountRow[] = [];
        for (const s of raw.byStatus ?? []) {
          rows.push({ label: `Trạng thái: ${s.status}`, count: Number(s.count ?? 0) });
        }
        for (const t of raw.byType ?? []) {
          rows.push({ label: `Loại: ${t.type ?? '—'}`, count: Number(t.count ?? 0) });
        }
        setAptData(rows);
      }
    } catch (err) {
      console.error('Report fetch error:', err);
      setError('Không thể tải dữ liệu báo cáo.');
    } finally {
      setLoading(false);
    }
  }

  async function exportExcel() {
    setExporting(true);
    try {
      const res = await api.get('/reports/export', {
        params: { type: tab, from: dateFrom, to: dateTo },
        responseType: 'blob',
      });
      const url = URL.createObjectURL(res.data as Blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `report-${tab}-${dateFrom}-${dateTo}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export error:', err);
      setError('Xuất Excel thất bại.');
    } finally {
      setExporting(false);
    }
  }

  function handleTabChange(key: Key) {
    const next = key as TabKey;
    setTab(next);
    void fetchReport(next);
  }

  // Initial load.
  useEffect(() => {
    void fetchReport('messages');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="mr-auto text-xl font-semibold text-foreground">Báo cáo</h1>

        <Input
          label="Từ ngày"
          type="date"
          value={dateFrom}
          onValueChange={setDateFrom}
          variant="bordered"
          size="sm"
          className="max-w-[180px]"
        />
        <Input
          label="Đến ngày"
          type="date"
          value={dateTo}
          onValueChange={setDateTo}
          variant="bordered"
          size="sm"
          className="max-w-[180px]"
        />
        <Button
          color="primary"
          startContent={<ArrowsClockwise size={18} />}
          isLoading={loading}
          onPress={() => void fetchReport(tab)}
        >
          Xem
        </Button>
        <Button
          color="success"
          startContent={<FileXls size={18} />}
          isLoading={exporting}
          onPress={() => void exportExcel()}
        >
          Xuất Excel
        </Button>
      </div>

      {error && <Alert color="danger" title={error} onClose={() => setError(null)} />}

      <Tabs aria-label="Báo cáo" selectedKey={tab} onSelectionChange={handleTabChange} variant="underlined">
        <Tab key="messages" title="Tin nhắn" />
        <Tab key="contacts" title="Khách hàng" />
        <Tab key="appointments" title="Lịch hẹn" />
      </Tabs>

      {tab === 'messages' && (
        <ReportTable
          ariaLabel="Báo cáo tin nhắn"
          columns={[
            { key: 'date', title: 'Ngày' },
            { key: 'sent', title: 'Đã gửi' },
            { key: 'received', title: 'Đã nhận' },
          ]}
          rows={msgData}
          loading={loading}
        />
      )}
      {tab === 'contacts' && (
        <ReportTable
          ariaLabel="Báo cáo khách hàng"
          columns={[
            { key: 'label', title: 'Phân loại' },
            { key: 'count', title: 'Số lượng' },
          ]}
          rows={contactData}
          loading={loading}
        />
      )}
      {tab === 'appointments' && (
        <ReportTable
          ariaLabel="Báo cáo lịch hẹn"
          columns={[
            { key: 'label', title: 'Phân loại' },
            { key: 'count', title: 'Số lượng' },
          ]}
          rows={aptData}
          loading={loading}
        />
      )}
    </div>
  );
}
