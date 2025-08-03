/**
 * Type-safe usage example demonstrating improved generic inference
 */
import {
    SagaManager,
    createStep,
    createStateUpdater,
    createStateValidator,
    createPayloadValidator,
    createLoggingMiddleware,
    createPersistenceMiddleware
} from '../src/index.js';

// Define strongly typed application state
interface AppState {
    user: {
        id: string;
        name: string;
        email: string;
        preferences: {
            theme: 'light' | 'dark';
            notifications: boolean;
        };
    } | null;
    cart: Array<{
        productId: string;
        quantity: number;
        price: number;
    }>;
    orders: Array<{
        id: string;
        total: number;
        status: 'pending' | 'processing' | 'completed' | 'cancelled';
        items: Array<{
            productId: string;
            quantity: number;
            price: number;
        }>;
    }>;
    balance: number;
    lastActivity: Date;
}

// Define payload types for different operations
interface LoginPayload {
    email: string;
    password: string;
    userData: {
        id: string;
        name: string;
        email: string;
    };
}

interface AddToCartPayload {
    productId: string;
    quantity: number;
    price: number;
}

interface CheckoutPayload {
    paymentMethod: 'card' | 'paypal';
    shippingAddress: {
        street: string;
        city: string;
        zipCode: string;
    };
}

// Initial state with full type safety
const initialState: AppState = {
    user: null,
    cart: [],
    orders: [],
    balance: 1000,
    lastActivity: new Date(),
};

// Create saga manager with inferred state type
const saga = SagaManager.create(initialState);

// Add type-safe middleware
saga.use(createLoggingMiddleware<AppState>());
saga.use(createPersistenceMiddleware<AppState>('app-state'));

// Create payload validators for runtime type checking
const isLoginPayload = (payload: unknown): payload is LoginPayload => {
    if (typeof payload !== 'object' || payload === null) return false;
    const p = payload as Record<string, unknown>;
    return typeof p.email === 'string' &&
        typeof p.password === 'string' &&
        typeof p.userData === 'object' &&
        p.userData !== null;
};

const isAddToCartPayload = (payload: unknown): payload is AddToCartPayload => {
    if (typeof payload !== 'object' || payload === null) return false;
    const p = payload as Record<string, unknown>;
    return typeof p.productId === 'string' &&
        typeof p.quantity === 'number' &&
        typeof p.price === 'number';
};

const validateLoginPayload: (payload: unknown) => asserts payload is LoginPayload = createPayloadValidator(isLoginPayload);
const validateAddToCartPayload: (payload: unknown) => asserts payload is AddToCartPayload = createPayloadValidator(isAddToCartPayload);

// Create type-safe state validators
const validateUserLoggedIn = createStateValidator<AppState>(
    (state) => state.user !== null || 'User must be logged in'
);

const validateSufficientBalance = createStateValidator<AppState>(
    (state) => state.balance >= 0 || 'Insufficient balance'
);

// Create type-safe state updaters
const updateLastActivity = createStateUpdater<AppState>((state) => {
    state.lastActivity = new Date();
});

const clearUserSession = createStateUpdater<AppState>((state) => {
    state.user = null;
    state.cart = [];
});

// Type-safe transaction: User Login
async function createLoginTransaction() {
    const transaction = saga
        .createTransaction<LoginPayload>('user-login')
        .addStep(
            'validate-payload',
            async (state: AppState, payload) => {
                validateLoginPayload(payload);
                console.log(`Logging in user: ${payload.email}`);
            }
        )
        .addStep(
            'authenticate-user',
            async (state: AppState, payload) => {
                // Simulate authentication logic
                if (payload.password.length < 6) {
                    throw new Error('Invalid credentials');
                }
                console.log('✓ User authenticated');
            }
        )
        .addStep(
            'set-user-session',
            async (state: AppState, payload: LoginPayload) => {
                state.user = {
                    ...payload.userData,
                    preferences: {
                        theme: 'light',
                        notifications: true
                    }
                };
                updateLastActivity(state);
                console.log('✓ User session created');
            },
            // Compensation: clear user session on failure
            async (state: AppState, payload: LoginPayload) => {
                clearUserSession(state);
                console.log('↩️ User session cleared');
            }
        );

    return transaction;
}

// Type-safe transaction: Add to Cart
async function createAddToCartTransaction() {
    const transaction = saga
        .createTransaction<AddToCartPayload>('add-to-cart')
        .addStep(
            'validate-user',
            async (state: AppState, payload) => {
                validateUserLoggedIn(state);
                validateAddToCartPayload(payload);
            }
        )
        .addStep(
            'validate-product',
            async (state: AppState, payload) => {
                if (payload.quantity <= 0) {
                    throw new Error('Quantity must be positive');
                }
                if (payload.price <= 0) {
                    throw new Error('Price must be positive');
                }
                console.log(`✓ Adding ${payload.quantity}x ${payload.productId} to cart`);
            }
        )
        .addStep(
            'add-to-cart',
            async (state: AppState, payload) => {
                const existingItem = state.cart.find(item => item.productId === payload.productId);

                if (existingItem) {
                    existingItem.quantity += payload.quantity;
                } else {
                    state.cart.push({
                        productId: payload.productId,
                        quantity: payload.quantity,
                        price: payload.price
                    });
                }

                updateLastActivity(state);
                console.log('✓ Item added to cart');
            },
            // Compensation: remove item from cart
            async (state: AppState, payload: AddToCartPayload) => {
                const index = state.cart.findIndex(item => item.productId === payload.productId);
                if (index > -1) {
                    const item = state.cart[index];
                    if (item.quantity > payload.quantity) {
                        item.quantity -= payload.quantity;
                    } else {
                        state.cart.splice(index, 1);
                    }
                }
                console.log('↩️ Item removed from cart');
            }
        );

    return transaction;
}

// Type-safe transaction: Checkout
async function createCheckoutTransaction() {
    const transaction = saga
        .createTransaction<CheckoutPayload>('checkout')
        .addStep(
            'validate-prerequisites',
            async (state, payload) => {
                validateUserLoggedIn(state);

                if (state.cart.length === 0) {
                    throw new Error('Cart is empty');
                }

                const total = state.cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
                if (state.balance < total) {
                    throw new Error(`Insufficient balance. Required: ${total}, Available: ${state.balance}`);
                }

                console.log(`✓ Checkout validation passed. Total: ${total}`);
            }
        )
        .addStep(
            'process-payment',
            async (state, payload) => {
                const total = state.cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);

                // Simulate payment processing
                if (Math.random() < 0.1) { // 10% chance of payment failure
                    throw new Error('Payment processing failed');
                }

                state.balance -= total;
                console.log(`✓ Payment processed: ${payload.paymentMethod}`);
            },
            // Compensation: refund payment
            async (state, payload: CheckoutPayload) => {
                const total = state.cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
                state.balance += total;
                console.log(`↩️ Payment refunded: ${total}`);
            }
        )
        .addStep(
            'create-order',
            async (state, payload) => {
                const total = state.cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
                const orderId = `order_${Date.now()}`;

                const order: typeof state.orders[0] = {
                    id: orderId,
                    total,
                    status: 'pending',
                    items: [...state.cart] // Copy cart items
                };

                state.orders.push(order);
                state.cart = []; // Clear cart
                updateLastActivity(state);

                console.log(`✓ Order created: ${orderId}`);
            },
            // Compensation: remove order and restore cart
            async (state: AppState, payload: CheckoutPayload) => {
                // Find and remove the most recent order
                if (state.orders.length > 0) {
                    const lastOrder = state.orders.pop()!;
                    state.cart = [...lastOrder.items]; // Restore cart
                    console.log(`↩️ Order cancelled: ${lastOrder.id}`);
                }
            }
        );

    return transaction;
}

// Demo function showcasing type safety
async function runTypeSafeDemo() {
    console.log('🚀 Type-Safe Staga Demo\n');

    console.log('Initial state:', JSON.stringify(saga.getState(), null, 2));

    try {
        console.log('\n--- User Login ---');
        const loginTx = await createLoginTransaction();
        await loginTx.run({
            email: 'john@example.com',
            password: 'password123',
            userData: {
                id: 'user_1',
                name: 'John Doe',
                email: 'john@example.com'
            }
        });

        console.log('\n--- Add Items to Cart ---');
        const addToCartTx = await createAddToCartTransaction();

        await addToCartTx.run({
            productId: 'laptop_1',
            quantity: 1,
            price: 999.99
        });

        await addToCartTx.run({
            productId: 'mouse_1',
            quantity: 2,
            price: 29.99
        });

        console.log('\n--- Checkout ---');
        const checkoutTx = await createCheckoutTransaction();
        await checkoutTx.run({
            paymentMethod: 'card',
            shippingAddress: {
                street: '123 Main St',
                city: 'New York',
                zipCode: '10001'
            }
        });

        console.log('\n--- Final State ---');
        const finalState = saga.getState();
        console.log('User:', finalState.user?.name);
        console.log('Cart items:', finalState.cart.length);
        console.log('Orders:', finalState.orders.length);
        console.log('Balance:', finalState.balance);

        console.log('\n--- Testing Undo/Redo ---');
        saga.undo(); // Undo checkout
        console.log('After undo - Orders:', saga.getState().orders.length);
        console.log('After undo - Cart items:', saga.getState().cart.length);

        saga.redo(); // Redo checkout
        console.log('After redo - Orders:', saga.getState().orders.length);
        console.log('After redo - Cart items:', saga.getState().cart.length);

    } catch (error) {
        console.error('Transaction failed:', error);
    }

    console.log('\n✨ Type-safe demo completed!');
}

// Export for use in other examples
export {
    saga,
    createLoginTransaction,
    createAddToCartTransaction,
    createCheckoutTransaction,
    runTypeSafeDemo
};

// Run demo if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
    runTypeSafeDemo().catch(console.error).finally(() => saga.dispose());
}