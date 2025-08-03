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
        saga.on('test:event', listener);

        saga.emit('test:event', 'arg1', 'arg2');

        expect(listener).toHaveBeenCalledWith('arg1', 'arg2');
    });

    it('should remove legacy event listeners', () => {
        const listener = vi.fn();
        const off = saga.on('test:event', listener);

        off();
        saga.emit('test:event', 'arg1');

        expect(listener).not.toHaveBeenCalled();
    });

    it('should remove saga event listeners', () => {
        const listener = vi.fn<
            (event: Extract<
                SagaEvent<unknown>,
                { type: 'transaction:start' }
            >) => void
        >();
        const off = saga.onEvent('transaction:start', listener);

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
});