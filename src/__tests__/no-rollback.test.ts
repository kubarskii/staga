/**
 * Tests for the disableAutoRollback feature
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SagaManager } from '../SagaManager';

interface TestState {
    counter: number;
    items: string[];
    lastError?: string;
}

describe('Disable Auto Rollback Feature', () => {
    let saga: SagaManager<TestState>;

    beforeEach(() => {
        saga = SagaManager.create({
            counter: 0,
            items: [],
            lastError: undefined
        });
    });

    afterEach(async () => {
        await saga.dispose();
    });

    it('should rollback automatically by default', async () => {
        const transaction = saga
            .createTransaction('default-rollback')
            .addStep('increment', (state) => {
                state.counter++;
            })
            .addStep('fail', () => {
                throw new Error('Test failure');
            });

        expect(saga.getState().counter).toBe(0);

        try {
            await transaction.run();
        } catch (error) {
            expect(error.message).toContain('failed and rolled back');
        }

        // State should be rolled back to initial value
        expect(saga.getState().counter).toBe(0);
    });

    it('should not rollback when disableAutoRollback is true via configure', async () => {
        const transaction = saga
            .createTransaction('no-rollback')
            .configure({ disableAutoRollback: true })
            .addStep('increment', (state) => {
                state.counter = 5;
            })
            .addStep('add-item', (state) => {
                state.items.push('test-item');
            })
            .addStep('fail', () => {
                throw new Error('Test failure');
            });

        expect(saga.getState().counter).toBe(0);
        expect(saga.getState().items).toEqual([]);

        try {
            await transaction.run();
        } catch (error) {
            expect(error.message).toContain('failed (rollback disabled)');
        }

        // State should NOT be rolled back - changes should persist
        expect(saga.getState().counter).toBe(5);
        expect(saga.getState().items).toEqual(['test-item']);
    });

    it('should not rollback when disableAutoRollback is true via transaction options', async () => {
        const transaction = saga
            .createTransaction('no-rollback', { 
                transaction: { disableAutoRollback: true } 
            })
            .addStep('increment', (state) => {
                state.counter = 10;
            })
            .addStep('fail', () => {
                throw new Error('Test failure');
            });

        expect(saga.getState().counter).toBe(0);

        try {
            await transaction.run();
        } catch (error) {
            expect(error.message).toContain('failed (rollback disabled)');
        }

        // State should NOT be rolled back
        expect(saga.getState().counter).toBe(10);
    });

    it('should allow manual rollback when auto-rollback is disabled', async () => {
        const transaction = saga
            .createTypedTransaction<void>('manual-rollback', { 
                transaction: { disableAutoRollback: true } 
            })
            .addStep('increment', (state) => {
                state.counter = 15;
            }, (state) => {
                // Compensation function
                state.counter = 0;
            })
            .addStep('add-items', (state) => {
                state.items.push('item1', 'item2');
            }, (state) => {
                // Compensation function
                state.items = [];
            });

        expect(saga.getState().counter).toBe(0);
        expect(saga.getState().items).toEqual([]);

        // Run transaction partially (it should complete successfully)
        await transaction.run();

        // State should be changed
        expect(saga.getState().counter).toBe(15);
        expect(saga.getState().items).toEqual(['item1', 'item2']);

        // Manually rollback
        await transaction.rollback();

        // State should be rolled back via compensation functions
        expect(saga.getState().counter).toBe(0);
        expect(saga.getState().items).toEqual([]);
    });

    it('should throw error when trying manual rollback with auto-rollback enabled', async () => {
        const transaction = saga
            .createVoidTransaction('auto-rollback-enabled')
            .addStep('increment', (state) => {
                state.counter = 20;
            });

        await transaction.run();

        // Manual rollback should throw error when auto-rollback is enabled
        await expect(transaction.rollback()).rejects.toThrow(
            'Manual rollback is only available when auto-rollback is disabled'
        );
    });

    it('should not emit rollback events when auto-rollback is disabled', async () => {
        const events: string[] = [];
        
        // Listen for transaction events
        saga.onEventStream('transaction:fail').subscribe((event) => {
            events.push('transaction:fail');
        });
        
        saga.onEventStream('transaction:rollback').subscribe((event) => {
            events.push('transaction:rollback');
        });
        
        saga.onEventStream('step:rollback').subscribe((event) => {
            events.push('step:rollback');
        });

        const transaction = saga
            .createTransaction('no-rollback-events')
            .configure({ disableAutoRollback: true })
            .addStep('increment', (state) => {
                state.counter = 25;
            })
            .addStep('fail', () => {
                throw new Error('Test failure');
            });

        try {
            await transaction.run();
        } catch (error) {
            // Expected to fail
        }

        // Should have transaction:fail but no rollback events
        expect(events).toContain('transaction:fail');
        expect(events).not.toContain('transaction:rollback');
        expect(events).not.toContain('step:rollback');
    });

    it('should preserve state changes even with compensation functions when auto-rollback is disabled', async () => {
        const transaction = saga
            .createTransaction('preserve-changes')
            .configure({ disableAutoRollback: true })
            .addStep('increment', (state) => {
                state.counter = 30;
            }, (state) => {
                // This compensation should NOT be called when auto-rollback is disabled
                state.counter = 999; 
            })
            .addStep('fail', () => {
                throw new Error('Test failure');
            });

        expect(saga.getState().counter).toBe(0);

        try {
            await transaction.run();
        } catch (error) {
            // Expected to fail
        }

        // State should be 30 (the change), not 999 (the compensation) or 0 (rollback)
        expect(saga.getState().counter).toBe(30);
    });

    it('should work with TransactionBuilder configure method', async () => {
        const transaction = saga
            .createTransaction('builder-configure')
            .addStep('set-counter', (state) => {
                state.counter = 35;
            })
            .configure({ disableAutoRollback: true })
            .addStep('fail', () => {
                throw new Error('Test failure');
            });

        try {
            await transaction.run();
        } catch (error) {
            expect(error.message).toContain('failed (rollback disabled)');
        }

        expect(saga.getState().counter).toBe(35);
    });
});
