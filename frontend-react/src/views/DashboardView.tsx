import { useEffect } from 'react';
import { Alert, Card, CardBody, Skeleton } from '@heroui/react';
import { CalendarBlank, ShoppingCart } from '@phosphor-icons/react';
import KpiCards from '../components/dashboard/KpiCards';
import MessageVolumeChart from '../components/dashboard/MessageVolumeChart';
import PipelineChart from '../components/dashboard/PipelineChart';
import SourceChart from '../components/dashboard/SourceChart';
import AppointmentChart from '../components/dashboard/AppointmentChart';
import { useDashboard } from '../hooks/use-dashboard';

function formatVND(n: number): string {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(n);
}

function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <Card key={i} className="rounded-2xl border border-default bg-content1 shadow-sm">
            <CardBody className="flex flex-col items-center gap-3 px-4 py-5">
              <Skeleton className="h-6 w-6 rounded-lg" />
              <Skeleton className="h-7 w-16 rounded-lg" />
              <Skeleton className="h-3 w-24 rounded-lg" />
            </CardBody>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {Array.from({ length: 2 }).map((_, i) => (
          <Card key={i} className="rounded-2xl border border-default bg-content1 shadow-sm">
            <CardBody className="flex flex-col items-center gap-3 px-4 py-5">
              <Skeleton className="h-6 w-6 rounded-lg" />
              <Skeleton className="h-7 w-24 rounded-lg" />
              <Skeleton className="h-3 w-28 rounded-lg" />
            </CardBody>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card className="rounded-2xl border border-default bg-content1 shadow-sm md:col-span-2">
          <CardBody className="p-6">
            <Skeleton className="h-64 w-full rounded-xl" />
          </CardBody>
        </Card>
        <Card className="rounded-2xl border border-default bg-content1 shadow-sm">
          <CardBody className="p-6">
            <Skeleton className="h-64 w-full rounded-xl" />
          </CardBody>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card className="rounded-2xl border border-default bg-content1 shadow-sm">
          <CardBody className="p-6">
            <Skeleton className="h-64 w-full rounded-xl" />
          </CardBody>
        </Card>
        <Card className="rounded-2xl border border-default bg-content1 shadow-sm">
          <CardBody className="p-6">
            <Skeleton className="h-64 w-full rounded-xl" />
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

export default function DashboardView() {
  const {
    kpi,
    messageVolume,
    pipeline,
    sources,
    appointments,
    orderStats,
    loading,
    error,
    fetchAll,
  } = useDashboard();

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  const today = new Date();
  const dateLabel = today.toLocaleDateString('vi-VN', {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Tổng quan</h1>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-success/20 bg-success/10 px-3 py-1 font-mono text-[11px] text-success">
          <i className="ph-fill ph-circle text-[7px]"></i>ZALO ONLINE
        </span>
        <span className="text-sm text-foreground-500">Hôm nay, {dateLabel}</span>
      </header>

      {loading ? (
        <DashboardSkeleton />
      ) : error ? (
        <Alert color="danger" title={error} />
      ) : (
        <>
          <KpiCards kpi={kpi} />

          {/* Order KPI cards */}
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <Card className="crm-card crm-card-interactive rounded-2xl border border-default bg-content1 shadow-sm">
              <CardBody className="flex flex-col items-center gap-2 px-4 py-5 text-center">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary-50 text-primary dark:bg-primary/10">
                  <ShoppingCart size={24} weight="regular" />
                </span>
                <div className="tabular-nums text-2xl font-semibold text-foreground">
                  {orderStats?.totalOrders ?? '—'}
                </div>
                <div className="text-xs text-foreground-600">Đơn hàng mới</div>
              </CardBody>
            </Card>
            <Card className="crm-card crm-card-interactive rounded-2xl border border-default bg-content1 shadow-sm">
              <CardBody className="flex flex-col items-center gap-2 px-4 py-5 text-center">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-warning/10 text-warning">
                  <CalendarBlank size={24} weight="regular" />
                </span>
                <div className="tabular-nums text-2xl font-semibold text-foreground">
                  {formatVND(orderStats?.todayRevenue ?? 0)}
                </div>
                <div className="text-xs text-foreground-600">Doanh thu hôm nay</div>
              </CardBody>
            </Card>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="md:col-span-2">
              <MessageVolumeChart data={messageVolume} />
            </div>
            <div>
              <PipelineChart data={pipeline} />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <SourceChart data={sources} />
            <AppointmentChart data={appointments} />
          </div>
        </>
      )}
    </div>
  );
}
