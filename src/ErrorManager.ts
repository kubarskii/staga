/**
 * Centralized error handling system for consistent error management
 */

export enum ErrorSeverity {
    LOW = 'low',
    MEDIUM = 'medium',
    HIGH = 'high',
    CRITICAL = 'critical'
}

export interface ErrorContext {
    component: string;
    operation: string;
    metadata?: Record<string, unknown> | undefined;
    timestamp: number;
}

export interface StructuredError {
    message: string;
    severity: ErrorSeverity;
    context: ErrorContext;
    originalError?: Error | undefined;
    stack?: string | undefined;
}

export interface ErrorHandler {
    handle(error: StructuredError): void;
    canHandle(error: StructuredError): boolean;
}

/**
 * Console error handler for development
 */
export class ConsoleErrorHandler implements ErrorHandler {
    canHandle(_error: StructuredError): boolean {
        return true; // Can handle all errors
    }

    handle(error: StructuredError): void {
        const logMethod = this.getLogMethod(error.severity);
        const prefix = `[${error.context.component}:${error.context.operation}]`;

        logMethod(`${prefix} ${error.message}`, {
            severity: error.severity,
            context: error.context,
            originalError: error.originalError,
        });
    }

    private getLogMethod(severity: ErrorSeverity): typeof console.log {
        switch (severity) {
            case ErrorSeverity.LOW:
                return console.debug;
            case ErrorSeverity.MEDIUM:
                return console.warn;
            case ErrorSeverity.HIGH:
            case ErrorSeverity.CRITICAL:
                return console.error;
            default:
                return console.log;
        }
    }
}

/**
 * Centralized error manager
 */
export class ErrorManager {
    private handlers: ErrorHandler[] = [];
    private errorCounts: Map<string, number> = new Map();
    private rateLimitMap: Map<string, number> = new Map();
    private readonly rateLimitWindow = 1000; // 1 second

    constructor() {
        // Default console handler
        this.addHandler(new ConsoleErrorHandler());
    }

    addHandler(handler: ErrorHandler): void {
        this.handlers.push(handler);
    }

    removeHandler(handler: ErrorHandler): void {
        const index = this.handlers.indexOf(handler);
        if (index !== -1) {
            this.handlers.splice(index, 1);
        }
    }

    /**
     * Handle error with context and severity
     */
    handleError(
        error: Error | string,
        context: Partial<ErrorContext>,
        severity: ErrorSeverity = ErrorSeverity.MEDIUM
    ): void {
        const structuredError: StructuredError = {
            message: typeof error === 'string' ? error : error.message,
            severity,
            context: {
                component: context.component || 'unknown',
                operation: context.operation || 'unknown',
                metadata: context.metadata || undefined,
                timestamp: Date.now(),
            },
            originalError: typeof error === 'string' ? undefined : error,
            stack: typeof error === 'string' ? undefined : error.stack,
        };

        // Rate limiting to prevent spam
        if (this.shouldRateLimit(structuredError)) {
            return;
        }

        // Update error counts
        this.updateErrorCounts(structuredError);

        // Send to all capable handlers
        for (const handler of this.handlers) {
            if (handler.canHandle(structuredError)) {
                try {
                    handler.handle(structuredError);
                } catch (handlerError) {
                    // Avoid infinite loops - use basic console for handler errors
                    console.error('Error in error handler:', handlerError);
                }
            }
        }
    }

    /**
     * Handle saga-specific errors
     */
    handleSagaError(
        error: Error | string,
        component: 'transaction' | 'step' | 'event' | 'state' | 'selector',
        operation: string,
        metadata?: Record<string, unknown>
    ): void {
        this.handleError(error, {
            component: `saga-${component}`,
            operation,
            metadata: metadata || undefined,
        }, ErrorSeverity.HIGH);
    }

    /**
     * Handle listener errors (usually less critical)
     */
    handleListenerError(
        error: Error | string,
        eventType: string,
        metadata?: Record<string, unknown>
    ): void {
        this.handleError(error, {
            component: 'event-listener',
            operation: eventType,
            metadata: metadata || undefined,
        }, ErrorSeverity.LOW);
    }

    /**
     * Handle system errors (usually critical)
     */
    handleSystemError(
        error: Error | string,
        operation: string,
        metadata?: Record<string, unknown>
    ): void {
        this.handleError(error, {
            component: 'system',
            operation,
            metadata: metadata || undefined,
        }, ErrorSeverity.CRITICAL);
    }

    /**
     * Get error statistics
     */
    getErrorStats(): {
        totalErrors: number;
        errorsByComponent: Record<string, number>;
        errorsBySeverity: Record<ErrorSeverity, number>;
    } {
        const errorsByComponent: Record<string, number> = {};
        const errorsBySeverity: Record<ErrorSeverity, number> = {
            [ErrorSeverity.LOW]: 0,
            [ErrorSeverity.MEDIUM]: 0,
            [ErrorSeverity.HIGH]: 0,
            [ErrorSeverity.CRITICAL]: 0,
        };

        let totalErrors = 0;
        for (const [key, count] of this.errorCounts) {
            totalErrors += count;

            // Parse key to extract component
            const [component] = key.split(':');
            if (component) {
                errorsByComponent[component] = (errorsByComponent[component] || 0) + count;
            }
        }

        return {
            totalErrors,
            errorsByComponent,
            errorsBySeverity,
        };
    }

    /**
     * Clear error statistics
     */
    clearStats(): void {
        this.errorCounts.clear();
        this.rateLimitMap.clear();
    }

    private shouldRateLimit(error: StructuredError): boolean {
        const key = `${error.context.component}:${error.context.operation}:${error.message}`;
        const now = Date.now();
        const lastSeen = this.rateLimitMap.get(key) || 0;

        if (now - lastSeen < this.rateLimitWindow) {
            return true; // Rate limited
        }

        this.rateLimitMap.set(key, now);
        return false;
    }

    private updateErrorCounts(error: StructuredError): void {
        const key = `${error.context.component}:${error.context.operation}`;
        this.errorCounts.set(key, (this.errorCounts.get(key) || 0) + 1);
    }
}

// Singleton instance
export const errorManager = new ErrorManager();

/**
 * Utility functions for common error scenarios
 */
export const ErrorUtils = {
    /**
     * Safe execution wrapper that handles errors automatically
     */
    safeExecute<T>(
        fn: () => T,
        context: Partial<ErrorContext>,
        fallback?: T
    ): T | undefined {
        try {
            return fn();
        } catch (error) {
            errorManager.handleError(error as Error, context);
            return fallback;
        }
    },

    /**
     * Safe async execution wrapper
     */
    async safeExecuteAsync<T>(
        fn: () => Promise<T>,
        context: Partial<ErrorContext>,
        fallback?: T
    ): Promise<T | undefined> {
        try {
            return await fn();
        } catch (error) {
            errorManager.handleError(error as Error, context);
            return fallback;
        }
    },

    /**
     * Create a safe listener wrapper
     */
    createSafeListener<T extends (...args: any[]) => any>(
        listener: T,
        eventType: string
    ): T {
        return ((...args: Parameters<T>) => {
            try {
                return listener(...args);
            } catch (error) {
                errorManager.handleListenerError(
                    error as Error,
                    eventType,
                    { args: args.length }
                );
            }
        }) as T;
    },
};