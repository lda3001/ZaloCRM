/**
 * Shared formatting helpers. Ported from the inline helpers in the Vue views
 * (`formatVND`, `formatDate`) so every view renders numbers and dates the same
 * Vietnamese way.
 */

export function formatVND(n: number): string {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(n);
}

export function formatDate(date: string | null | undefined): string {
  if (!date) return '';
  return new Date(date).toLocaleDateString('vi-VN');
}
