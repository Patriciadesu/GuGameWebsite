import { useLayoutEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import './ThemeToggle.css';

type Theme = 'light' | 'dark';

const storageKey = 'gugame-theme';

const initialTheme = (): Theme => {
  const saved = window.localStorage.getItem(storageKey);
  if (saved === 'light' || saved === 'dark') return saved;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(initialTheme);

  useLayoutEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    window.localStorage.setItem(storageKey, theme);
  }, [theme]);

  const nextTheme = theme === 'light' ? 'dark' : 'light';

  return (
    <button
      type="button"
      className="theme-toggle"
      aria-label={`Switch to ${nextTheme} theme`}
      title={`Switch to ${nextTheme} theme`}
      onClick={() => setTheme(nextTheme)}
    >
      {theme === 'light' ? <Moon aria-hidden="true" /> : <Sun aria-hidden="true" />}
    </button>
  );
}

export default ThemeToggle;
