import { useEffect, useState } from 'react';

/**
 * Reads the `.dark` class on <html> and returns whether the current theme is
 * dark. Watches the class attribute so charts re-render when the user toggles
 * the theme (mirrors how ThemeToggle flips `document.documentElement`).
 */
export function useIsDark(): boolean {
  const [isDark, setIsDark] = useState(
    () => typeof document !== 'undefined' && document.documentElement.classList.contains('dark'),
  );

  useEffect(() => {
    const target = document.documentElement;
    const observer = new MutationObserver(() => {
      setIsDark(target.classList.contains('dark'));
    });
    observer.observe(target, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  return isDark;
}
