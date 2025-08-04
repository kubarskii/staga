/**
 * Simple test for ReactiveStateProxy basic functionality
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SagaManager } from '../SagaManager';

interface SimpleState {
    counter: number;
    name: string;
}

describe('ReactiveStateProxy - Simple Tests', () => {
    let sagaManager: SagaManager<SimpleState>;
    let stateUpdates: SimpleState[];

    beforeEach(() => {
        stateUpdates = [];

        sagaManager = SagaManager.create({
            counter: 0,
            name: 'initial'
        });

        // Subscribe to state changes through StateManager
        sagaManager.stateManager.subscribe((newState) => {
            stateUpdates.push({ ...newState }); // Shallow clone to avoid proxy issues
        });
    });

    afterEach(() => {
        if (sagaManager) {
            sagaManager.dispose();
        }
    });

    it('should work with basic reactive proxy', async () => {
        // Create a simple transaction with reactive proxy enabled
        const transaction = sagaManager
            .createTransaction<{ increment: number }>('simple-test', {
                reactiveProxy: {
                    enableDeepReactivity: false, // Disable deep reactivity to avoid complexity
                    debounceMs: 0,
                    enableLogging: false
                }
            })
            .addStep('increment-counter', async (state, payload) => {
                state.counter += payload.increment; // This should trigger immediate reactive update

                await new Promise(resolve => setTimeout(resolve, 10)); // Small delay

                state.name = 'updated'; // Another reactive update
            });

        await transaction.run({ increment: 5 });

        // Should have captured reactive updates during step execution
        expect(stateUpdates.length).toBeGreaterThan(1);

        // Final state should be correct
        const finalState = stateUpdates[stateUpdates.length - 1];
        expect(finalState.counter).toBe(5);
        expect(finalState.name).toBe('updated');
    });

    it('should provide reactive updates even without explicit proxy options', async () => {
        // Create transaction without reactive proxy options (will use defaults)
        const transaction = sagaManager
            .createTransaction<{ increment: number }>('baseline-test')
            .addStep('increment-counter', async (state, payload) => {
                state.counter += payload.increment;
                state.name = 'baseline';
            });

        const initialUpdateCount = stateUpdates.length;
        await transaction.run({ increment: 3 });

        // Should have multiple updates thanks to default reactive proxy
        expect(stateUpdates.length).toBeGreaterThan(initialUpdateCount + 1);

        const finalState = stateUpdates[stateUpdates.length - 1];
        expect(finalState.counter).toBe(3);
        expect(finalState.name).toBe('baseline');
    });
});