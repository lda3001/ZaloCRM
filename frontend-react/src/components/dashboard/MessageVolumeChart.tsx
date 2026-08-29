import { useMemo } from 'react';
import { Bar } from 'react-chartjs-2';
import type { ChartData, ChartOptions } from 'chart.js';
import { chartTheme } from './chartTheme';
import ChartCard from './ChartCard';
import { useIsDark } from '../../hooks/use-is-dark';
import type { MessageVolumeItem } from '../../hooks/use-dashboard';

const EMPTY_LABEL = 'Không có dữ liệu';

export default function MessageVolumeChart({ data }: { data: MessageVolumeItem[] }) {
  const isDark = useIsDark();
  const theme = chartTheme(isDark);

  const chartData = useMemo<ChartData<'bar'> | null>(() => {
    if (!data?.length) return null;
    return {
      labels: data.map((d) => d.date.slice(5)), // MM-DD
      datasets: [
        { label: 'Đã gửi', data: data.map((d) => d.sent), backgroundColor: '#006FEE' },
        { label: 'Đã nhận', data: data.map((d) => d.received), backgroundColor: '#17c964' },
      ],
    };
  }, [data]);

  const options = useMemo<ChartOptions<'bar'>>(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'top', labels: { color: theme.text, boxWidth: 12 } },
        tooltip: {
          backgroundColor: theme.tooltipBg,
          titleColor: theme.tooltipText,
          bodyColor: theme.tooltipText,
          borderColor: theme.border,
          borderWidth: 1,
        },
      },
      scales: {
        x: { grid: { color: theme.grid }, ticks: { color: theme.text } },
        y: { grid: { color: theme.grid }, ticks: { color: theme.text }, beginAtZero: true },
      },
    }),
    [theme],
  );

  return (
    <ChartCard title="Tin nhắn theo ngày">
      {chartData ? (
        <div className="h-[250px]">
          <Bar key={isDark ? 'dark' : 'light'} data={chartData} options={options} />
        </div>
      ) : (
        <div className="flex h-[250px] items-center justify-center text-sm text-foreground-500">
          {EMPTY_LABEL}
        </div>
      )}
    </ChartCard>
  );
}
