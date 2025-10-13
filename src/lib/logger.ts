import { dev } from '$app/environment';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogContext {
	[key: string]: any;
}

class Logger {
	private isDev: boolean;

	constructor() {
		this.isDev = dev;
	}

	/**
	 * Log debug information (only in development)
	 */
	debug(message: string, ...args: any[]): void {
		if (this.isDev) {
			console.log(`[DEBUG] ${message}`, ...args);
		}
	}

	/**
	 * Log informational messages (only in development)
	 */
	info(message: string, ...args: any[]): void {
		if (this.isDev) {
			console.log(`[INFO] ${message}`, ...args);
		}
	}

	/**
	 * Log warnings (always logged)
	 */
	warn(message: string, ...args: any[]): void {
		console.warn(`[WARN] ${message}`, ...args);
	}

	/**
	 * Log errors (always logged)
	 */
	error(message: string, ...args: any[]): void {
		console.error(`[ERROR] ${message}`, ...args);
	}
}

// Export singleton instance
export const logger = new Logger();
