import { useState } from 'react';
import { Button } from '@heroui/react';
import { Moon, Sun } from '@phosphor-icons/react';

export default function ThemeToggle() {
  const [isDark, setIsDark] = useState(() => localStorage.getItem('theme') !== 'light');

  const toggle = () => {
    const next = !isDark;
    setIsDark(next);
    document.documentElement.classList.toggle('dark', next);
    localStorage.setItem('theme', next ? 'dark' : 'light');
  };

  return (
    <Button
      isIconOnly
      variant="light"
      className={
        isDark
          ? 'text-foreground-600'
          : 'bg-amber-50 text-amber-600 shadow-sm ring-1 ring-amber-200/70'
      }
      aria-label={isDark ? 'Chuyển sang giao diện sáng' : 'Chuyển sang giao diện tối'}
      title={isDark ? 'Chuyển sang giao diện sáng' : 'Chuyển sang giao diện tối'}
      onPress={toggle}
    >
      {isDark ? <Sun size={22} /> : <Moon size={22} />}
    </Button>
  );
}
