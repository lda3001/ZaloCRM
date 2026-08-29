import { useMemo } from 'react';
import { Pie } from 'react-chartjs-2';
import type { ChartData, ChartOptions } from 'chart.js';
import { chartTheme } from './chartTheme';
import ChartCard from './ChartCard';
import { useIsDark } from '../../hooks/use-is-dark';
import type { AppointmentStatusItem } from '../../hooks/use-dashboard';

const statusColors: Record<string, string> = {
  scheduled: '#006FEE', // primary
  completed: '#17c964', // success
  cancelled: '#71717a', // default
  no_show: '#f31260', // danger
};

const statusLabels: Record<string, string> = {
  scheduled: 'Đã lên lịch',
  completed: 'Hoàn thành',
  cancelled: 'Đã hủy',
  no_show: 'Vắng mặt',
};

function getCount(item: AppointmentStatusItem): number {
  return typeof item._count === 'number' ? item._count : item._count._all;
}

export default function AppointmentChart({ data }: { data: AppointmentStatusItem[] }) {
  const isDark = useIsDark();
  const theme = chartTheme(isDark);

  const chartData = useMemo<ChartData<'pie'> | null>(() => {
    if (!data?.length) return null;
    return {
      labels: data.map((d) => statusLabels[d.status] || d.status),
      datasets: [
        {
          data: data.map((d) => getCount(d)),
          backgroundColor: data.map((d) => statusColors[d.status] || '#BDBDBD'),
        },
      ],
    };
  }, [data]);

  const options = useMemo<ChartOptions<'pie'>>(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'right', labels: { color: theme.text, boxWidth: 12 } },
        tooltip: {
          backgroundColor: theme.tooltipBg,
          titleColor: theme.tooltipText,
          bodyColor: theme.tooltipText,
          borderColor: theme.border,
          borderWidth: 1,
        },
      },
    }),
    [theme],
  );

  return (
    <ChartCard title="Trạng thái lịch hẹn">
      {chartData ? (
        <div className="h-[250px]">
          <Pie key={isDark ? 'dark' : 'light'} data={chartData} options={options} />
        </div>
      ) : (
        <div className="flex h-[250px] items-center justify-center text-sm text-foreground-500">
          Không có dữ liệu
        </div>
      )}
    </ChartCard>
  );
}
