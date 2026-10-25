// Same behaviour as the header ThemeToggle (localStorage 'cx_theme' + <html data-theme>), callable from anywhere.
export function applyTheme(mode) {
  if (mode === 'light' || mode === 'dark') {
    localStorage.setItem('cx_theme', mode);
    document.documentElement.setAttribute('data-theme', mode);
  } else {
    localStorage.removeItem('cx_theme');
    document.documentElement.removeAttribute('data-theme');
  }
  window.dispatchEvent(new CustomEvent('cx-theme-change', { detail: mode }));
}
