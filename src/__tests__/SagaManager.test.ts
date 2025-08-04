import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SagaManager } from '../SagaManager';
import type { AnySagaEvent, SagaEvent } from '../types';

interface TestState {
    count: number;
    items: string[];
}

describe('SagaManager', () => {
    let saga: SagaManager<TestState>;
    const initialState: TestState = { count: 0, items: [] };

    beforeEach(() => {
        saga = SagaManager.create(initialState);
    });

    afterEach(() => {
        saga.dispose();
    });

    it('should create with initial state', () => {
        expect(saga.getState()).toEqual(initialState);
    });

    it('should create transactions', () => {
        const transaction = saga.createTransaction('test');
        expect(transaction.name).toBe('test');
    });

    it('should emit and listen to events', () => {
        const listener = vi.fn();
        saga.onSagaEvent('test:event', (event) => listener(event.payload));

        saga.emitSagaEvent({ type: 'test:event', payload: ['arg1', 'arg2'], timestamp: Date.now() });

        expect(listener).toHaveBeenCalledWith(['arg1', 'arg2']);
    });

    it('should remove legacy event listeners', () => {
        const listener = vi.fn();
        const off = saga.onSagaEvent('test:event', (event) => listener(event.payload));

        off();
        saga.emitSagaEvent({ type: 'test:event', payload: 'arg1', timestamp: Date.now() });

        expect(listener).not.toHaveBeenCalled();
    });

    it('should remove saga event listeners', () => {
        const listener = vi.fn<
            (event: Extract<
                SagaEvent<unknown>,
                { type: 'transaction:start' }
            >) => void
        >();
        const off = saga.onSagaEvent('transaction:start', listener as any);

        off();
        saga.emitSagaEvent({
            type: 'transaction:start',
            transactionName: 'tx',
            payload: null,
            timestamp: Date.now()
        });

        expect(listener).not.toHaveBeenCalled();
    });

    it('should remove any-event listeners', () => {
        const listener = vi.fn<(event: AnySagaEvent) => void>();
        const off = saga.onAnyEvent(listener);

        off();
        saga.emitSagaEvent({
            type: 'transaction:start',
            transactionName: 'tx',
            payload: null,
            timestamp: Date.now()
        });

        expect(listener).not.toHaveBeenCalled();
    });

    it('should support middleware', () => {
        const middleware = vi.fn(async (ctx, next) => {
            await next();
        });

        saga.use(middleware);

        // Middleware will be tested through transaction execution
        expect(saga['middleware']).toContain(middleware);
    });

    it('should support undo/redo through state manager', () => {
        // This is delegated to StateManager, so we just verify the methods exist
        expect(typeof saga.undo).toBe('function');
        expect(typeof saga.redo).toBe('function');
    });

    it('should provide onEventStream for specific event types', () => {
        const eventStream = saga.onEventStream('test:custom');
        expect(eventStream).toBeDefined();
        expect(typeof eventStream.subscribe).toBe('function');

        // Test that we receive events on the stream
        const receivedEvents: any[] = [];
        eventStream.subscribe(event => receivedEvents.push(event));

        // Emit a saga event
        saga.emitSagaEvent({
            type: 'test:custom',
            payload: { message: 'hello' },
            timestamp: Date.now()
        });

        expect(receivedEvents).toHaveLength(1);
        expect(receivedEvents[0].type).toBe('test:custom');
        expect(receivedEvents[0].payload.message).toBe('hello');
    });

    it('should provide onAllEventsStream for all events', () => {
        const allEventsStream = saga.onAllEventsStream();
        expect(allEventsStream).toBeDefined();
        expect(typeof allEventsStream.subscribe).toBe('function');

        // Test that we receive all events on the stream
        const receivedEvents: any[] = [];
        allEventsStream.subscribe(event => receivedEvents.push(event));

        // Emit multiple different saga events
        saga.emitSagaEvent({
            type: 'test:event1',
            payload: { data: 'first' },
            timestamp: Date.now()
        });

        saga.emitSagaEvent({
            type: 'test:event2',
            payload: { data: 'second' },
            timestamp: Date.now()
        });

        expect(receivedEvents).toHaveLength(2);
        expect(receivedEvents[0].type).toBe('test:event1');
        expect(receivedEvents[1].type).toBe('test:event2');
    });
});