/**
 * Payload inference demo showcasing type-safe event handling with inferred payload types
 */
import {
    SagaManager,
    createEvent,
    isEventType,
    matchEvent,
    createEventHandler,
    type TransactionStartEvent,
    type StepSuccessEvent,
    type ExtractEventPayload
} from '../src/index.js';

// Define specific payload types for different operations
interface LoginPayload {
    email: string;
    password: string;
    rememberMe: boolean;
}

interface PurchasePayload {
    productId: string;
    quantity: number;
    price: number;
    paymentMethod: 'card' | 'paypal';
}

interface NotificationPayload {
    message: string;
    type: 'info' | 'success' | 'error' | 'warning';
    userId?: string;
}

// Application state
interface AppState {
    user: { id: string; email: string } | null;
    purchases: Array<{ id: string; productId: string; total: number }>;
    notifications: NotificationPayload[];
}

const initialState: AppState = {
    user: null,
    purchases: [],
    notifications: [],
};

const saga = SagaManager.create(initialState);

// 🎯 Type-safe event creation with payload inference
console.log('🎯 Creating type-safe events with payload inference\n');

// Create events with inferred payload types
const loginStartEvent = createEvent.transactionStart('user-login', {
    email: 'user@example.com',
    password: 'secure123',
    rememberMe: true,
} satisfies LoginPayload);

const purchaseSuccessEvent = createEvent.stepSuccess('process-payment', {
    productId: 'laptop-pro',
    quantity: 1,
    price: 1299.99,
    paymentMethod: 'card',
} satisfies PurchasePayload, 1500);

const notificationEvent = createEvent.transactionComplete('send-notification', {
    message: 'Welcome to our platform!',
    type: 'success',
    userId: 'user_123',
} satisfies NotificationPayload, 250);

console.log('✅ Events created with full type inference:');
console.log('- Login event payload:', loginStartEvent.payload.email);
console.log('- Purchase event payload:', purchaseSuccessEvent.payload.productId);
console.log('- Notification event payload:', notificationEvent.payload.type);
console.log();

// 🎯 Type-safe event listeners with payload inference
console.log('🎯 Setting up type-safe event listeners\n');

// Method 1: Direct typed event listeners
saga.onEvent('transaction:start', (event: TransactionStartEvent<LoginPayload>) => {
    console.log(`🚀 Login started for: ${event.payload.email}`);
    console.log(`   Remember me: ${event.payload.rememberMe}`);
});

saga.onEvent('step:success', (event: StepSuccessEvent<PurchasePayload>) => {
    console.log(`💰 Purchase completed: ${event.payload.productId}`);
    console.log(`   Quantity: ${event.payload.quantity}, Total: $${event.payload.price}`);
    console.log(`   Payment: ${event.payload.paymentMethod}`);
});

// Method 2: Using type guards with payload inference
saga.onAnyEvent((event) => {
    if (event.type === 'transaction:start' && typeof event.payload === 'object' && event.payload && 'email' in event.payload) {
        // TypeScript knows this has email property
        console.log(`🔐 Login attempt: ${(event.payload as LoginPayload).email}`);
    }

    if (event.type === 'step:success' && typeof event.payload === 'object' && event.payload && 'productId' in event.payload) {
        // TypeScript knows this has productId property
        console.log(`✅ Step succeeded: ${event.stepName} for product ${(event.payload as PurchasePayload).productId}`);
    }

    if (event.type === 'transaction:complete' && typeof event.payload === 'object' && event.payload && 'message' in event.payload) {
        // TypeScript knows this has message property
        console.log(`📧 Notification: ${(event.payload as NotificationPayload).message} (${(event.payload as NotificationPayload).type})`);
    }
});

// Method 3: Pattern matching with payload inference
saga.onAnyEvent((event) => {
    matchEvent(event)
        .onTransactionStart((e) => {
            if (typeof e.payload === 'object' && e.payload && 'email' in e.payload) {
                console.log(`🎬 Transaction starting: ${e.transactionName}`);
                console.log(`   User: ${(e.payload as LoginPayload).email}`);
            }
        })
        .onStepSuccess((e) => {
            if (typeof e.payload === 'object' && e.payload && 'productId' in e.payload) {
                console.log(`⭐ Step completed: ${e.stepName} in ${e.duration}ms`);
                console.log(`   Product: ${(e.payload as PurchasePayload).productId} x${(e.payload as PurchasePayload).quantity}`);
            }
        })
        .onTransactionComplete((e) => {
            console.log(`🏁 Transaction completed: ${e.transactionName} in ${e.duration}ms`);
        })
        .execute();
});

// 🎯 Type extraction utilities
console.log('🎯 Demonstrating type extraction utilities\n');

// Extract payload type from event
type LoginEventPayload = ExtractEventPayload<typeof loginStartEvent>;
type PurchaseEventPayload = ExtractEventPayload<typeof purchaseSuccessEvent>;

// Use extracted types
const processLogin = (payload: LoginEventPayload) => {
    console.log(`Processing login for: ${payload.email}`);
    console.log(`Remember me setting: ${payload.rememberMe}`);
};

const processPurchase = (payload: PurchaseEventPayload) => {
    console.log(`Processing purchase: ${payload.productId}`);
    console.log(`Amount: $${payload.price * payload.quantity}`);
};

// 🎯 Type-safe event handler creation
console.log('🎯 Creating type-safe event handlers\n');

const loginHandlers = createEventHandler<LoginPayload>();
const purchaseHandlers = createEventHandler<PurchasePayload>();

// Register handlers with full type safety
const loginStartHandler = loginHandlers.transaction.onStart((event) => {
    console.log(`🔑 Login handler - Email: ${event.payload.email}`);
    console.log(`   Timestamp: ${new Date(event.timestamp).toISOString()}`);
});

const purchaseSuccessHandler = purchaseHandlers.step.onSuccess((event) => {
    console.log(`💳 Purchase handler - Product: ${event.payload.productId}`);
    console.log(`   Duration: ${event.duration}ms`);
    console.log(`   Method: ${event.payload.paymentMethod}`);
});

// 🎯 Demo transaction with type-safe payload handling
async function runPayloadInferenceDemo() {
    console.log('🎯 Running payload inference demo with actual transactions\n');

    // Create a login transaction
    const loginTransaction = saga
        .createTransaction<LoginPayload>('user-login')
        .addStep('validate-credentials', async (state: AppState, payload: LoginPayload) => {
            console.log(`Validating credentials for: ${payload.email}`);

            if (!payload.email.includes('@')) {
                throw new Error('Invalid email format');
            }

            // Simulate validation delay
            await new Promise(resolve => setTimeout(resolve, 500));

            state.user = {
                id: 'user_' + Date.now(),
                email: payload.email,
            };
        })
        .addStep('setup-session', async (state: AppState, payload: LoginPayload) => {
            console.log(`Setting up session (remember: ${payload.rememberMe})`);

            // Add welcome notification
            state.notifications.push({
                message: `Welcome back, ${payload.email}!`,
                type: 'success',
                userId: state.user!.id,
            });
        });

    // Create a purchase transaction
    const purchaseTransaction = saga
        .createTransaction<PurchasePayload>('make-purchase')
        .addStep('validate-payment', async (state: AppState, payload: PurchasePayload) => {
            if (!state.user) {
                throw new Error('User must be logged in');
            }

            console.log(`Validating payment for: ${payload.productId}`);
            console.log(`Amount: $${payload.price * payload.quantity}`);

            if (payload.price <= 0) {
                throw new Error('Invalid price');
            }
        })
        .addStep('process-payment', async (state: AppState, payload: PurchasePayload) => {
            console.log(`Processing ${payload.paymentMethod} payment...`);

            // Simulate payment processing
            await new Promise(resolve => setTimeout(resolve, 1000));

            const purchase = {
                id: 'purchase_' + Date.now(),
                productId: payload.productId,
                total: payload.price * payload.quantity,
            };

            state.purchases.push(purchase);

            // Add success notification
            state.notifications.push({
                message: `Purchase completed: ${payload.productId}`,
                type: 'success',
                userId: state.user!.id,
            });
        });

    try {
        // Execute login with type-safe payload
        console.log('--- Executing Login Transaction ---');
        await loginTransaction.run({
            email: 'demo@example.com',
            password: 'secure123',
            rememberMe: true,
        });

        console.log('\n--- Executing Purchase Transaction ---');
        await purchaseTransaction.run({
            productId: 'laptop-pro',
            quantity: 1,
            price: 1299.99,
            paymentMethod: 'card',
        });

        console.log('\n--- Final State ---');
        const finalState = saga.getState();
        console.log('User:', finalState.user?.email);
        console.log('Purchases:', finalState.purchases.length);
        console.log('Notifications:', finalState.notifications.map(n => n.message));

    } catch (error) {
        console.error('Transaction failed:', error);
    }
}

// 🎯 Advanced payload inference patterns
console.log('🎯 Advanced payload inference patterns\n');

// Union type payloads
type UnionPayload = LoginPayload | PurchasePayload | NotificationPayload;

saga.onAnyEvent((event) => {
    // Type narrowing with union payloads
    if (event.type === 'transaction:start') {
        if (typeof event.payload === 'object' && event.payload && 'email' in event.payload) {
            // TypeScript narrows to LoginPayload
            console.log(`Union payload - Login: ${(event.payload as LoginPayload).email}`);
        } else if (typeof event.payload === 'object' && event.payload && 'productId' in event.payload) {
            // TypeScript narrows to PurchasePayload
            console.log(`Union payload - Purchase: ${(event.payload as PurchasePayload).productId}`);
        } else if (typeof event.payload === 'object' && event.payload && 'message' in event.payload) {
            // TypeScript narrows to NotificationPayload
            console.log(`Union payload - Notification: ${(event.payload as NotificationPayload).message}`);
        }
    }
});

// Conditional type inference
type ConditionalPayload<T extends string> =
    T extends 'login' ? LoginPayload :
    T extends 'purchase' ? PurchasePayload :
    T extends 'notify' ? NotificationPayload :
    never;

function handleEventByType<T extends 'login' | 'purchase' | 'notify'>(
    type: T,
    payload: ConditionalPayload<T>
) {
    switch (type) {
        case 'login':
            // TypeScript knows payload is LoginPayload
            console.log(`Conditional - Login: ${(payload as LoginPayload).email}`);
            break;
        case 'purchase':
            // TypeScript knows payload is PurchasePayload
            console.log(`Conditional - Purchase: ${(payload as PurchasePayload).productId}`);
            break;
        case 'notify':
            // TypeScript knows payload is NotificationPayload
            console.log(`Conditional - Notify: ${(payload as NotificationPayload).message}`);
            break;
    }
}

console.log('\n🎉 Payload inference demo setup complete!');
console.log('All event listeners are now type-safe with inferred payload types.\n');

// Export for use in other examples
export {
    saga,
    loginStartEvent,
    purchaseSuccessEvent,
    notificationEvent,
    processLogin,
    processPurchase,
    runPayloadInferenceDemo,
    type LoginPayload,
    type PurchasePayload,
    type NotificationPayload,
    type ConditionalPayload
};

// Run demo if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
    runPayloadInferenceDemo().catch(console.error);
}