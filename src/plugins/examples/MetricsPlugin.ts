/**
 * Metrics Plugin - Comprehensive performance monitoring and metrics collection for Staga
 */

import { BasePlugin, type PluginMetadata, type PluginContext } from '../PluginSystem';
import type { DIContainer } from '../../di/Container';
import { isDebugEnabled } from '../../utils';

export interface MetricsConfig {
    enableTransactionMetrics?: boolean;
    enableStateMetrics?: boolean;
    enablePerformanceMetrics?: boolean;
    enableMemoryMetrics?: boolean;
    metricsRetentionDays?: number;
    aggregationInterval?: number; // in milliseconds
}

export interface TransactionMetrics {
    name: string;
    totalExecutions: number;
    successfulExecutions: number;
    failedExecutions: number;
    averageDuration: number;
    minDuration: number;
    maxDuration: number;
    lastExecuted: number;
    errorRate: number;
}

export interface StateMetrics {
    totalChanges: number;
    averageStateSize: number;
    undoOperations: number;
    redoOperations: number;
    snapshotCount: number;
    lastChanged: number;
}

export interface PerformanceMetrics {
    cpuUsage?: number;
    memoryUsage: {
        used: number;
        total: number;
        percentage: number;
    };
    gcCollections?: number;
    eventLoopLag?: number;
}

export interface MetricEvent {
    timestamp: number;
    type: 'transaction' | 'state' | 'performance' | 'custom';
    category: string;
    name: string;
    value: number;
    unit: string;
    metadata?: Record<string, unknown> | undefined;
}

/**
 * Comprehensive metrics collection service
 */
export class MetricsService {
    private transactionMetrics = new Map<string, TransactionMetrics>();
    private stateMetrics: StateMetrics = {
        totalChanges: 0,
        averageStateSize: 0,
        undoOperations: 0,
        redoOperations: 0,
        snapshotCount: 0,
        lastChanged: 0
    };
    private performanceMetrics: PerformanceMetrics = {
        memoryUsage: { used: 0, total: 0, percentage: 0 }
    };
    private metricEvents: MetricEvent[] = [];
    private aggregationTimer?: NodeJS.Timeout;

    constructor(private config: Required<MetricsConfig>) {
        if (this.config.aggregationInterval > 0) {
            this.startAggregation();
        }
    }

    // ===== TRANSACTION METRICS =====

    recordTransactionStart(name: string): void {
        if (!this.config.enableTransactionMetrics) return;

        const metrics = this.getOrCreateTransactionMetrics(name);
        metrics.totalExecutions++;
        metrics.lastExecuted = Date.now();
    }

    recordTransactionSuccess(name: string, duration: number): void {
        if (!this.config.enableTransactionMetrics) return;

        const metrics = this.getOrCreateTransactionMetrics(name);
        metrics.successfulExecutions++;
        this.updateDurationMetrics(metrics, duration);
        this.updateErrorRate(metrics);

        this.recordEvent({
            timestamp: Date.now(),
            type: 'transaction',
            category: 'success',
            name,
            value: duration,
            unit: 'ms'
        });
    }

    recordTransactionFailure(name: string, duration: number, error: Error): void {
        if (!this.config.enableTransactionMetrics) return;

        const metrics = this.getOrCreateTransactionMetrics(name);
        metrics.failedExecutions++;
        this.updateDurationMetrics(metrics, duration);
        this.updateErrorRate(metrics);

        this.recordEvent({
            timestamp: Date.now(),
            type: 'transaction',
            category: 'failure',
            name,
            value: duration,
            unit: 'ms',
            metadata: { error: error.message }
        });
    }

    getTransactionMetrics(name?: string): TransactionMetrics[] {
        if (name) {
            const metrics = this.transactionMetrics.get(name);
            return metrics ? [metrics] : [];
        }
        return Array.from(this.transactionMetrics.values());
    }

    // ===== STATE METRICS =====

    recordStateChange(newStateSize: number): void {
        if (!this.config.enableStateMetrics) return;

        this.stateMetrics.totalChanges++;
        this.stateMetrics.averageStateSize = this.calculateMovingAverage(
            this.stateMetrics.averageStateSize,
            newStateSize,
            this.stateMetrics.totalChanges
        );
        this.stateMetrics.lastChanged = Date.now();

        this.recordEvent({
            timestamp: Date.now(),
            type: 'state',
            category: 'change',
            name: 'state_size',
            value: newStateSize,
            unit: 'bytes'
        });
    }

    recordUndoOperation(): void {
        if (!this.config.enableStateMetrics) return;
        this.stateMetrics.undoOperations++;
    }

    recordRedoOperation(): void {
        if (!this.config.enableStateMetrics) return;
        this.stateMetrics.redoOperations++;
    }

    recordSnapshotCreated(): void {
        if (!this.config.enableStateMetrics) return;
        this.stateMetrics.snapshotCount++;
    }

    getStateMetrics(): StateMetrics {
        return { ...this.stateMetrics };
    }

    // ===== PERFORMANCE METRICS =====

    recordPerformanceMetrics(): void {
        if (!this.config.enablePerformanceMetrics) return;

        // Memory metrics
        if (typeof process !== 'undefined' && process.memoryUsage) {
            const memory = process.memoryUsage();
            this.performanceMetrics.memoryUsage = {
                used: memory.heapUsed,
                total: memory.heapTotal,
                percentage: (memory.heapUsed / memory.heapTotal) * 100
            };

            this.recordEvent({
                timestamp: Date.now(),
                type: 'performance',
                category: 'memory',
                name: 'heap_used',
                value: memory.heapUsed,
                unit: 'bytes'
            });
        }

        // CPU metrics (if available)
        if (typeof process !== 'undefined' && process.cpuUsage) {
            const cpuUsage = process.cpuUsage();
            const totalUsage = cpuUsage.user + cpuUsage.system;

            this.recordEvent({
                timestamp: Date.now(),
                type: 'performance',
                category: 'cpu',
                name: 'total_usage',
                value: totalUsage,
                unit: 'microseconds'
            });
        }
    }

    getPerformanceMetrics(): PerformanceMetrics {
        this.recordPerformanceMetrics();
        return { ...this.performanceMetrics };
    }

    // ===== CUSTOM METRICS =====

    recordCustomMetric(
        category: string,
        name: string,
        value: number,
        unit: string = 'count',
        metadata?: Record<string, unknown>
    ): void {
        this.recordEvent({
            timestamp: Date.now(),
            type: 'custom',
            category,
            name,
            value,
            unit,
            metadata
        });
    }

    // ===== AGGREGATION & REPORTING =====

    getMetricEvents(filter?: {
        type?: MetricEvent['type'];
        category?: string;
        timeRange?: { start: number; end: number };
    }): MetricEvent[] {
        if (!filter) return [...this.metricEvents];

        return this.metricEvents.filter(event => {
            if (filter.type && event.type !== filter.type) return false;
            if (filter.category && event.category !== filter.category) return false;
            if (filter.timeRange) {
                if (event.timestamp < filter.timeRange.start || event.timestamp > filter.timeRange.end) {
                    return false;
                }
            }
            return true;
        });
    }

    getAggregatedMetrics(timeRange?: { start: number; end: number }): {
        transactions: {
            totalExecutions: number;
            successRate: number;
            averageDuration: number;
            topFailures: Array<{ name: string; failures: number; errorRate: number }>;
        };
        state: StateMetrics;
        performance: PerformanceMetrics;
        summary: {
            totalEvents: number;
            timeRange: { start: number; end: number };
        };
    } {
        const events = timeRange ? this.getMetricEvents({ timeRange }) : this.getMetricEvents();
        const transactions = Array.from(this.transactionMetrics.values());

        const totalExecutions = transactions.reduce((sum, t) => sum + t.totalExecutions, 0);
        const totalSuccessful = transactions.reduce((sum, t) => sum + t.successfulExecutions, 0);
        const successRate = totalExecutions > 0 ? (totalSuccessful / totalExecutions) * 100 : 0;

        const averageDuration = transactions.length > 0
            ? transactions.reduce((sum, t) => sum + t.averageDuration, 0) / transactions.length
            : 0;

        const topFailures = transactions
            .filter(t => t.failedExecutions > 0)
            .sort((a, b) => b.failedExecutions - a.failedExecutions)
            .slice(0, 5)
            .map(t => ({
                name: t.name,
                failures: t.failedExecutions,
                errorRate: t.errorRate
            }));

        return {
            transactions: {
                totalExecutions,
                successRate,
                averageDuration,
                topFailures
            },
            state: this.getStateMetrics(),
            performance: this.getPerformanceMetrics(),
            summary: {
                totalEvents: events.length,
                timeRange: timeRange || {
                    start: events.length > 0 ? events[0]!.timestamp : Date.now(),
                    end: Date.now()
                }
            }
        };
    }

    clearMetrics(): void {
        this.transactionMetrics.clear();
        this.metricEvents = [];
        this.stateMetrics = {
            totalChanges: 0,
            averageStateSize: 0,
            undoOperations: 0,
            redoOperations: 0,
            snapshotCount: 0,
            lastChanged: 0
        };
    }

    dispose(): void {
        if (this.aggregationTimer) {
            clearInterval(this.aggregationTimer);
        }
    }

    // ===== PRIVATE METHODS =====

    private getOrCreateTransactionMetrics(name: string): TransactionMetrics {
        let metrics = this.transactionMetrics.get(name);
        if (!metrics) {
            metrics = {
                name,
                totalExecutions: 0,
                successfulExecutions: 0,
                failedExecutions: 0,
                averageDuration: 0,
                minDuration: Infinity,
                maxDuration: 0,
                lastExecuted: 0,
                errorRate: 0
            };
            this.transactionMetrics.set(name, metrics);
        }
        return metrics;
    }

    private updateDurationMetrics(metrics: TransactionMetrics, duration: number): void {
        metrics.averageDuration = this.calculateMovingAverage(
            metrics.averageDuration,
            duration,
            metrics.totalExecutions
        );
        metrics.minDuration = Math.min(metrics.minDuration, duration);
        metrics.maxDuration = Math.max(metrics.maxDuration, duration);
    }

    private updateErrorRate(metrics: TransactionMetrics): void {
        metrics.errorRate = metrics.totalExecutions > 0
            ? (metrics.failedExecutions / metrics.totalExecutions) * 100
            : 0;
    }

    private calculateMovingAverage(currentAverage: number, newValue: number, count: number): number {
        return count === 1 ? newValue : currentAverage + (newValue - currentAverage) / count;
    }

    private recordEvent(event: MetricEvent): void {
        this.metricEvents.push(event);
        this.trimEvents();
    }

    private trimEvents(): void {
        const retentionTime = this.config.metricsRetentionDays * 24 * 60 * 60 * 1000;
        const cutoffTime = Date.now() - retentionTime;

        this.metricEvents = this.metricEvents.filter(event => event.timestamp > cutoffTime);
    }

    private startAggregation(): void {
        // Note: Aggregation timer disabled to prevent keeping event loop alive
        // Metrics will be recorded on-demand during events
        if (isDebugEnabled()) {
            console.log('🔧 MetricsPlugin: Aggregation timer disabled (on-demand metrics only)');
        }
    }
}

/**
 * Metrics plugin for comprehensive monitoring
 */
export class MetricsPlugin<TState extends object = any> extends BasePlugin<TState> {
    readonly metadata: PluginMetadata = {
        name: 'metrics',
        version: '1.0.0',
        description: 'Comprehensive performance monitoring and metrics collection for Staga',
        author: 'Staga Team',
        keywords: ['metrics', 'monitoring', 'performance', 'analytics']
    };

    private metricsService?: MetricsService;
    private transactionStartTimes = new Map<string, number>();

    override configure(container: DIContainer): void {
        container.register(
            'metricsService',
            () => {
                const config: Required<MetricsConfig> = {
                    enableTransactionMetrics: true,
                    enableStateMetrics: true,
                    enablePerformanceMetrics: true,
                    enableMemoryMetrics: true,
                    metricsRetentionDays: 7,
                    aggregationInterval: 60000, // 1 minute
                    ...this.getConfig()
                };

                this.metricsService = new MetricsService(config);
                return this.metricsService;
            },
            { scope: 'singleton' }
        );
    }

    override validateConfig(config: Record<string, unknown>): string[] | undefined {
        const errors: string[] = [];

        if (config.metricsRetentionDays && (typeof config.metricsRetentionDays !== 'number' || config.metricsRetentionDays <= 0)) {
            errors.push('metricsRetentionDays must be a positive number');
        }

        if (config.aggregationInterval && (typeof config.aggregationInterval !== 'number' || config.aggregationInterval < 1000)) {
            errors.push('aggregationInterval must be at least 1000ms');
        }

        return errors.length > 0 ? errors : undefined;
    }

    protected setupHooks(): void {
        this.setHooks({
            onInstall: (context: PluginContext<TState>) => {
                if (!this.metricsService) {
                    this.metricsService = context.container.resolve<MetricsService>('metricsService');
                }
                context.logger.info('Metrics plugin installed');
            },

            onUninstall: (context: PluginContext<TState>) => {
                this.metricsService?.dispose();
                context.logger.info('Metrics plugin uninstalled');
            },

            onBeforeTransaction: (_context: PluginContext<TState>, transactionName: string, _payload: any) => {
                const startTime = Date.now();
                this.transactionStartTimes.set(transactionName, startTime);
                this.metricsService?.recordTransactionStart(transactionName);
            },

            onAfterTransaction: (_context: PluginContext<TState>, transactionName: string, success: boolean, error?: Error) => {
                const startTime = this.transactionStartTimes.get(transactionName);
                const duration = startTime ? Date.now() - startTime : 0;

                if (success) {
                    this.metricsService?.recordTransactionSuccess(transactionName, duration);
                } else if (error) {
                    this.metricsService?.recordTransactionFailure(transactionName, duration, error);
                }

                this.transactionStartTimes.delete(transactionName);
            },

            onStateChange: (_context: PluginContext<TState>, newState: TState, _oldState: TState) => {
                const stateSize = JSON.stringify(newState).length;
                this.metricsService?.recordStateChange(stateSize);
            }
        });
    }

    // Public API for accessing metrics
    getTransactionMetrics(name?: string): TransactionMetrics[] {
        return this.metricsService?.getTransactionMetrics(name) || [];
    }

    getStateMetrics(): StateMetrics | undefined {
        return this.metricsService?.getStateMetrics();
    }

    getPerformanceMetrics(): PerformanceMetrics | undefined {
        return this.metricsService?.getPerformanceMetrics();
    }

    getAggregatedMetrics(timeRange?: { start: number; end: number }) {
        return this.metricsService?.getAggregatedMetrics(timeRange);
    }

    recordCustomMetric(category: string, name: string, value: number, unit?: string, metadata?: Record<string, unknown>): void {
        this.metricsService?.recordCustomMetric(category, name, value, unit, metadata);
    }

    private getConfig(): MetricsConfig {
        return {};
    }
}