import { writable } from 'svelte/store';

const isBrowser = typeof window !== 'undefined';

const storedTheme = isBrowser ? localStorage.getItem('theme') : 'light';

export const theme = writable(storedTheme);

export const toggleTheme = () => {
  theme.update(currentTheme => {
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';
    if (isBrowser) {
      localStorage.setItem('theme', newTheme);
      document.documentElement.setAttribute('data-theme', newTheme);
    }
    return newTheme;
  });
};

if (isBrowser) {
  theme.subscribe(currentTheme => {
    document.documentElement.setAttribute('data-theme', currentTheme ?? 'light');
  });
}
