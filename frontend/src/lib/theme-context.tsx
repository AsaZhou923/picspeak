'use client';

import { createContext, useContext, useEffect, useRef, useState } from 'react';

type Theme = 'dark' | 'light';

interface ThemeContextValue {
  theme: Theme;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: 'dark',
  toggleTheme: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Always start with 'dark' so server and client initial renders match,
  // preventing React hydration errors. The anti-flash inline script in
  // layout.tsx already applied the correct class before paint, so the
  // page visually shows the right theme even before this state updates.
  const [theme, setTheme] = useState<Theme>('dark');

  // After hydration: read the user's real preference and sync state.
  useEffect(() => {
    const stored = localStorage.getItem('picspeak-theme') as Theme | null;
    const sys: Theme = window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light';
    setTheme(stored ?? sys);
  }, []);

  // Apply class changes. Skip the very first effect run — the class is already
  // correct from the inline script; running here would double-set or wrongly
  // clear it before the preference useEffect above fires.
  const firstMount = useRef(true);
  useEffect(() => {
    if (firstMount.current) {
      firstMount.current = false;
      return;
    }
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    localStorage.setItem('picspeak-theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'));

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
