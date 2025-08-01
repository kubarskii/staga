/**
 * Event replay system for debugging and testing
 * Allows recording, saving, and replaying event sequences
 */

import type { SagaEvent } from './types';

// ===== EVENT RECORDING TYPES =====

export interface RecordedEvent<TPayload = unknown> {
    // Base event properties
    type: string;
    payload: TPayload;
    timestamp: number;

    // Extended properties for recording
    id: string;
    sequenceNumber: number;
    sessionId: string;
    metadata: {
        userAgent?: string;
        url?: string;
        userId?: string;
        tags: string[];
        [key: string]: unknown;
    };

    // Additional event-specific properties (from SagaEvent union)
    transactionName?: string;
    stepName?: string;
    error?: Error;
    duration?: number;
    attempt?: number;
    lastError?: Error;
}

export interface EventSession {
    id: string;
    startTime: number;
    endTime?: number;
    totalEvents: number;
    metadata: {
        description?: string;
        version?: string;
        environment?: string;
        [key: string]: unknown;
    };
}

export interface ReplayOptions {
    speed?: number; // 1.0 = normal speed, 2.0 = 2x speed, 0.5 = half speed
    startFromEvent?: number;
    endAtEvent?: number;
    skipEventTypes?: string[];
    onlyEventTypes?: string[];
    pauseOnErrors?: boolean;
    realTimeMode?: boolean; // Preserve original timing
}

export interface ReplayState {
    isReplaying: boolean;
    currentEvent: number;
    totalEvents: number;
    startTime: number;
    speed: number;
    isPaused: boolean;
}

// ===== EVENT FILTER =====

export interface EventFilter {
    eventTypes?: string[];
    timeRange?: { start: number; end: number };
    metadata?: Record<string, unknown>;
    payloadFilter?: (payload: unknown) => boolean;
}

// ===== EVENT RECORDER =====

export class EventRecorder<TPayload = unknown> {
    private isRecording = false;
    private currentSession: EventSession | null = null;
    private recordedEvents: RecordedEvent<TPayload>[] = [];
    private eventListeners: Set<(event: RecordedEvent<TPayload>) => void> = new Set();
    private sequenceNumber = 0;

    /**
     * Start recording events
     */
    startRecording(sessionMetadata?: Partial<EventSession['metadata']>): string {
        const sessionId = this.generateSessionId();

        this.currentSession = {
            id: sessionId,
            startTime: Date.now(),
            totalEvents: 0,
            metadata: {
                description: `Recording session ${sessionId}`,
                version: '1.0.0',
                environment: typeof window !== 'undefined' ? 'browser' : 'node',
                ...sessionMetadata
            }
        };

        this.isRecording = true;
        this.recordedEvents = [];
        this.sequenceNumber = 0;

        return sessionId;
    }

    /**
     * Stop recording events
     */
    stopRecording(): EventSession | null {
        if (!this.isRecording || !this.currentSession) {
            return null;
        }

        this.isRecording = false;
        this.currentSession.endTime = Date.now();
        this.currentSession.totalEvents = this.recordedEvents.length;

        const session = this.currentSession;
        this.currentSession = null;

        return session;
    }

    /**
     * Check if currently recording
     */
    getIsRecording(): boolean {
        return this.isRecording;
    }

    /**
     * Record an event
     */
    recordEvent(event: SagaEvent<TPayload>, metadata?: Partial<RecordedEvent<TPayload>['metadata']>): void {
        if (!this.isRecording || !this.currentSession) {
            return;
        }

        const recordedEvent: RecordedEvent<TPayload> = {
            ...event,
            id: this.generateEventId(),
            sequenceNumber: this.sequenceNumber++,
            sessionId: this.currentSession.id,
            metadata: {
                tags: [],
                userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'Node.js',
                url: typeof window !== 'undefined' ? window.location.href : 'N/A',
                ...metadata
            }
        };

        this.recordedEvents.push(recordedEvent);
        this.notifyListeners(recordedEvent);
    }

    /**
     * Get recorded events
     */
    getRecordedEvents(filter?: EventFilter): RecordedEvent<TPayload>[] {
        if (!filter) {
            return [...this.recordedEvents];
        }

        return this.recordedEvents.filter(event => {
            // Filter by event types
            if (filter.eventTypes && !filter.eventTypes.includes(event.type)) {
                return false;
            }

            // Filter by time range
            if (filter.timeRange) {
                if (event.timestamp < filter.timeRange.start || event.timestamp > filter.timeRange.end) {
                    return false;
                }
            }

            // Filter by metadata
            if (filter.metadata) {
                for (const [key, value] of Object.entries(filter.metadata)) {
                    if (event.metadata[key] !== value) {
                        return false;
                    }
                }
            }

            // Filter by payload
            if (filter.payloadFilter && !filter.payloadFilter(event.payload)) {
                return false;
            }

            return true;
        });
    }

    /**
     * Subscribe to recorded events
     */
    onEventRecorded(listener: (event: RecordedEvent<TPayload>) => void): () => void {
        this.eventListeners.add(listener);
        return () => this.eventListeners.delete(listener);
    }

    /**
     * Export events to JSON
     */
    exportEvents(filter?: EventFilter): string {
        const events = this.getRecordedEvents(filter);
        return JSON.stringify({
            session: this.currentSession,
            events,
            exportedAt: Date.now()
        }, null, 2);
    }

    /**
     * Import events from JSON
     */
    importEvents(jsonData: string): { session: EventSession; events: RecordedEvent<TPayload>[] } {
        const data = JSON.parse(jsonData);
        return {
            session: data.session,
            events: data.events
        };
    }

    /**
     * Get recording statistics
     */
    getStats(): {
        isRecording: boolean;
        sessionId: string | null;
        totalEvents: number;
        eventsByType: Record<string, number>;
        recordingDuration: number;
    } {
        const eventsByType: Record<string, number> = {};

        for (const event of this.recordedEvents) {
            eventsByType[event.type] = (eventsByType[event.type] || 0) + 1;
        }

        return {
            isRecording: this.isRecording,
            sessionId: this.currentSession?.id || null,
            totalEvents: this.recordedEvents.length,
            eventsByType,
            recordingDuration: this.currentSession
                ? Date.now() - this.currentSession.startTime
                : 0
        };
    }

    private generateSessionId(): string {
        return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    private generateEventId(): string {
        return `event_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    private notifyListeners(event: RecordedEvent<TPayload>): void {
        for (const listener of this.eventListeners) {
            try {
                listener(event);
            } catch (error) {
                console.error('Event recorder listener error:', error);
            }
        }
    }
}

// ===== EVENT REPLAYER =====

export class EventReplayer<TPayload = unknown> {
    private events: RecordedEvent<TPayload>[] = [];
    private replayState: ReplayState = {
        isReplaying: false,
        currentEvent: 0,
        totalEvents: 0,
        startTime: 0,
        speed: 1.0,
        isPaused: false
    };
    private replayListeners: Set<(state: ReplayState) => void> = new Set();
    private eventHandlers: Map<string, (event: RecordedEvent<TPayload>) => void | Promise<void>> = new Map();
    private timeoutId: NodeJS.Timeout | null = null;

    /**
     * Load events for replay
     */
    loadEvents(events: RecordedEvent<TPayload>[]): void {
        this.events = [...events].sort((a, b) => a.sequenceNumber - b.sequenceNumber);
        this.replayState.totalEvents = this.events.length;
        this.replayState.currentEvent = 0;
    }

    /**
     * Start replaying events
     */
    async startReplay(options: ReplayOptions = {}): Promise<void> {
        if (this.replayState.isReplaying) {
            throw new Error('Replay already in progress');
        }

        if (this.events.length === 0) {
            throw new Error('No events loaded for replay');
        }

        this.replayState = {
            isReplaying: true,
            currentEvent: options.startFromEvent || 0,
            totalEvents: Math.min(options.endAtEvent || this.events.length, this.events.length),
            startTime: Date.now(),
            speed: options.speed || 1.0,
            isPaused: false
        };

        this.notifyStateListeners();

        try {
            await this.executeReplay(options);
        } finally {
            this.replayState.isReplaying = false;
            this.notifyStateListeners();
        }
    }

    /**
     * Pause replay
     */
    pause(): void {
        if (this.replayState.isReplaying && !this.replayState.isPaused) {
            this.replayState.isPaused = true;
            if (this.timeoutId) {
                clearTimeout(this.timeoutId);
                this.timeoutId = null;
            }
            this.notifyStateListeners();
        }
    }

    /**
     * Resume replay
     */
    resume(): void {
        if (this.replayState.isReplaying && this.replayState.isPaused) {
            this.replayState.isPaused = false;
            this.notifyStateListeners();
            // Continue from where we left off
            this.scheduleNextEvent();
        }
    }

    /**
     * Stop replay
     */
    stop(): void {
        if (this.timeoutId) {
            clearTimeout(this.timeoutId);
            this.timeoutId = null;
        }
        this.replayState.isReplaying = false;
        this.replayState.isPaused = false;
        this.notifyStateListeners();
    }

    /**
     * Step through one event
     */
    async stepForward(): Promise<void> {
        if (this.replayState.currentEvent < this.replayState.totalEvents) {
            const event = this.events[this.replayState.currentEvent];
            if (event) {
                await this.executeEvent(event);
                this.replayState.currentEvent++;
                this.notifyStateListeners();
            }
        }
    }

    /**
     * Step back one event (if possible)
     */
    stepBackward(): void {
        if (this.replayState.currentEvent > 0) {
            this.replayState.currentEvent--;
            this.notifyStateListeners();
            // Note: Actual state reversal would require additional state management
            console.warn('Step backward only changes position, does not reverse state');
        }
    }

    /**
     * Jump to specific event
     */
    jumpToEvent(eventIndex: number): void {
        if (eventIndex >= 0 && eventIndex < this.events.length) {
            this.replayState.currentEvent = eventIndex;
            this.notifyStateListeners();
        }
    }

    /**
     * Set replay speed
     */
    setSpeed(speed: number): void {
        if (speed > 0) {
            this.replayState.speed = speed;
            this.notifyStateListeners();
        }
    }

    /**
     * Register event handler
     */
    onEventType(
        eventType: string,
        handler: (event: RecordedEvent<TPayload>) => void | Promise<void>
    ): () => void {
        this.eventHandlers.set(eventType, handler);
        return () => this.eventHandlers.delete(eventType);
    }

    /**
     * Subscribe to replay state changes
     */
    onStateChange(listener: (state: ReplayState) => void): () => void {
        this.replayListeners.add(listener);
        return () => this.replayListeners.delete(listener);
    }

    /**
     * Get current replay state
     */
    getState(): ReplayState {
        return { ...this.replayState };
    }

    /**
     * Get current event
     */
    getCurrentEvent(): RecordedEvent<TPayload> | null {
        const index = this.replayState.currentEvent;
        return index < this.events.length ? (this.events[index] || null) : null;
    }

    /**
     * Export replay session
     */
    exportReplaySession(): string {
        return JSON.stringify({
            events: this.events,
            replayState: this.replayState,
            exportedAt: Date.now()
        }, null, 2);
    }

    private async executeReplay(options: ReplayOptions): Promise<void> {
        const firstEvent = this.events[this.replayState.currentEvent];
        let previousEventTime = firstEvent?.timestamp || Date.now();

        while (this.replayState.currentEvent < this.replayState.totalEvents && this.replayState.isReplaying) {
            if (this.replayState.isPaused) {
                await this.waitForResume();
            }

            const event = this.events[this.replayState.currentEvent];
            if (!event) {
                this.replayState.currentEvent++;
                continue;
            }

            // Skip filtered events
            if (this.shouldSkipEvent(event, options)) {
                this.replayState.currentEvent++;
                continue;
            }

            // Calculate delay for real-time mode
            if (options.realTimeMode && this.replayState.currentEvent > 0) {
                const timeDiff = event.timestamp - previousEventTime;
                const adjustedDelay = timeDiff / this.replayState.speed;
                if (adjustedDelay > 0) {
                    await this.delay(adjustedDelay);
                }
            }

            try {
                await this.executeEvent(event);
            } catch (error) {
                console.error('Error executing event during replay:', error);
                if (options.pauseOnErrors) {
                    this.pause();
                    throw error;
                }
            }

            previousEventTime = event.timestamp;
            this.replayState.currentEvent++;
            this.notifyStateListeners();
        }
    }

    private async executeEvent(event: RecordedEvent<TPayload>): Promise<void> {
        const handler = this.eventHandlers.get(event.type);
        if (handler) {
            await handler(event);
        }
    }

    private shouldSkipEvent(event: RecordedEvent<TPayload>, options: ReplayOptions): boolean {
        if (options.skipEventTypes?.includes(event.type)) {
            return true;
        }

        if (options.onlyEventTypes && !options.onlyEventTypes.includes(event.type)) {
            return true;
        }

        return false;
    }

    private scheduleNextEvent(): void {
        if (!this.replayState.isReplaying || this.replayState.isPaused) {
            return;
        }

        // For non-real-time mode, just execute immediately
        this.timeoutId = setTimeout(() => {
            // This would continue the replay loop
            this.notifyStateListeners();
        }, 0);
    }

    private async waitForResume(): Promise<void> {
        return new Promise<void>((resolve) => {
            const checkResume = () => {
                if (!this.replayState.isPaused) {
                    resolve();
                } else {
                    setTimeout(checkResume, 100);
                }
            };
            checkResume();
        });
    }

    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    private notifyStateListeners(): void {
        for (const listener of this.replayListeners) {
            try {
                listener(this.replayState);
            } catch (error) {
                console.error('Replay state listener error:', error);
            }
        }
    }
}

// ===== EVENT REPLAY MANAGER =====

export class EventReplayManager<TPayload = unknown> {
    private recorder: EventRecorder<TPayload>;
    private replayer: EventReplayer<TPayload>;

    constructor() {
        this.recorder = new EventRecorder<TPayload>();
        this.replayer = new EventReplayer<TPayload>();
    }

    /**
     * Get the event recorder
     */
    getRecorder(): EventRecorder<TPayload> {
        return this.recorder;
    }

    /**
     * Get the event replayer
     */
    getReplayer(): EventReplayer<TPayload> {
        return this.replayer;
    }

    /**
     * Create a test scenario from recorded events
     */
    createTestScenario(
        events: RecordedEvent<TPayload>[],
        name: string,
        expectedOutcomes?: Record<string, unknown>
    ): {
        name: string;
        events: RecordedEvent<TPayload>[];
        expectedOutcomes: Record<string, unknown> | undefined;
        execute: (replayer: EventReplayer<TPayload>) => Promise<void>;
    } {
        return {
            name,
            events,
            expectedOutcomes: expectedOutcomes || undefined,
            execute: async (replayer: EventReplayer<TPayload>) => {
                replayer.loadEvents(events);
                await replayer.startReplay();
            }
        };
    }

    /**
     * Analyze events for patterns
     */
    analyzeEvents(events: RecordedEvent<TPayload>[]): {
        totalEvents: number;
        eventTypes: Record<string, number>;
        averageTimeBetweenEvents: number;
        sessionDuration: number;
        errorRate: number;
    } {
        const eventTypes: Record<string, number> = {};
        let totalTimeDiffs = 0;
        let errorCount = 0;

        for (let i = 0; i < events.length; i++) {
            const event = events[i];
            if (!event) continue;

            eventTypes[event.type] = (eventTypes[event.type] || 0) + 1;

            if (event.type.includes('fail') || event.type.includes('error')) {
                errorCount++;
            }

            if (i > 0) {
                const prevEvent = events[i - 1];
                if (prevEvent) {
                    totalTimeDiffs += event.timestamp - prevEvent.timestamp;
                }
            }
        }

        const sessionDuration = events.length > 0
            ? (events[events.length - 1]?.timestamp || 0) - (events[0]?.timestamp || 0)
            : 0;

        return {
            totalEvents: events.length,
            eventTypes,
            averageTimeBetweenEvents: events.length > 1 ? totalTimeDiffs / (events.length - 1) : 0,
            sessionDuration,
            errorRate: events.length > 0 ? errorCount / events.length : 0
        };
    }
}