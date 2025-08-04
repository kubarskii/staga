/**
 * Test to verify that the reactive store (StateManager) is the central component
 * and properly integrates with transactions and subscriptions
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SagaManager } from '../SagaManager';
import { StateManager } from '../StateManager';

interface StoreState {
    counter: number;
    items: string[];
    user: {
        id: number;
        name: string;
        preferences: {
            theme: string;
            notifications: boolean;
        };
    };
    metadata: {
        lastUpdated: number;
        version: string;
    };
}

describe('Reactive Store as Central Component', () => {
    let saga: SagaManager<StoreState>;
    let stateManager: StateManager<StoreState>;

    const initialState: StoreState = {
        counter: 0,
        items: [],
        user: {
            id: 1,
            name: 'John',
            preferences: {
                theme: 'light',
                notifications: true
            }
        },
        metadata: {
            lastUpdated: Date.now(),
            version: '1.0.0'
        }
    };

    beforeEach(() => {
        saga = SagaManager.create(initialState);
        stateManager = saga.stateManager;
    });

    afterEach(async () => {
        await saga.dispose();
    });

    describe('Central State Management', () => {
        it('should have StateManager as the central reactive store', () => {
            // StateManager should be the primary state holder
            expect(stateManager).toBeDefined();
            expect(stateManager.getState()).toEqual(initialState);

            // SagaManager should delegate to StateManager
            expect(saga.getState()).toBe(stateManager.getState());
        });

        it('should provide immediate reactive updates through BehaviorSubject', () => {
            const updates: StoreState[] = [];

            // Subscribe to reactive updates
            const subscription = stateManager.subscribe((state) => {
                updates.push({ ...state });
            });

            // Initial state should be immediately available
            expect(updates.length).toBe(1);
            expect(updates[0]).toEqual(initialState);

            // Direct state changes should trigger immediate updates
            stateManager.setState({
                ...initialState,
                counter: 5
            });

            expect(updates.length).toBe(2);
            expect(updates[1].counter).toBe(5);

            subscription();
        });

        it('should support multiple reactive selectors from the central store', () => {
            const counterUpdates: number[] = [];
            const userNameUpdates: string[] = [];
            const themeUpdates: string[] = [];

            // Create multiple reactive selectors
            const counter$ = stateManager.selectProperty('counter');
            const userName$ = stateManager.select(state => state.user.name);
            const theme$ = stateManager.selectPath('user.preferences.theme', 'light');

            // Subscribe to different parts of the state
            counter$.subscribe(value => counterUpdates.push(value));
            userName$.subscribe(value => userNameUpdates.push(value));
            theme$.subscribe(value => themeUpdates.push(value));

            // Initial values should be available
            expect(counter$.value).toBe(0);
            expect(userName$.value).toBe('John');
            expect(theme$.value).toBe('light');

            // Update different parts of state
            stateManager.setState({
                ...stateManager.getState(),
                counter: 10,
                user: {
                    ...stateManager.getState().user,
                    name: 'Jane',
                    preferences: {
                        ...stateManager.getState().user.preferences,
                        theme: 'dark'
                    }
                }
            });

            // Each selector should update independently
            expect(counterUpdates).toEqual([0, 10]);
            expect(userNameUpdates).toEqual(['John', 'Jane']);
            expect(themeUpdates).toEqual(['light', 'dark']);
        });
    });

    describe('Transaction Integration with Reactive Store', () => {
        it('should execute transactions that reactively update the central store', async () => {
            const stateUpdates: StoreState[] = [];

            // Subscribe to state changes
            stateManager.subscribe(state => stateUpdates.push({ ...state }));

            // Create a transaction that updates multiple parts of the state
            const transaction = saga
                .createTransaction('update-store')
                .addStep('increment-counter', (state) => {
                    state.counter += 5;
                })
                .addStep('add-items', (state) => {
                    state.items.push('item1', 'item2');
                })
                .addStep('update-user', (state) => {
                    state.user.name = 'Alice';
                    state.user.preferences.theme = 'dark';
                })
                .addStep('update-metadata', (state) => {
                    state.metadata.lastUpdated = Date.now();
                    state.metadata.version = '1.1.0';
                });

            await transaction.run();

            // The reactive store should have been updated
            const finalState = stateManager.getState();
            expect(finalState.counter).toBe(5);
            expect(finalState.items).toEqual(['item1', 'item2']);
            expect(finalState.user.name).toBe('Alice');
            expect(finalState.user.preferences.theme).toBe('dark');
            expect(finalState.metadata.version).toBe('1.1.0');

            // Subscribers should have received updates
            expect(stateUpdates.length).toBeGreaterThan(1);
        });

        it('should support reactive transactions with proxy-based mutations', async () => {
            const propertyUpdates: string[] = [];

            // Create a selector for user name
            const userName$ = stateManager.select(state => state.user.name);
            userName$.subscribe(name => propertyUpdates.push(name));

            // Create transaction with reactive proxy
            const transaction = saga
                .createTransaction('proxy-transaction', {
                    reactiveProxy: {
                        enableDeepReactivity: true,
                        enableLogging: false
                    }
                })
                .addStep('mutate-user', (state) => {
                    // Direct mutation should trigger reactive updates
                    state.user.name = 'Bob';
                    state.user.preferences.notifications = false;
                });

            await transaction.run();

            // Reactive updates should have occurred
            expect(userName$.value).toBe('Bob');
            expect(propertyUpdates).toContain('Bob');
            expect(stateManager.getState().user.preferences.notifications).toBe(false);
        });

        it('should maintain reactivity during transaction rollback', async () => {
            const counterUpdates: number[] = [];
            const counter$ = stateManager.selectProperty('counter');
            counter$.subscribe(value => counterUpdates.push(value));

            // Create a transaction that will fail and rollback
            const transaction = saga
                .createTransaction('failing-transaction')
                .addStep('increment', (state) => {
                    state.counter = 100;
                })
                .addStep('fail', () => {
                    throw new Error('Intentional failure');
                });

            const initialCounter = stateManager.getState().counter;

            try {
                await transaction.run();
            } catch (error) {
                // Expected to fail
            }

            // State should be rolled back to initial value
            expect(stateManager.getState().counter).toBe(initialCounter);

            // Reactive updates should reflect the rollback
            expect(counter$.value).toBe(initialCounter);
        });
    });

    describe('Advanced Reactive Features', () => {
        it('should support computed values derived from the central store', () => {
            const itemCount$ = stateManager.select(state => state.items.length);
            const userDisplay$ = stateManager.select(state =>
                `${state.user.name} (${state.user.preferences.theme})`
            );

            // Initial computed values
            expect(itemCount$.value).toBe(0);
            expect(userDisplay$.value).toBe('John (light)');

            // Update state and check computed values
            stateManager.setState({
                ...stateManager.getState(),
                items: ['a', 'b', 'c'],
                user: {
                    ...stateManager.getState().user,
                    name: 'Jane',
                    preferences: {
                        ...stateManager.getState().user.preferences,
                        theme: 'dark'
                    }
                }
            });

            expect(itemCount$.value).toBe(3);
            expect(userDisplay$.value).toBe('Jane (dark)');
        });

        it('should support combining multiple reactive streams', () => {
            const summary$ = stateManager.combine(
                state => state.counter,
                state => state.items.length,
                (counter, itemCount) => `Counter: ${counter}, Items: ${itemCount}`
            );

            expect(summary$.value).toBe('Counter: 0, Items: 0');

            // Update state
            stateManager.setState({
                ...stateManager.getState(),
                counter: 42,
                items: ['x', 'y']
            });

            expect(summary$.value).toBe('Counter: 42, Items: 2');
        });

        it('should handle deep path selections reactively', () => {
            const theme$ = stateManager.selectPath('user.preferences.theme', 'light');
            const notifications$ = stateManager.selectPath('user.preferences.notifications', false);

            expect(theme$.value).toBe('light');
            expect(notifications$.value).toBe(true);

            // Deep update
            stateManager.setState({
                ...stateManager.getState(),
                user: {
                    ...stateManager.getState().user,
                    preferences: {
                        theme: 'dark',
                        notifications: false
                    }
                }
            });

            expect(theme$.value).toBe('dark');
            expect(notifications$.value).toBe(false);
        });
    });

    describe('Store Performance and Memory Management', () => {
        it('should manage subscriptions efficiently', () => {
            const subscriptions: (() => void)[] = [];

            // Create multiple subscriptions
            for (let i = 0; i < 10; i++) {
                const unsubscribe = stateManager.subscribe(() => { });
                subscriptions.push(unsubscribe);
            }

            const debugInfo = stateManager.getDebugInfo();
            expect(debugInfo.subscriptions).toBeGreaterThan(0);

            // Clean up subscriptions
            subscriptions.forEach(unsubscribe => unsubscribe());
        });

        it('should provide metrics and performance information', () => {
            const metrics = stateManager.getMetrics();

            expect(metrics).toHaveProperty('totalChanges');
            expect(metrics).toHaveProperty('activeSubscriptions');
            expect(metrics).toHaveProperty('immediateNotifications');
            expect(metrics).toHaveProperty('memoryEstimate');

            // Make some changes and verify metrics update
            const initialChanges = metrics.totalChanges;

            stateManager.setState({
                ...stateManager.getState(),
                counter: 1
            });

            const newMetrics = stateManager.getMetrics();
            expect(newMetrics.totalChanges).toBe(initialChanges + 1);
        });
    });

    describe('Store Integration with SagaManager Features', () => {
        it('should integrate with computed values from SagaManager', () => {
            const counter$ = saga.select(state => state.counter);
            const items$ = saga.select(state => state.items);

            // Use SagaManager's computed method
            const summary$ = saga.computed(
                counter$,
                items$,
                (counter, items) => `${counter} items: ${items.length}`
            );

            expect(summary$.value).toBe('0 items: 0');

            // Update through StateManager
            stateManager.setState({
                ...stateManager.getState(),
                counter: 5,
                items: ['a', 'b']
            });

            expect(summary$.value).toBe('5 items: 2');
        });

        it('should integrate with event recording and replay', async () => {
            const stateHistory: StoreState[] = [];
            stateManager.subscribe(state => stateHistory.push({ ...state }));

            // Start recording
            saga.startRecording();

            // Make changes through transactions
            const transaction = saga
                .createTransaction('recorded-transaction')
                .addStep('update', (state) => {
                    state.counter = 99;
                    state.items.push('recorded-item');
                });

            await transaction.run();
            saga.stopRecording();

            const recordedEvents = saga.getRecordedEvents();
            expect(recordedEvents.length).toBeGreaterThan(0);

            // Reset state
            stateManager.setState(initialState);

            // Replay events
            await saga.startReplay();

            // State should be restored
            expect(stateManager.getState().counter).toBe(99);
            expect(stateManager.getState().items).toContain('recorded-item');
        });
    });
});
