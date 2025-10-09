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
	debug(message: string, context?: LogContext): void {
		if (this.isDev) {
			console.log(`[DEBUG] ${message}`, context ? context : '');
		}
	}

	/**
	 * Log informational messages (only in development)
	 */
	info(message: string, context?: LogContext): void {
		if (this.isDev) {
			console.log(`[INFO] ${message}`, context ? context : '');
		}
	}

	/**
	 * Log warnings (always logged)
	 */
	warn(message: string, context?: LogContext): void {
		console.warn(`[WARN] ${message}`, context ? context : '');
	}

	/**
	 * Log errors (always logged)
	 */
	error(message: string, error?: Error | unknown, context?: LogContext): void {
		if (error instanceof Error) {
			console.error(`[ERROR] ${message}`, {
				error: error.message,
				stack: error.stack,
				...context
			});
		} else if (error) {
			console.error(`[ERROR] ${message}`, { error, ...context });
		} else {
			console.error(`[ERROR] ${message}`, context ? context : '');
		}
	}
}

// Export singleton instance
export const logger = new Logger();
