// Applies the saved theme choice to <html> as early as possible — called
// directly in main.jsx before React even mounts, so there's no flash of
// the wrong theme on load. If nothing is saved, no attribute is set at
// all, and the CSS's prefers-color-scheme media query decides instead.
export default function initTheme() {
  const saved = localStorage.getItem('cx_theme'); // 'light' | 'dark' | null (= follow system)
  if (saved === 'light' || saved === 'dark') {
    document.documentElement.setAttribute('data-theme', saved);
  }
}
