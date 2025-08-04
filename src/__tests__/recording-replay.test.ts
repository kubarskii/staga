/**
 * Test for event recording and replay functionality
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SagaManager } from '../SagaManager';

interface TestState {
    counter: number;
    items: string[];
    user?: { name: string; id: number };
}

describe('Event Recording and Replay', () => {
    let saga: SagaManager<TestState>;

    beforeEach(() => {
        saga = SagaManager.create({
            counter: 0,
            items: [],
            user: undefined
        });
    });

    afterEach(async () => {
        await saga.dispose();
    });

    it('should record state changes when recording is enabled', () => {
        saga.startRecording();

        // Make some state changes
        const state1 = saga.getState();
        saga.stateManager.setState({ ...state1, counter: 5 });

        const state2 = saga.getState();
        saga.stateManager.setState({ ...state2, items: ['item1', 'item2'] });

        const state3 = saga.getState();
        saga.stateManager.setState({ ...state3, user: { name: 'Alice', id: 1 } });

        saga.stopRecording();

        const events = saga.getRecordedEvents();

        // Should have recorded state changes
        expect(events.length).toBeGreaterThan(0);

        // Should have state:change events
        const stateChangeEvents = events.filter(e => e.type === 'state:change');
        expect(stateChangeEvents.length).toBe(3);

        // Check that snapshots are preserved
        expect(stateChangeEvents[0].stateSnapshot.counter).toBe(5);
        expect(stateChangeEvents[1].stateSnapshot.items).toEqual(['item1', 'item2']);
        expect(stateChangeEvents[2].stateSnapshot.user).toEqual({ name: 'Alice', id: 1 });
    });

    it('should not record when recording is disabled', () => {
        // Make changes without recording
        const state = saga.getState();
        saga.stateManager.setState({ ...state, counter: 10 });

        const events = saga.getRecordedEvents();
        expect(events.length).toBe(0);
    });

    it('should replay recorded events', async () => {
        saga.startRecording();

        // Record some changes
        let currentState = saga.getState();
        saga.stateManager.setState({ ...currentState, counter: 5 });

        currentState = saga.getState();
        saga.stateManager.setState({ ...currentState, items: ['test'] });

        saga.stopRecording();

        // Reset state
        saga.stateManager.setState({ counter: 0, items: [], user: undefined });
        expect(saga.getState().counter).toBe(0);
        expect(saga.getState().items).toEqual([]);

        // Replay events
        await saga.startReplay();

        // State should be restored
        expect(saga.getState().counter).toBe(5);
        expect(saga.getState().items).toEqual(['test']);
    });

    it('should record and replay transaction events', async () => {
        saga.startRecording();

        // Create and run a transaction
        const incrementTransaction = saga
            .createTransaction('increment')
            .addStep('increment', (state) => {
                state.counter++;
            });

        await incrementTransaction.run();

        saga.stopRecording();

        const events = saga.getRecordedEvents();

        // Should have transaction-related events
        const transactionEvents = events.filter(e => e.type.startsWith('event:'));
        expect(transactionEvents.length).toBeGreaterThan(0);

        // Should include transaction success event
        const successEvents = transactionEvents.filter(e => e.type === 'event:transaction:success');
        expect(successEvents.length).toBe(1);
    });

    it('should clear recorded events', () => {
        saga.startRecording();

        const state = saga.getState();
        saga.stateManager.setState({ ...state, counter: 1 });

        saga.stopRecording();

        expect(saga.getRecordedEvents().length).toBeGreaterThan(0);

        saga.clearRecordedEvents();
        expect(saga.getRecordedEvents().length).toBe(0);
    });

    it('should load and replay external events', async () => {
        const externalEvents = [
            {
                type: 'state:change',
                payload: { counter: 42, items: ['external'], user: undefined },
                timestamp: Date.now(),
                stateSnapshot: { counter: 42, items: ['external'], user: undefined }
            }
        ];

        await saga.replayEvents(externalEvents);

        expect(saga.getState().counter).toBe(42);
        expect(saga.getState().items).toEqual(['external']);
    });

    it('should not record during replay to avoid infinite loops', async () => {
        saga.startRecording();

        // Record some changes
        const state = saga.getState();
        saga.stateManager.setState({ ...state, counter: 5 });

        saga.stopRecording();

        const originalEvents = saga.getRecordedEvents();

        // Start recording again and replay the original events
        saga.startRecording();
        await saga.replayEvents(originalEvents);
        saga.stopRecording();

        // Should not have recorded additional events during replay
        // Only the original events should be present (since replayEvents replaces them)
        const eventsAfterReplay = saga.getRecordedEvents().length;
        expect(eventsAfterReplay).toBe(originalEvents.length);
    });

    it('should handle empty replay gracefully', async () => {
        // Should not throw when replaying with no events
        await expect(saga.startReplay()).resolves.toBeUndefined();

        // Clear events and try again
        saga.clearRecordedEvents();
        await expect(saga.startReplay()).resolves.toBeUndefined();
    });

    it('should preserve event timestamps and metadata', () => {
        saga.startRecording();

        const beforeTime = Date.now();
        const state = saga.getState();
        saga.stateManager.setState({ ...state, counter: 1 });
        const afterTime = Date.now();

        saga.stopRecording();

        const events = saga.getRecordedEvents();
        expect(events.length).toBeGreaterThan(0);

        const event = events[0];
        expect(event.timestamp).toBeGreaterThanOrEqual(beforeTime);
        expect(event.timestamp).toBeLessThanOrEqual(afterTime);
        expect(event.type).toBe('state:change');
        expect(event.stateSnapshot).toEqual({ counter: 1, items: [], user: undefined });
    });
});
