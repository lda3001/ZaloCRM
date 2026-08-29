import { useMemo } from 'react';
import { Pie } from 'react-chartjs-2';
import type { ChartData, ChartOptions } from 'chart.js';
import { chartTheme } from './chartTheme';
import ChartCard from './ChartCard';
import { useIsDark } from '../../hooks/use-is-dark';
import type { SourceItem } from '../../hooks/use-dashboard';

const sourceColors: Record<string, string> = {
  FB: '#006FEE', // primary
  TT: '#7828c8', // secondary
  GT: '#f5a524', // warning
  CN: '#17c964', // success
};

function getCount(item: SourceItem): number {
  return typeof item._count === 'number' ? item._count : item._count._all;
}

export default function SourceChart({ data }: { data: SourceItem[] }) {
  const isDark = useIsDark();
  const theme = chartTheme(isDark);

  const chartData = useMemo<ChartData<'pie'> | null>(() => {
    if (!data?.length) return null;
    return {
      labels: data.map((d) => d.source),
      datasets: [
        {
          data: data.map((d) => getCount(d)),
          backgroundColor: data.map((d) => sourceColors[d.source] || '#BDBDBD'),
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
    <ChartCard title="Nguồn khách hàng">
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
