/**
 * Simple test for the new computed functionality
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SagaManager } from '../SagaManager';

interface TestState {
    a: number;
    b: number;
    items: string[];
}

describe('Simplified Computed Functionality', () => {
    let saga: SagaManager<TestState>;

    beforeEach(() => {
        saga = SagaManager.create({
            a: 1,
            b: 2,
            items: ['item1', 'item2']
        });
    });

    afterEach(() => {
        saga.dispose();
    });

    it('should compute from a single source', () => {
        const a$ = saga.selectProperty('a');
        const doubled$ = saga.computed(a$, (a) => a * 2);

        expect(doubled$.value).toBe(2);

        const values: number[] = [];
        doubled$.subscribe(value => values.push(value));

        // Change the source value
        const currentState = saga.getState();
        saga.stateManager.setState({ ...currentState, a: 5 });

        expect(doubled$.value).toBe(10);
        expect(values).toEqual([2, 10]);
    });

    it('should compute from two sources', () => {
        const a$ = saga.selectProperty('a');
        const b$ = saga.selectProperty('b');
        const sum$ = saga.computed(a$, b$, (a, b) => a + b);

        expect(sum$.value).toBe(3);

        const values: number[] = [];
        sum$.subscribe(value => values.push(value));

        // Change one source
        let currentState = saga.getState();
        saga.stateManager.setState({ ...currentState, a: 10 });
        expect(sum$.value).toBe(12);

        // Change the other source
        currentState = saga.getState();
        saga.stateManager.setState({ ...currentState, b: 5 });
        expect(sum$.value).toBe(15);

        expect(values).toEqual([3, 12, 15]);
    });

    it('should work with complex computed values like cart totals', () => {
        const items$ = saga.selectProperty('items');
        const itemCount$ = saga.computed(items$, (items) => items.length);

        expect(itemCount$.value).toBe(2);

        // Add an item
        const currentState = saga.getState();
        saga.stateManager.setState({ 
            ...currentState, 
            items: [...currentState.items, 'item3'] 
        });

        expect(itemCount$.value).toBe(3);
    });
});
