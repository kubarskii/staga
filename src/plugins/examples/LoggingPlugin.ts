/**
 * Logging Plugin - Enhanced logging capabilities for Staga
 */

import { BasePlugin, type PluginMetadata, type PluginContext } from '../PluginSystem';
import type { DIContainer } from '../../di/Container';

export interface LogLevel {
    TRACE: 0;
    DEBUG: 1;
    INFO: 2;
    WARN: 3;
    ERROR: 4;
    FATAL: 5;
}

export interface LoggingConfig {
    level?: keyof LogLevel;
    enableConsole?: boolean;
    enableFile?: boolean;
    fileName?: string;
    maxFileSize?: number;
    enableTransactionLogging?: boolean;
    enableStateChangeLogging?: boolean;
    enablePerformanceLogging?: boolean;
    logFormat?: 'simple' | 'json' | 'structured';
}

export interface LogEntry {
    timestamp: number;
    level: keyof LogLevel;
    category: string;
    message: string;
    data?: any;
    transactionName?: string;
    stepName?: string;
    duration?: number;
}

/**
 * Enhanced logging service
 */
export class LoggingService {
    private logs: LogEntry[] = [];
    private maxLogs = 10000;

    constructor(private config: Required<LoggingConfig>) { }

    log(level: keyof LogLevel, category: string, message: string, data?: any): void {
        const entry: LogEntry = {
            timestamp: Date.now(),
            level,
            category,
            message,
            data
        };

        this.logs.push(entry);
        this.trimLogs();
        this.output(entry);
    }

    trace(category: string, message: string, data?: any): void {
        this.log('TRACE', category, message, data);
    }

    debug(category: string, message: string, data?: any): void {
        this.log('DEBUG', category, message, data);
    }

    info(category: string, message: string, data?: any): void {
        this.log('INFO', category, message, data);
    }

    warn(category: string, message: string, data?: any): void {
        this.log('WARN', category, message, data);
    }

    error(category: string, message: string, data?: any): void {
        this.log('ERROR', category, message, data);
    }

    fatal(category: string, message: string, data?: any): void {
        this.log('FATAL', category, message, data);
    }

    getLogs(filter?: {
        level?: keyof LogLevel;
        category?: string;
        timeRange?: { start: number; end: number };
    }): LogEntry[] {
        if (!filter) return [...this.logs];

        return this.logs.filter(log => {
            if (filter.level && this.getLevelNumber(log.level) < this.getLevelNumber(filter.level)) {
                return false;
            }
            if (filter.category && log.category !== filter.category) {
                return false;
            }
            if (filter.timeRange) {
                if (log.timestamp < filter.timeRange.start || log.timestamp > filter.timeRange.end) {
                    return false;
                }
            }
            return true;
        });
    }

    clearLogs(): void {
        this.logs = [];
    }

    getStats(): {
        totalLogs: number;
        logsByLevel: Record<keyof LogLevel, number>;
        logsByCategory: Record<string, number>;
    } {
        const logsByLevel: Record<keyof LogLevel, number> = {
            TRACE: 0,
            DEBUG: 0,
            INFO: 0,
            WARN: 0,
            ERROR: 0,
            FATAL: 0
        };

        const logsByCategory: Record<string, number> = {};

        for (const log of this.logs) {
            logsByLevel[log.level]++;
            logsByCategory[log.category] = (logsByCategory[log.category] || 0) + 1;
        }

        return {
            totalLogs: this.logs.length,
            logsByLevel,
            logsByCategory
        };
    }

    private output(entry: LogEntry): void {
        if (!this.config.enableConsole) return;

        const levelNumber = this.getLevelNumber(entry.level);
        const configLevelNumber = this.getLevelNumber(this.config.level);

        if (levelNumber < configLevelNumber) return;

        const formatted = this.formatLog(entry);

        switch (entry.level) {
            case 'TRACE':
            case 'DEBUG':
                console.debug(formatted);
                break;
            case 'INFO':
                console.info(formatted);
                break;
            case 'WARN':
                console.warn(formatted);
                break;
            case 'ERROR':
            case 'FATAL':
                console.error(formatted);
                break;
        }
    }

    private formatLog(entry: LogEntry): string {
        const timestamp = new Date(entry.timestamp).toISOString();

        switch (this.config.logFormat) {
            case 'json':
                return JSON.stringify(entry);

            case 'structured':
                return `[${timestamp}] ${entry.level.padEnd(5)} [${entry.category}] ${entry.message}${entry.data ? ` | ${JSON.stringify(entry.data)}` : ''}`;

            case 'simple':
            default:
                return `[${timestamp}] ${entry.level} ${entry.message}`;
        }
    }

    private getLevelNumber(level: keyof LogLevel): number {
        const levels: LogLevel = { TRACE: 0, DEBUG: 1, INFO: 2, WARN: 3, ERROR: 4, FATAL: 5 };
        return levels[level];
    }

    private trimLogs(): void {
        if (this.logs.length > this.maxLogs) {
            this.logs = this.logs.slice(-this.maxLogs);
        }
    }
}

/**
 * Logging plugin for enhanced Staga logging
 */
export class LoggingPlugin<TState extends object = any> extends BasePlugin<TState> {
    readonly metadata: PluginMetadata = {
        name: 'logging',
        version: '1.0.0',
        description: 'Enhanced logging capabilities for Staga',
        author: 'Staga Team',
        keywords: ['logging', 'debugging', 'monitoring']
    };

    private loggingService?: LoggingService;

    override configure(container: DIContainer): void {
        // Register logging service
        container.register(
            'loggingService',
            () => {
                const config: Required<LoggingConfig> = {
                    level: 'INFO',
                    enableConsole: true,
                    enableFile: false,
                    fileName: 'staga.log',
                    maxFileSize: 10 * 1024 * 1024, // 10MB
                    enableTransactionLogging: true,
                    enableStateChangeLogging: false,
                    enablePerformanceLogging: true,
                    logFormat: 'structured',
                    ...this.getConfig()
                };

                this.loggingService = new LoggingService(config);
                return this.loggingService;
            },
            { scope: 'singleton' }
        );
    }

    override validateConfig(config: Record<string, unknown>): string[] | undefined {
        const errors: string[] = [];

        if (config.level && !['TRACE', 'DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL'].includes(config.level as string)) {
            errors.push('Invalid log level. Must be one of: TRACE, DEBUG, INFO, WARN, ERROR, FATAL');
        }

        if (config.logFormat && !['simple', 'json', 'structured'].includes(config.logFormat as string)) {
            errors.push('Invalid log format. Must be one of: simple, json, structured');
        }

        if (config.maxFileSize && (typeof config.maxFileSize !== 'number' || config.maxFileSize <= 0)) {
            errors.push('maxFileSize must be a positive number');
        }

        return errors.length > 0 ? errors : undefined;
    }

    protected setupHooks(): void {
        const config = this.getConfig();

        this.setHooks({
            onInstall: (context: PluginContext<TState>) => {
                context.logger.info('Logging plugin installed');

                if (!this.loggingService) {
                    this.loggingService = context.container.resolve<LoggingService>('loggingService');
                }
            },

                        onInitialize: (_context: PluginContext<TState>) => {
                this.loggingService?.info('staga', 'Staga orchestrator initialized');
            },

            onShutdown: (_context: PluginContext<TState>) => {
                this.loggingService?.info('staga', 'Staga orchestrator shutting down');
            },

            onBeforeTransaction: (_context: PluginContext<TState>, transactionName: string, payload: any) => {
                if (config.enableTransactionLogging !== false) {
                    this.loggingService?.info('transaction', `Starting transaction: ${transactionName}`, { payload });
                }
            },

            onAfterTransaction: (_context: PluginContext<TState>, transactionName: string, success: boolean, error?: Error) => {
                if (config.enableTransactionLogging !== false) {
                    if (success) {
                        this.loggingService?.info('transaction', `Transaction completed: ${transactionName}`);
                    } else {
                        this.loggingService?.error('transaction', `Transaction failed: ${transactionName}`, { error: error?.message });
                    }
                }
            },

            onStateChange: (_context: PluginContext<TState>, newState: TState, oldState: TState) => {
                if (config.enableStateChangeLogging) {
                    this.loggingService?.debug('state', 'State changed', { 
                        hasChanges: newState !== oldState 
                    });
                }
            }
        });
    }

    private getConfig(): LoggingConfig {
        // This would come from the plugin context in a real implementation
        return {};
    }

    // Public API for accessing logs
    getLogs(filter?: Parameters<LoggingService['getLogs']>[0]): LogEntry[] {
        return this.loggingService?.getLogs(filter) || [];
    }

    getStats(): ReturnType<LoggingService['getStats']> | undefined {
        return this.loggingService?.getStats();
    }

    clearLogs(): void {
        this.loggingService?.clearLogs();
    }
}