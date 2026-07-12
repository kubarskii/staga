/**
 * Regression tests: reactive selectors created via select() must stay in sync
 * with undo(), redo() and rollbackToLastSnapshot().
 *
 * Previously undo() and rollbackToLastSnapshot() mutated the internal state
 * directly (bypassing the statekit store), so select()-based signals kept
 * reporting stale values while redo() — which routed through the store —
 * worked correctly. All three now route through the store.
 */

import { describe, it, expect } from 'vitest';
import { StateManager } from '../StateManager';

interface TestState {
    counter: number;
    nested: { value: number };
}

describe('Reactive selector sync across undo/redo/rollback', () => {
    const initial = (): TestState => ({ counter: 0, nested: { value: 0 } });

    it('select() reflects undo()', () => {
        const sm = new StateManager<TestState>(initial());
        const counter$ = sm.select(s => s.counter);
        const seen: number[] = [];
        counter$.subscribe(v => seen.push(v));

        sm.setState({ counter: 5, nested: { value: 0 } });
        expect(counter$.value).toBe(5);

        sm.undo();
        expect(sm.getState().counter).toBe(0);
        expect(counter$.value).toBe(0);
        expect(seen).toEqual([0, 5, 0]);
    });

    it('select() reflects redo()', () => {
        const sm = new StateManager<TestState>(initial());
        const counter$ = sm.select(s => s.counter);

        sm.setState({ counter: 7, nested: { value: 0 } });
        sm.undo();
        expect(counter$.value).toBe(0);

        sm.redo();
        expect(sm.getState().counter).toBe(7);
        expect(counter$.value).toBe(7);
    });

    it('select() reflects rollbackToLastSnapshot()', () => {
        const sm = new StateManager<TestState>(initial());
        sm.createSnapshot();
        sm.setState({ counter: 9, nested: { value: 3 } });

        const counter$ = sm.select(s => s.counter);
        const nested$ = sm.select(s => s.nested.value);
        expect(counter$.value).toBe(9);
        expect(nested$.value).toBe(3);

        sm.rollbackToLastSnapshot();
        expect(sm.getState().counter).toBe(0);
        expect(counter$.value).toBe(0);
        expect(nested$.value).toBe(0);
    });

    it('keeps subscribe() and select() consistent after undo', () => {
        const sm = new StateManager<TestState>(initial());
        const subValues: number[] = [];
        sm.subscribe(s => subValues.push(s.counter));
        const counter$ = sm.select(s => s.counter);

        sm.setState({ counter: 1, nested: { value: 0 } });
        sm.setState({ counter: 2, nested: { value: 0 } });
        sm.undo();

        // Both views agree on the current value
        expect(counter$.value).toBe(sm.getState().counter);
        expect(subValues[subValues.length - 1]).toBe(sm.getState().counter);
        expect(counter$.value).toBe(1);
    });
});
