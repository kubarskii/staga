/**
 * Redux-pattern demo showcasing enhanced type safety and patterns
 */
import {
    SagaManager,
    createStepSlice,
    createStepAction,
    createAsyncStepAction,
    createSelector,
    createParameterizedSelector,
    type SagaEvent,
    type TransactionStartEvent,
    type StepSuccessEvent
} from '../src/index.js';

// Application state with Redux-style organization
interface AppState {
    user: {
        id: string;
        name: string;
        email: string;
        settings: {
            theme: 'light' | 'dark';
            notifications: boolean;
        };
    } | null;
    cart: {
        items: Array<{
            productId: string;
            quantity: number;
            price: number;
        }>;
        total: number;
        status: 'idle' | 'loading' | 'error';
    };
    orders: Array<{
        id: string;
        userId: string;
        items: Array<{
            productId: string;
            quantity: number;
            price: number;
        }>;
        total: number;
        status: 'pending' | 'confirmed' | 'shipped' | 'delivered';
        createdAt: Date;
    }>;
    system: {
        lastActivity: Date;
        version: string;
        isOnline: boolean;
    };
}

// Initial state
const initialState: AppState = {
    user: null,
    cart: {
        items: [],
        total: 0,
        status: 'idle',
    },
    orders: [],
    system: {
        lastActivity: new Date(),
        version: '1.0.0',
        isOnline: true,
    },
};

// Create saga manager
const saga = SagaManager.create(initialState);

// Redux-style selectors with memoization
const selectUser = createSelector((state: AppState) => state.user);
const selectCartItems = createSelector((state: AppState) => state.cart.items);
const selectCartTotal = createSelector((state: AppState) => state.cart.total);
const selectOrders = createSelector((state: AppState) => state.orders);

// Parameterized selectors
const selectOrderById = createParameterizedSelector(
    (state: AppState, orderId: string) =>
        state.orders.find(order => order.id === orderId)
);

const selectUserOrders = createSelector((state: AppState) => {
    const user = state.user;
    return user ? state.orders.filter(order => order.userId === user.id) : [];
});

// Computed selectors
const selectCartSummary = createSelector((state: AppState) => {
    const items = selectCartItems(state);
    const total = selectCartTotal(state);
    return {
        itemCount: items.length,
        total,
        averagePrice: items.length > 0 ? total / items.length : 0
    };
});

// Redux-style step slices for feature organization
const userSlice = createStepSlice<AppState>({
    name: 'user',
    defaultOptions: { retries: 2, timeout: 5000 },
    steps: {
        login: {
            execute: async (state: AppState, payload: { email: string; password: string }) => {
                console.log(`Logging in user: ${payload.email}`);
                // Simulate API call
                await new Promise(resolve => setTimeout(resolve, 1000));

                state.user = {
                    id: 'user_' + Date.now(),
                    name: 'John Doe',
                    email: payload.email,
                    settings: {
                        theme: 'light',
                        notifications: true
                    }
                };
                state.system.lastActivity = new Date();
            },
            compensate: async (state: AppState) => {
                console.log('🔄 Compensating login - clearing user session');
                state.user = null;
            },
        },
        logout: {
            execute: async (state: AppState) => {
                console.log('Logging out user');
                state.user = null;
                state.cart.items = [];
                state.cart.total = 0;
                state.system.lastActivity = new Date();
            },
        },
        updateSettings: {
            execute: async (state: AppState, payload: Partial<{ theme: 'light' | 'dark'; notifications: boolean }>) => {
                if (!state.user) throw new Error('No user logged in');

                const user = state.user; // Type guard
                user.settings = { ...user.settings, ...payload };
                state.system.lastActivity = new Date();
            },
        },
    },
});

const cartSlice = createStepSlice<AppState>({
    name: 'cart',
    defaultOptions: { retries: 3, timeout: 3000 },
    steps: {
        addItem: {
            execute: async (state: AppState, payload: { productId: string; quantity: number; price: number }) => {
                if (!state.user) throw new Error('User must be logged in to add items');

                const existingItem = state.cart.items.find(item => item.productId === payload.productId);

                if (existingItem) {
                    existingItem.quantity += payload.quantity;
                } else {
                    state.cart.items.push({
                        productId: payload.productId,
                        quantity: payload.quantity,
                        price: payload.price
                    });
                }

                state.cart.total = state.cart.items.reduce(
                    (sum, item) => sum + (item.price * item.quantity),
                    0
                );
                state.system.lastActivity = new Date();
            },
            compensate: async (state: AppState, payload: { productId: string; quantity: number }) => {
                console.log(`🔄 Compensating add item - removing ${payload.productId}`);
                const itemIndex = state.cart.items.findIndex(item => item.productId === payload.productId);

                if (itemIndex > -1) {
                    const item = state.cart.items[itemIndex];
                    if (item.quantity > payload.quantity) {
                        item.quantity -= payload.quantity;
                    } else {
                        state.cart.items.splice(itemIndex, 1);
                    }

                    state.cart.total = state.cart.items.reduce(
                        (sum, item) => sum + (item.price * item.quantity),
                        0
                    );
                }
            },
        },
        removeItem: {
            execute: async (state: AppState, payload: { productId: string }) => {
                const itemIndex = state.cart.items.findIndex(item => item.productId === payload.productId);
                if (itemIndex > -1) {
                    state.cart.items.splice(itemIndex, 1);
                    state.cart.total = state.cart.items.reduce(
                        (sum, item) => sum + (item.price * item.quantity),
                        0
                    );
                }
                state.system.lastActivity = new Date();
            },
        },
        checkout: {
            execute: async (state: AppState, payload: { paymentMethod: string }) => {
                if (!state.user) throw new Error('User must be logged in');
                if (state.cart.items.length === 0) throw new Error('Cart is empty');

                state.cart.status = 'loading';

                // Simulate payment processing
                await new Promise(resolve => setTimeout(resolve, 2000));

                if (Math.random() < 0.1) { // 10% chance of failure
                    state.cart.status = 'error';
                    throw new Error('Payment failed');
                }

                // Create order
                const order = {
                    id: 'order_' + Date.now(),
                    userId: state.user.id,
                    items: [...state.cart.items],
                    total: state.cart.total,
                    status: 'pending' as const,
                    createdAt: new Date()
                };

                state.orders.push(order);
                state.cart.items = [];
                state.cart.total = 0;
                state.cart.status = 'idle';
                state.system.lastActivity = new Date();

                console.log(`✅ Order created: ${order.id}`);
            },
            compensate: async (state: AppState, payload: { paymentMethod: string }) => {
                console.log('🔄 Compensating checkout - removing latest order and restoring cart');

                if (state.orders.length > 0) {
                    const lastOrder = state.orders.pop()!;
                    state.cart.items = [...lastOrder.items];
                    state.cart.total = lastOrder.total;
                }
                state.cart.status = 'idle';
            },
            options: { retries: 1, timeout: 10000 }, // Override default options
        },
    },
});

// Individual step actions for more granular control
const validateInventory = createAsyncStepAction(
    'inventory/validate',
    async (state: AppState, payload: { productId: string; quantity: number }): Promise<boolean> => {
        console.log(`Validating inventory for ${payload.productId}: ${payload.quantity}`);

        // Simulate inventory check
        await new Promise(resolve => setTimeout(resolve, 500));

        // 90% success rate
        const available = Math.random() > 0.1;
        if (!available) {
            throw new Error(`Insufficient inventory for ${payload.productId}`);
        }

        return true;
    }
);

const sendNotification = createStepAction(
    'notification/send',
    async (state: AppState, payload: { message: string; type: 'info' | 'success' | 'error' }) => {
        console.log(`📧 Notification [${payload.type}]: ${payload.message}`);
        // In a real app, this would send a push notification, email, etc.
        state.system.lastActivity = new Date();
    }
);

// Redux-style event listeners with strong typing
saga.onEvent('transaction:start', (event: TransactionStartEvent) => {
    console.log(`🚀 Transaction started: ${event.transactionName} at ${new Date(event.timestamp).toISOString()}`);
});

saga.onEvent('transaction:success', (event) => {
    console.log(`✅ Transaction completed: ${event.transactionName} in ${event.duration}ms`);
});

saga.onEvent('transaction:fail', (event) => {
    console.error(`❌ Transaction failed: ${event.transactionName} after ${event.duration}ms`, event.error);
});

saga.onEvent('step:success', (event: StepSuccessEvent) => {
    console.log(`  ✓ Step completed: ${event.stepName} in ${event.duration}ms`);
});

// Global event listener
saga.onAnyEvent((event: SagaEvent) => {
    // Log all events for debugging
    console.debug(`[Event] ${event.type}`, {
        ...event,
        timestamp: new Date(event.timestamp).toISOString()
    });
});

// Demo function showcasing Redux patterns
async function runReduxPatternsDemo() {
    console.log('🎭 Redux Patterns Demo with Enhanced Type Safety\n');

    try {
        // Using selectors
        console.log('Initial state check:');
        console.log('User:', selectUser(saga.getState()));
        console.log('Cart items:', selectCartItems(saga.getState()).length);
        console.log('Orders:', selectOrders(saga.getState()).length);
        console.log();

        // Complex transaction using slice actions
        console.log('--- User Registration & Shopping Flow ---');

        // Step 1: Login
        const loginTx = saga
            .createTransaction<{ email: string; password: string }>('user-login')
            .addStep('login', async (state, payload) => {
                await userSlice.actions.login.execute(state, payload);
            });

        await loginTx.run({ email: 'john@example.com', password: 'secure123' });

        // Step 2: Add laptop to cart
        const laptopTx = saga
            .createTransaction<{ productId: string; quantity: number; price: number }>('add-laptop')
            .addStep('validate-inventory', async (state, payload) => {
                await validateInventory.execute(state, { productId: payload.productId, quantity: payload.quantity });
            })
            .addStep('add-item', async (state, payload) => {
                await cartSlice.actions.addItem.execute(state, payload);
            });

        await laptopTx.run({ productId: 'laptop-1', quantity: 1, price: 999.99 });

        // Step 3: Add mouse to cart
        const mouseTx = saga
            .createTransaction<{ productId: string; quantity: number; price: number }>('add-mouse')
            .addStep('validate-inventory', async (state, payload) => {
                await validateInventory.execute(state, { productId: payload.productId, quantity: payload.quantity });
            })
            .addStep('add-item', async (state, payload) => {
                await cartSlice.actions.addItem.execute(state, payload);
            });

        await mouseTx.run({ productId: 'mouse-1', quantity: 2, price: 29.99 });

        // Step 4: Checkout and confirm
        const checkoutTx = saga
            .createTransaction<{ paymentMethod: string }>('checkout')
            .addStep('checkout', async (state, payload) => {
                await cartSlice.actions.checkout.execute(state, payload);
            });

        await checkoutTx.run({ paymentMethod: 'credit-card' });

        // Step 5: Send confirmation
        const confirmTx = saga
            .createTransaction<{ message: string; type: "error" | "info" | "success" }>('confirmation')
            .addStep('send-notification', sendNotification.execute);

        await confirmTx.run({ message: 'Order confirmed! Your items will be shipped soon.', type: 'success' });

        // Using computed selectors
        console.log('\n--- State Analysis with Selectors ---');
        const currentUser = selectUser(saga.getState());
        console.log('Current user:', currentUser?.name);

        const cartSummary = selectCartSummary(saga.getState());
        console.log('Cart summary:', cartSummary);

        const userOrders = selectUserOrders(saga.getState());
        console.log('User orders:', userOrders.length);

        if (userOrders.length > 0) {
            const firstOrder = selectOrderById(saga.getState(), userOrders[0].id);
            console.log('First order details:', {
                id: firstOrder?.id,
                total: firstOrder?.total,
                status: firstOrder?.status
            });
        }

        // Test undo/redo with selectors
        console.log('\n--- Testing Undo/Redo ---');
        console.log('Orders before undo:', selectOrders(saga.getState()).length);
        saga.undo();
        console.log('Orders after undo:', selectOrders(saga.getState()).length);
        saga.redo();
        console.log('Orders after redo:', selectOrders(saga.getState()).length);

    } catch (error) {
        console.error('Demo failed:', error);
    }

    console.log('\n🎉 Redux patterns demo completed!');
}

// Export for use in other examples
export {
    saga,
    userSlice,
    cartSlice,
    selectUser,
    selectCartItems,
    selectCartTotal,
    selectOrderById,
    selectCartSummary,
    runReduxPatternsDemo
};

// Run demo if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
    runReduxPatternsDemo().catch(console.error).finally(() => saga.dispose());
}