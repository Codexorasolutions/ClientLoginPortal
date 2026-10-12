import { useEffect, useState } from 'react';

const systemPrefersDark = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches;

// Cycles System -> Light -> Dark -> System on each click. "System" means no
// explicit choice is saved, so the page follows the OS setting and updates
// live if that changes — most people never touch this and get the right
// thing automatically; a click is only needed to override it.
export default function ThemeToggle() {
  const [mode, setMode] = useState(() => localStorage.getItem('cx_theme') || 'system');

  useEffect(() => {
    if (mode === 'system') {
      document.documentElement.removeAttribute('data-theme');
      localStorage.removeItem('cx_theme');
    } else {
      document.documentElement.setAttribute('data-theme', mode);
      localStorage.setItem('cx_theme', mode);
    }
  }, [mode]);

  const next = { system: 'light', light: 'dark', dark: 'system' };
  const icon = { system: systemPrefersDark() ? '🌙' : '☀️', light: '☀️', dark: '🌙' };
  const label = { system: 'Theme: System', light: 'Theme: Light', dark: 'Theme: Dark' };

  return (
    <button
      type="button"
      className="bell-btn"
      title={`${label[mode]} — click to change`}
      aria-label={label[mode]}
      onClick={() => setMode(next[mode])}
    >
      {icon[mode]}
    </button>
  );
}
