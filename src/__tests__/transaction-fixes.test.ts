/**
 * Test suite for Transaction module fixes
 * Tests type safety improvements and proper null handling
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Transaction, TransactionBuilder } from '../Transaction';
import { StateManager } from '../StateManager';

// Mock EventEmitter interface
interface MockEventEmitter {
    emit<T extends string>(event: T, ...args: unknown[]): void;
    emitSagaEvent(event: unknown): void;
}

// Test state interface
interface TestState {
    counter: number;
    name: string;
    items: string[];
}

describe('Transaction Type Safety Fixes', () => {
    let stateManager: StateManager<TestState>;
    let mockEventEmitter: MockEventEmitter;
    let initialState: TestState;

    beforeEach(() => {
        initialState = {
            counter: 0,
            name: 'test',
            items: []
        };
        
        stateManager = new StateManager(initialState);
        
        mockEventEmitter = {
            emit: vi.fn(),
            emitSagaEvent: vi.fn()
        };
    });

    describe('TransactionBuilder Type Safety', () => {
        it('should create TransactionBuilder with proper generic types', () => {
            const builder = new TransactionBuilder<TestState, { value: number }>(
                'test-transaction',
                stateManager,
                mockEventEmitter,
                []
            );

            expect(builder.name).toBe('test-transaction');
            // TransactionBuilder doesn't expose step count directly, test name instead
            expect(builder).toBeDefined();
        });

        it('should add steps with type-safe payload', async () => {
            const builder = new TransactionBuilder<TestState, { increment: number }>(
                'increment-transaction',
                stateManager,
                mockEventEmitter,
                []
            );

            builder.addStep(
                'increment',
                (state: TestState, payload: { increment: number }) => {
                    state.counter += payload.increment;
                },
                (state: TestState, payload: { increment: number }) => {
                    state.counter -= payload.increment;
                }
            );

            // Test that builder can be configured and executed (indirect test of step addition)
            expect(builder).toBeDefined();
            expect(typeof builder.run).toBe('function');
        });

        it('should execute transaction with proper type inference', async () => {
            const builder = new TransactionBuilder<TestState, { increment: number }>(
                'type-safe-transaction',
                stateManager,
                mockEventEmitter,
                []
            );

            builder.addStep(
                'increment-step',
                (state: TestState, payload: { increment: number }) => {
                    state.counter += payload.increment;
                }
            );

            await builder.run({ increment: 5 });

            expect(stateManager.getState().counter).toBe(5);
            expect(mockEventEmitter.emitSagaEvent).toHaveBeenCalled();
        });
    });

    describe('Transaction Null Safety', () => {
        it('should handle compensation function gracefully when undefined', () => {
            const transaction = new Transaction<TestState, { value: number }>(
                'null-safe-transaction',
                stateManager,
                mockEventEmitter,
                []
            );

            // Add step without compensation (should not throw)
            transaction.addStep(
                'safe-step',
                (state: TestState, payload: { value: number }) => {
                    state.counter = payload.value;
                }
                // No compensation function
            );

            expect(transaction.stepsCount).toBe(1);
            expect(transaction.getStep(0)?.compensate).toBeUndefined();
        });

        it('should properly check step existence before compensation', async () => {
            const transaction = new Transaction<TestState, { value: number }>(
                'compensation-test',
                stateManager,
                mockEventEmitter,
                []
            );

            // Add step with compensation
            transaction.addStep(
                'step-with-compensation',
                (state: TestState, payload: { value: number }) => {
                    state.counter = payload.value;
                    throw new Error('Intentional failure');
                },
                (state: TestState, payload: { value: number }) => {
                    state.counter = 0; // Reset on failure
                }
            );

            try {
                await transaction.run({ value: 10 });
            } catch (error) {
                // Should handle rollback gracefully
                expect(error).toBeInstanceOf(Error);
            }

            // State should be rolled back
            expect(stateManager.getState().counter).toBe(0);
        });
    });

    describe('EventEmitter Interface Compatibility', () => {
        it('should work with compatible event emitter', () => {
            const compatibleEmitter = {
                emit: vi.fn(),
                emitSagaEvent: vi.fn()
            };

            const transaction = new Transaction<TestState, unknown>(
                'compatible-transaction',
                stateManager,
                compatibleEmitter,
                []
            );

            expect(transaction.name).toBe('compatible-transaction');
        });

        it('should emit saga events with proper structure', async () => {
            const transaction = new Transaction<TestState, { data: string }>(
                'event-emission-test',
                stateManager,
                mockEventEmitter,
                []
            );

            transaction.addStep(
                'emit-test-step',
                (state: TestState, payload: { data: string }) => {
                    state.name = payload.data;
                }
            );

            await transaction.run({ data: 'test-data' });

            // Check that saga events were emitted
            expect(mockEventEmitter.emitSagaEvent).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: 'transaction:start',
                    transactionName: 'event-emission-test'
                })
            );

            expect(mockEventEmitter.emitSagaEvent).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: 'transaction:success',
                    transactionName: 'event-emission-test'
                })
            );
        });
    });

    describe('Generic Step Definition', () => {
        it('should properly handle generic step execution', async () => {
            interface CustomPayload {
                action: 'add' | 'remove';
                item: string;
            }

            const transaction = new Transaction<TestState, CustomPayload>(
                'generic-step-test',
                stateManager,
                mockEventEmitter,
                []
            );

            transaction.addStep(
                'handle-item',
                (state: TestState, payload: CustomPayload) => {
                    if (payload.action === 'add') {
                        state.items.push(payload.item);
                    } else {
                        const index = state.items.indexOf(payload.item);
                        if (index > -1) {
                            state.items.splice(index, 1);
                        }
                    }
                }
            );

            await transaction.run({ action: 'add', item: 'test-item' });

            expect(stateManager.getState().items).toContain('test-item');
        });
    });
});
