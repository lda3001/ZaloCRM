import { useMemo } from 'react';
import { Doughnut } from 'react-chartjs-2';
import type { ChartData, ChartOptions } from 'chart.js';
import { chartTheme } from './chartTheme';
import ChartCard from './ChartCard';
import { useIsDark } from '../../hooks/use-is-dark';
import type { PipelineItem } from '../../hooks/use-dashboard';

const statusColors: Record<string, string> = {
  new: '#71717a', // default
  contacted: '#006FEE', // primary
  interested: '#f5a524', // warning
  converted: '#17c964', // success
  lost: '#f31260', // danger
};

const statusLabels: Record<string, string> = {
  new: 'Mới',
  contacted: 'Đã liên hệ',
  interested: 'Quan tâm',
  converted: 'Chuyển đổi',
  lost: 'Mất',
};

function getCount(item: PipelineItem): number {
  return typeof item._count === 'number' ? item._count : item._count._all;
}

export default function PipelineChart({ data }: { data: PipelineItem[] }) {
  const isDark = useIsDark();
  const theme = chartTheme(isDark);

  const chartData = useMemo<ChartData<'doughnut'> | null>(() => {
    if (!data?.length) return null;
    const filtered = data.filter((d) => d.status);
    if (!filtered.length) return null;
    return {
      labels: filtered.map((d) => statusLabels[d.status || ''] || d.status),
      datasets: [
        {
          data: filtered.map((d) => getCount(d)),
          backgroundColor: filtered.map((d) => statusColors[d.status || ''] || '#BDBDBD'),
        },
      ],
    };
  }, [data]);

  const options = useMemo<ChartOptions<'doughnut'>>(
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
    <ChartCard title="Pipeline khách hàng">
      {chartData ? (
        <div className="h-[250px]">
          <Doughnut key={isDark ? 'dark' : 'light'} data={chartData} options={options} />
        </div>
      ) : (
        <div className="flex h-[250px] items-center justify-center text-sm text-foreground-500">
          Không có dữ liệu
        </div>
      )}
    </ChartCard>
  );
}
