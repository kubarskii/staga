/**
 * Unified Event Management System
 * Consolidates legacy and reactive event systems into a single, efficient implementation
 */

import type {
    EventName,
    EventArgs,
    Listener,
    SagaEventListener,
    AnySagaEventListener,
    AnySagaEvent,
    TypedEventListener,
    SagaEvent
} from '../types';
import { Stream } from '../statekit';
import { SubscriptionManager } from '../utils';
import { ErrorUtils } from '../ErrorManager';

export interface UnifiedEventManagerOptions {
    enableLegacyCompatibility?: boolean;
    maxEventHistory?: number;
    debugMode?: boolean;
    enableEventCompression?: boolean;
    eventBatchSize?: number;
}

/**
 * Event adapter for converting between legacy and reactive formats
 */
class EventAdapter {
    /**
     * Convert legacy event to SagaEvent format
     */
    static legacyToSaga<T extends EventName>(
        eventType: T,
        args: EventArgs<T>
    ): SagaEvent<EventArgs<T>> {
        // Use type assertion for legacy event conversion compatibility
        return {
            type: eventType,
            transactionName: 'legacy-event',
            stepName: eventType,
            payload: args,
            timestamp: Date.now()
        } as SagaEvent<EventArgs<T>>;
    }

    /**
     * Convert string event to SagaEvent format
     */
    static stringToSaga(
        eventType: string,
        args: unknown[]
    ): SagaEvent<unknown[]> {
        return {
            type: eventType as any,
            transactionName: 'legacy-event',
            stepName: eventType,
            payload: args,
            timestamp: Date.now()
        };
    }

    /**
     * Extract legacy arguments from SagaEvent
     */
    static sagaToLegacyArgs<TPayload>(event: SagaEvent<TPayload>): TPayload {
        return event.payload;
    }

    /**
     * Check if event matches legacy format
     */
    static isLegacyFormat(event: any): boolean {
        return event &&
            typeof event === 'object' &&
            'transactionName' in event &&
            event.transactionName === 'legacy-event';
    }
}

/**
 * Unified Event Manager - Single implementation handling both legacy and reactive APIs
 */
export class UnifiedEventManager {
    // Single reactive event stream system
    private eventStreams: Map<string, Stream<SagaEvent<any>>> = new Map();
    private streamSubscriberCounts: Map<string, number> = new Map();
    private subscriptionManager = new SubscriptionManager();

    // Configuration
    private options: Required<UnifiedEventManagerOptions>;

    // Event history and metrics
    private eventHistory: Array<{ timestamp: number; event: SagaEvent<any> }> = [];
    private eventMetrics = {
        totalEmitted: 0,
        totalSubscriptions: 0,
        legacyEvents: 0,
        reactiveEvents: 0,
    };

    constructor(options: UnifiedEventManagerOptions = {}) {
        this.options = {
            enableLegacyCompatibility: true,
            maxEventHistory: 1000,
            debugMode: false,
            enableEventCompression: false,
            eventBatchSize: 100,
            ...options
        };
    }

    // ===== LEGACY EVENT API =====

    /**
     * Subscribe to events with legacy API - now fully unified internally
     * @deprecated Use onSagaEvent() for better type safety
     */
    on<T extends EventName>(event: T, callback: Listener<T>): () => void;
    on(event: string, callback: (...args: unknown[]) => void): () => void;
    on<T extends EventName>(event: T | string, callback: (...args: unknown[]) => void): () => void {
        if (!this.options.enableLegacyCompatibility) {
            throw new Error('Legacy event API is disabled. Use reactive event methods instead.');
        }

        const eventKey = String(event);
        this.eventMetrics.totalSubscriptions++;

        // Create unified subscription using reactive streams only
        const stream = this.getOrCreateEventStream(eventKey);
        const subscription = stream.subscribe((sagaEvent) => {
            ErrorUtils.safeExecute(() => {
                // Convert SagaEvent back to legacy format for the callback
                if (EventAdapter.isLegacyFormat(sagaEvent)) {
                    const args = EventAdapter.sagaToLegacyArgs(sagaEvent);
                    if (Array.isArray(args)) {
                        (callback as any)(...args);
                    } else {
                        (callback as any)(args);
                    }
                } else {
                    // Handle native SagaEvents by extracting payload
                    const payload = sagaEvent.payload;
                    if (Array.isArray(payload)) {
                        (callback as any)(...payload);
                    } else {
                        (callback as any)(payload);
                    }
                }
            }, {
                component: 'unified-event-manager',
                operation: eventKey,
                metadata: { listenerType: 'legacy-unified' }
            });
        });

        this.subscriptionManager.add(subscription);

        return () => {
            subscription();
            this.subscriptionManager.remove(subscription);
        };
    }

    /**
     * Emit events with legacy API - now unified internally
     * @deprecated Use emitSagaEvent() for better type safety
     */
    emit<T extends EventName>(event: T, ...args: EventArgs<T>): void;
    emit(event: string, ...args: unknown[]): void;
    emit<T extends EventName>(event: T | string, ...args: unknown[]): void {
        const eventKey = String(event);
        this.eventMetrics.totalEmitted++;
        this.eventMetrics.legacyEvents++;

        // Convert to unified SagaEvent format
        const sagaEvent = EventAdapter.stringToSaga(eventKey, args);

        // Use unified emission
        this.emitUnified(sagaEvent);
    }

    // ===== REACTIVE SAGA EVENT API =====

    /**
     * Subscribe to specific typed saga events - unified implementation
     */
    onSagaEvent<T extends AnySagaEvent['type'], TPayload = unknown>(
        eventType: T,
        callback: SagaEventListener<T, TPayload>
    ): () => void {
        this.eventMetrics.totalSubscriptions++;

        const stream = this.getOrCreateEventStream(eventType);
        const subscription = stream.subscribe((sagaEvent) => {
            ErrorUtils.safeExecute(() => {
                // Type-safe event handling
                if (this.isEventOfType<T, TPayload>(sagaEvent, eventType)) {
                    callback(sagaEvent as any);
                }
            }, {
                component: 'unified-event-manager',
                operation: eventType,
                metadata: { listenerType: 'reactive-unified' }
            });
        });

        this.subscriptionManager.add(subscription);

        return () => {
            subscription();
            this.subscriptionManager.remove(subscription);
        };
    }

    /**
     * Subscribe to all saga events - unified implementation
     */
    onAnyEvent(callback: AnySagaEventListener): () => void {
        const key = '*';
        this.eventMetrics.totalSubscriptions++;

        const stream = this.getOrCreateEventStream(key);
        const subscription = stream.subscribe((sagaEvent) => {
            ErrorUtils.safeExecute(() => {
                callback(sagaEvent as AnySagaEvent);
            }, {
                component: 'unified-event-manager',
                operation: 'any-event',
                metadata: { listenerType: 'any-unified' }
            });
        });

        this.subscriptionManager.add(subscription);

        return () => {
            subscription();
            this.subscriptionManager.remove(subscription);
        };
    }

    /**
     * Emit a saga event - unified implementation
     */
    emitSagaEvent<TPayload = unknown>(event: SagaEvent<TPayload>): void {
        this.eventMetrics.totalEmitted++;
        this.eventMetrics.reactiveEvents++;

        this.emitUnified(event);
    }

    /**
     * Subscribe to specific typed events with full type inference
     */
    onTypedEvent<TEvent extends AnySagaEvent>(
        eventType: TEvent['type'],
        callback: TypedEventListener<TEvent>
    ): () => void {
        this.eventMetrics.totalSubscriptions++;

        const stream = this.getOrCreateEventStream(eventType);
        const subscription = stream.subscribe((sagaEvent) => {
            ErrorUtils.safeExecute(() => {
                if (this.isEventOfType<TEvent['type']>(sagaEvent, eventType)) {
                    callback(sagaEvent as unknown as TEvent);
                }
            }, {
                component: 'unified-event-manager',
                operation: eventType,
                metadata: { listenerType: 'typed-unified' }
            });
        });

        this.subscriptionManager.add(subscription);

        return () => {
            subscription();
            this.subscriptionManager.remove(subscription);
        };
    }

    // ===== REACTIVE STREAM ACCESS =====

    /**
     * Get reactive stream for specific event type
     */
    getEventStream<T = unknown>(eventType: string): Stream<SagaEvent<T>> {
        return this.getOrCreateEventStream(eventType);
    }

    /**
     * Get all active event stream names
     */
    getActiveStreams(): string[] {
        return Array.from(this.eventStreams.keys());
    }

    // ===== UTILITY & MANAGEMENT =====

    /**
     * Get comprehensive event statistics
     */
    getEventStats(): {
        activeStreams: number;
        activeSubscriptions: number;
        totalEmitted: number;
        legacyEvents: number;
        reactiveEvents: number;
        eventHistorySize: number;
        memoryUsage: string;
    } {
        let totalSubscriptions = 0;
        for (const [key] of this.eventStreams) {
            totalSubscriptions += this.streamSubscriberCounts.get(key) || 0;
        }

        return {
            activeStreams: this.eventStreams.size,
            activeSubscriptions: totalSubscriptions,
            totalEmitted: this.eventMetrics.totalEmitted,
            legacyEvents: this.eventMetrics.legacyEvents,
            reactiveEvents: this.eventMetrics.reactiveEvents,
            eventHistorySize: this.eventHistory.length,
            memoryUsage: `~${Math.round((this.eventStreams.size * 0.1) + (this.eventHistory.length * 0.05))}KB`
        };
    }

    /**
     * Clear event history
     */
    clearEventHistory(): void {
        this.eventHistory = [];
    }

    /**
     * Get event history (for debugging)
     */
    getEventHistory(): Array<{ timestamp: number; event: SagaEvent<any> }> {
        return [...this.eventHistory];
    }

    /**
     * Get filtered event history
     */
    getFilteredEventHistory(filter: {
        eventTypes?: string[];
        timeRange?: { start: number; end: number };
        limit?: number;
    }): Array<{ timestamp: number; event: SagaEvent<any> }> {
        let filtered = this.eventHistory;

        if (filter.eventTypes) {
            filtered = filtered.filter(entry =>
                filter.eventTypes!.includes(entry.event.type)
            );
        }

        if (filter.timeRange) {
            filtered = filtered.filter(entry =>
                entry.timestamp >= filter.timeRange!.start &&
                entry.timestamp <= filter.timeRange!.end
            );
        }

        if (filter.limit) {
            filtered = filtered.slice(-filter.limit);
        }

        return filtered;
    }

    /**
     * Reset all metrics
     */
    resetMetrics(): void {
        this.eventMetrics = {
            totalEmitted: 0,
            totalSubscriptions: 0,
            legacyEvents: 0,
            reactiveEvents: 0,
        };
    }

    /**
     * Configure event manager options
     */
    configure(options: Partial<UnifiedEventManagerOptions>): void {
        this.options = { ...this.options, ...options };
    }

    /**
     * Dispose and clean up all resources
     */
    dispose(): void {
        // Clean up all reactive subscriptions
        this.subscriptionManager.dispose();

        // Clear all event streams
        this.eventStreams.clear();
        this.streamSubscriberCounts.clear();

        // Clear event history
        this.eventHistory = [];

        // Reset metrics
        this.resetMetrics();
    }

    // ===== PRIVATE UNIFIED METHODS =====

    /**
     * Get or create event stream (unified implementation)
     */
    private getOrCreateEventStream(eventType: string): Stream<SagaEvent<any>> {
        if (!this.eventStreams.has(eventType)) {
            this.eventStreams.set(eventType, new Stream<SagaEvent<any>>());
            this.streamSubscriberCounts.set(eventType, 0);
        }
        return this.eventStreams.get(eventType)!;
    }

    /**
     * Unified event emission - handles both legacy and reactive events
     */
    private emitUnified<TPayload>(event: SagaEvent<TPayload>): void {
        // Track event history for debugging
        if (this.options.debugMode) {
            this.addToHistory({ timestamp: Date.now(), event });
        }

        // Emit to specific event type stream
        const typeStream = this.getOrCreateEventStream(event.type);
        typeStream.next(event);

        // Emit to "all events" stream
        const allEventsStream = this.getOrCreateEventStream('*');
        allEventsStream.next(event);
    }

    /**
     * Type-safe event checking
     */
    private isEventOfType<
        T extends AnySagaEvent['type'],
        TPayload = unknown
    >(event: SagaEvent<any>, eventType: T): event is SagaEvent<TPayload> {
        return event.type === eventType;
    }

    /**
     * Add event to history with size management
     */
    private addToHistory(entry: { timestamp: number; event: SagaEvent<any> }): void {
        this.eventHistory.push(entry);

        // Maintain history size limit
        if (this.eventHistory.length > this.options.maxEventHistory) {
            this.eventHistory.shift();
        }
    }
}

// ===== MIGRATION UTILITIES =====

/**
 * Utility for migrating from dual event system to unified
 */
export class EventSystemMigrator {
    /**
     * Migrate legacy event manager to unified system
     */
    static migrate(
        legacyEventManager: any,
        options?: UnifiedEventManagerOptions
    ): UnifiedEventManager {
        const unified = new UnifiedEventManager(options);

        // Transfer event history if available
        if (legacyEventManager.getEventHistory) {
            const history = legacyEventManager.getEventHistory();
            for (const entry of history) {
                if (entry.event && typeof entry.event === 'object') {
                    // Already in SagaEvent format
                    unified.emitSagaEvent(entry.event);
                }
            }
        }

        return unified;
    }

    /**
     * Create compatibility wrapper for existing code
     */
    static createCompatibilityWrapper(
        unifiedManager: UnifiedEventManager
    ): {
        on: typeof unifiedManager.on;
        emit: typeof unifiedManager.emit;
        onSagaEvent: typeof unifiedManager.onSagaEvent;
        emitSagaEvent: typeof unifiedManager.emitSagaEvent;
        dispose: typeof unifiedManager.dispose;
    } {
        return {
            on: unifiedManager.on.bind(unifiedManager),
            emit: unifiedManager.emit.bind(unifiedManager),
            onSagaEvent: unifiedManager.onSagaEvent.bind(unifiedManager),
            emitSagaEvent: unifiedManager.emitSagaEvent.bind(unifiedManager),
            dispose: unifiedManager.dispose.bind(unifiedManager)
        };
    }
}