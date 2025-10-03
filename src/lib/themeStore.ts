import { writable } from 'svelte/store';

const isBrowser = typeof window !== 'undefined';

const storedTheme = isBrowser ? localStorage.getItem('theme') || 'dark' : 'dark';

export const theme = writable(storedTheme);

export const toggleTheme = () => {
	theme.update((currentTheme) => {
		const newTheme = currentTheme === 'light' ? 'dark' : 'light';
		if (isBrowser) {
			localStorage.setItem('theme', newTheme);
			document.documentElement.setAttribute('data-theme', newTheme);
		}
		return newTheme;
	});
};

// Theme initialization is now handled in +layout.svelte
