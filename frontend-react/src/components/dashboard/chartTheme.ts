import {
  ArcElement,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LinearScale,
  Tooltip,
} from 'chart.js';

// Register the Chart.js building blocks used by the dashboard charts. Imported
// for side effects by every chart component so registration happens exactly once.
ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, Tooltip, Legend);

export interface ChartTheme {
  isDark: boolean;
  /** Legend + tick text (approximates HeroUI text-foreground-600). */
  text: string;
  /** Grid / border line tones (approximates HeroUI border-default). */
  grid: string;
  border: string;
  tooltipBg: string;
  tooltipText: string;
}

/**
 * Theme-aware palette for Chart.js. Chart.js reads raw color values (it does not
 * understand Tailwind semantic tokens), so we derive them from the current theme.
 */
export function chartTheme(isDark: boolean): ChartTheme {
  return {
    isDark,
    text: isDark ? '#a1a1aa' : '#566277',
    grid: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(23,32,51,0.065)',
    border: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(23,32,51,0.1)',
    tooltipBg: isDark ? '#18181b' : '#ffffff',
    tooltipText: isDark ? '#fafafa' : '#172033',
  };
}
