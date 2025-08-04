/**
 * Focused event management for Saga system
 * Now uses unified event system internally for better performance and consistency
 */

import type {
    SagaEventListener,
    AnySagaEventListener,
    AnySagaEvent,
    TypedEventListener,
    SagaEvent
} from '../types';
import { Stream } from '../statekit';
import { UnifiedEventManager, type UnifiedEventManagerOptions } from './UnifiedEventManager';

export interface SagaEventManagerOptions extends UnifiedEventManagerOptions {
    // Extends unified options for backward compatibility
}

/**
 * Manages all event-related functionality for the Saga system
 * Now uses unified event system internally for improved performance and consistency
 */
export class SagaEventManager {
    private unifiedManager: UnifiedEventManager;

    constructor(options: SagaEventManagerOptions = {}) {
        // Convert options and delegate to unified manager
        this.unifiedManager = new UnifiedEventManager({
            enableLegacyCompatibility: true,
            maxEventHistory: 1000,
            debugMode: false,
            ...options
        });
    }

    // Legacy adapters removed: on/emit

    // ===== REACTIVE SAGA EVENT API =====

    /**
     * Subscribe to specific typed saga events
     */
    onSagaEvent<T extends AnySagaEvent['type'], TPayload = unknown>(
        eventType: T,
        callback: SagaEventListener<T, TPayload>
    ): () => void {
        return this.unifiedManager.onSagaEvent(eventType, callback);
    }

    /**
     * Subscribe to all saga events
     */
    onAnyEvent(callback: AnySagaEventListener): () => void {
        return this.unifiedManager.onAnyEvent(callback);
    }

    /**
     * Emit a saga event using unified reactive streams
     */
    emitSagaEvent<TPayload = unknown>(event: SagaEvent<TPayload>): void {
        this.unifiedManager.emitSagaEvent(event);
    }

    /**
     * Subscribe to specific typed events with full type inference
     */
    onTypedEvent<TEvent extends AnySagaEvent>(
        eventType: TEvent['type'],
        callback: TypedEventListener<TEvent>
    ): () => void {
        return this.unifiedManager.onTypedEvent(eventType, callback);
    }

    // ===== REACTIVE STREAM ACCESS =====

    /**
     * Get reactive stream for specific event type
     */
    getEventStream<T = unknown>(eventType: string): Stream<SagaEvent<T>> {
        return this.unifiedManager.getEventStream<T>(eventType);
    }

    /**
     * Get all active event stream names
     */
    getActiveStreams(): string[] {
        return this.unifiedManager.getActiveStreams();
    }

    // ===== UTILITY & MANAGEMENT =====

    /**
     * Get event statistics
     */
    getEventStats() {
        return this.unifiedManager.getEventStats();
    }

    /**
     * Clear event history
     */
    clearEventHistory(): void {
        this.unifiedManager.clearEventHistory();
    }

    /**
     * Get event history (for debugging)
     */
    getEventHistory() {
        return this.unifiedManager.getEventHistory();
    }

    /**
     * Configure event manager options
     */
    configure(options: Partial<SagaEventManagerOptions>): void {
        this.unifiedManager.configure(options);
    }

    /**
     * Dispose and clean up all resources
     */
    dispose(): void {
        this.unifiedManager.dispose();
    }
}