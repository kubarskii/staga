import { describe, it, expect, beforeEach, vi } from 'vitest';
import { StateManager } from '../StateManager';
import { SagaManager } from '../SagaManager';
import { Transaction } from '../Transaction';
import { deepEqual } from '../ReactiveSelectors';

interface TestState {
    counter: number;
    items: string[];
    balance: number;
}

interface TestPayload {
    amount?: number;
    item?: string;
    value?: string;
}

describe('Transaction', () => {
    let stateManager: StateManager<TestState>;
    let sagaManager: SagaManager<TestState>;
    let transaction: Transaction<TestState, TestPayload>;
    const initialState: TestState = { counter: 0, items: [], balance: 100 };

    beforeEach(() => {
        sagaManager = SagaManager.create(initialState);
        stateManager = sagaManager.stateManager;
        // Use createTypedTransaction for legacy test compatibility
        transaction = sagaManager.createTypedTransaction<TestPayload>('test-transaction');
    });

    describe('addStep', () => {
        it('should add a step to the transaction', () => {
            const execute = vi.fn();
            const compensate = vi.fn();

            const result = transaction.addStep('test-step', execute, compensate, { retries: 3, timeout: 1000 });

            expect(result).toBe(transaction); // Should return this for chaining
            expect(transaction.stepsCount).toBe(1);
            expect(transaction.getStep(0)).toEqual({
                name: 'test-step',
                execute,
                compensate,
                retries: 3,
                timeout: 1000
            });
        });

        it('should use default options when not provided', () => {
            const execute = vi.fn();

            transaction.addStep('test-step', execute);

            expect(transaction.getStep(0)).toEqual({
                name: 'test-step',
                execute,
                compensate: undefined,
                retries: 0,
                timeout: 0
            });
        });
    });

    describe('run', () => {
        it('should execute all steps successfully', async () => {
            const step1 = vi.fn();
            const step2 = vi.fn();
            const payload = { value: 'test' };

            transaction
                .addStep('step1', step1)
                .addStep('step2', step2);

            await transaction.run(payload);

            expect(step1).toHaveBeenCalledWith(initialState, payload);
            expect(step2).toHaveBeenCalledWith(initialState, payload);
        });

        it('should create and rollback to snapshot on failure', async () => {
            const step1 = vi.fn().mockImplementation((state, payload) => {
                state.counter = 10;
            });
            const step2 = vi.fn().mockImplementation(() => {
                throw new Error('Step 2 failed');
            });
            const compensate1 = vi.fn().mockImplementation((state, payload) => {
                state.counter = 0;
            });

            transaction
                .addStep('step1', step1, compensate1)
                .addStep('step2', step2);

            await expect(transaction.run({ value: 'test' })).rejects.toThrow('Transaction "test-transaction" failed and rolled back: Step 2 failed');

            expect(step1).toHaveBeenCalled();
            expect(step2).toHaveBeenCalled();
            expect(compensate1).toHaveBeenCalled();
            expect(sagaManager.getState().counter).toBe(0); // Should be rolled back
        });

        it('should execute compensation functions in reverse order', async () => {
            const compensateOrder: string[] = [];
            const step1 = vi.fn().mockImplementation((state) => { state.counter = 1; });
            const step2 = vi.fn().mockImplementation((state) => { state.counter = 2; });
            const step3 = vi.fn().mockImplementation(() => { throw new Error('Step 3 failed'); });

            const compensate1 = vi.fn().mockImplementation(() => { compensateOrder.push('compensate1'); });
            const compensate2 = vi.fn().mockImplementation(() => { compensateOrder.push('compensate2'); });

            transaction
                .addStep('step1', step1, compensate1)
                .addStep('step2', step2, compensate2)
                .addStep('step3', step3);

            await expect(transaction.run({})).rejects.toThrow();

            expect(compensateOrder).toEqual(['compensate2', 'compensate1']);
        });

        it('should emit correct events during execution', async () => {
            const events: string[] = [];
            sagaManager.on('transaction:start', () => events.push('transaction:start'));
            sagaManager.on('transaction:success', () => events.push('transaction:success'));
            sagaManager.on('step:start', () => events.push('step:start'));
            sagaManager.on('step:success', () => events.push('step:success'));

            transaction.addStep('test-step', vi.fn());

            await transaction.run({});

            expect(events).toEqual([
                'transaction:start',
                'step:start',
                'step:success',
                'transaction:success'
            ]);
        });

        it('should emit failure and rollback events on error', async () => {
            const events: string[] = [];
            sagaManager.onEvent('transaction:start', () => events.push('transaction:start'));
            sagaManager.onEvent('transaction:fail', () => events.push('transaction:fail'));
            sagaManager.onEvent('transaction:rollback', () => events.push('transaction:rollback'));
            sagaManager.onEvent('step:rollback', () => events.push('step:rollback'));

            transaction
                .addStep('step1', vi.fn(), vi.fn())
                .addStep('step2', vi.fn().mockImplementation(() => { throw new Error('Failed'); }));

            await expect(transaction.run({})).rejects.toThrow();

            expect(events).toEqual([
                'transaction:start',
                'transaction:fail',
                'step:rollback',
                'transaction:rollback'
            ]);
        });

        it('should not add to undo stack when final state is deeply equal but ordered differently', async () => {
            interface ComplexState {
                first: string;
                second: string;
                nested: { foo: number; bar: number };
            }

            const complexInitial: ComplexState = {
                first: 'one',
                second: 'two',
                nested: { foo: 1, bar: 2 }
            };

            const complexSaga = SagaManager.create(complexInitial);
            const complexTransaction = complexSaga.createTypedTransaction<void>('complex');

            complexTransaction.addStep('reorder', (state) => {
                const { first, second, nested } = state;
                delete (state as any).first;
                delete (state as any).second;
                delete (state as any).nested;
                (state as any).nested = { bar: nested.bar, foo: nested.foo };
                (state as any).second = second;
                (state as any).first = first;
            });

            await complexTransaction.run(undefined);

            const finalState = complexSaga.getState();

            // Stringified versions differ due to property order
            expect(JSON.stringify(finalState)).not.toBe(JSON.stringify(complexInitial));
            // Deep equality still holds
            expect(deepEqual(finalState, complexInitial)).toBe(true);
            // Undo stack should remain empty since state hasn't truly changed
            expect(complexSaga.stateManager.undoStackLength).toBe(0);
        });
    });

    describe('retry mechanism', () => {
        it('should retry failed steps according to retry count', async () => {
            let attempts = 0;
            const failingStep = vi.fn().mockImplementation(() => {
                attempts++;
                if (attempts < 3) {
                    throw new Error('Step failed');
                }
            });

            const retryEvents: string[] = [];
            sagaManager.on('step:retry', (stepName, attempt) => {
                retryEvents.push(`${stepName}:${attempt}`);
            });

            transaction.addStep('failing-step', failingStep, undefined, { retries: 2 });

            await transaction.run({});

            expect(attempts).toBe(3); // Initial attempt + 2 retries
            expect(retryEvents).toEqual(['failing-step:1', 'failing-step:2']);
        });

        it('should fail after exhausting retries', async () => {
            const failingStep = vi.fn().mockImplementation(() => {
                throw new Error('Always fails');
            });

            transaction.addStep('failing-step', failingStep, undefined, { retries: 2 });

            await expect(transaction.run({})).rejects.toThrow('Transaction "test-transaction" failed and rolled back: Always fails');
            expect(failingStep).toHaveBeenCalledTimes(3); // Initial + 2 retries
        });
    });

    describe('timeout mechanism', () => {
        it('should timeout long-running steps', async () => {
            const longRunningStep = vi.fn().mockImplementation(() => {
                return new Promise(resolve => setTimeout(resolve, 200));
            });

            transaction.addStep('long-step', longRunningStep, undefined, { timeout: 50 });

            await expect(transaction.run({})).rejects.toThrow('Transaction "test-transaction" failed and rolled back: Step "long-step" timed out');
        });

        it('should not timeout fast steps', async () => {
            const fastStep = vi.fn().mockImplementation(() => {
                return new Promise(resolve => setTimeout(resolve, 10));
            });

            transaction.addStep('fast-step', fastStep, undefined, { timeout: 100 });

            await expect(transaction.run({})).resolves.not.toThrow();
            expect(fastStep).toHaveBeenCalled();
        });

        it('should not apply timeout when timeout is 0', async () => {
            const step = vi.fn().mockImplementation(() => {
                return new Promise(resolve => setTimeout(resolve, 100));
            });

            transaction.addStep('no-timeout-step', step, undefined, { timeout: 0 });

            await expect(transaction.run({})).resolves.not.toThrow();
            expect(step).toHaveBeenCalled();
        });
    });

    describe('middleware integration', () => {
        it('should run middleware around transaction execution', async () => {
            const middlewareOrder: string[] = [];

            sagaManager.use(async (ctx, next) => {
                middlewareOrder.push('middleware1:before');
                await next();
                middlewareOrder.push('middleware1:after');
            });

            sagaManager.use(async (ctx, next) => {
                middlewareOrder.push('middleware2:before');
                await next();
                middlewareOrder.push('middleware2:after');
            });

            transaction.addStep('test-step', () => {
                middlewareOrder.push('step:execute');
            });

            await transaction.run({});

            expect(middlewareOrder).toEqual([
                'middleware1:before',
                'middleware2:before',
                'step:execute',
                'middleware2:after',
                'middleware1:after'
            ]);
        });

        it('should handle middleware errors', async () => {
            sagaManager.use(async (ctx, next) => {
                throw new Error('Middleware error');
            });

            transaction.addStep('test-step', vi.fn());

            await expect(transaction.run({})).rejects.toThrow('Middleware error');
        });
    });

    describe('state mutations', () => {
        it('should allow steps to mutate state', async () => {
            transaction
                .addStep('increment', (state, payload) => {
                    state.counter += payload.amount || 0;
                })
                .addStep('add-item', (state, payload) => {
                    state.items.push(payload.item || 'default');
                });

            await transaction.run({ amount: 5, item: 'test-item' });

            expect(sagaManager.getState()).toEqual({
                counter: 5,
                items: ['test-item'],
                balance: 100
            });
        });

        it('should preserve state mutations even after compensation', async () => {
            transaction
                .addStep('increment', (state, payload) => {
                    state.counter += payload.amount || 0;
                })
                .addStep('fail', () => {
                    throw new Error('Failed');
                }, undefined);

            await expect(transaction.run({ amount: 5 })).rejects.toThrow();

            // State should be rolled back to snapshot, not to mutations
            expect(sagaManager.getState().counter).toBe(0);
        });
    });
});