/**
 * Demo showing NO MORE UNKNOWN PAYLOADS in addStep!
 */
import { SagaManager, TransactionBuilder } from '../src/index.js';

// Define specific payload types
interface UserRegistrationPayload {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
}

interface OrderPayload {
    productId: string;
    quantity: number;
    customerId: string;
}

interface EmailPayload {
    to: string;
    subject: string; 
    body: string;
}

// Application state
interface AppState {
    users: Array<{ id: string; email: string; name: string }>;
    orders: Array<{ id: string; productId: string; total: number }>;
    emails: Array<{ id: string; to: string; sent: boolean }>;
}

const saga = SagaManager.create<AppState>({
    users: [],
    orders: [],
    emails: [],
});

console.log('🎯 NO MORE UNKNOWN PAYLOADS Demo\n');

// ❌ OLD WAY (would default to unknown):
// const badTransaction = saga.createTransaction('bad'); // TPayload = unknown
// badTransaction.addStep('step', (state, payload) => {
//   // payload would be 'unknown' - terrible!
// });

// ✅ NEW WAY 1: Explicit payload type specification
console.log('✅ Method 1: Explicit payload type specification');
const userRegistrationTx = saga
    .createTransaction<UserRegistrationPayload>('user-registration')
    .addStep('validate-email', async (state, payload) => {
        // 🎯 payload is PERFECTLY TYPED as UserRegistrationPayload!
        console.log(`Validating email: ${payload.email}`);
        console.log(`First name: ${payload.firstName}`);
        console.log(`Last name: ${payload.lastName}`);

        if (!payload.email.includes('@')) {
            throw new Error('Invalid email format');
        }
    })
    .addStep('create-user', async (state, payload) => {
        // 🎯 payload is STILL perfectly typed!
        const user = {
            id: 'user_' + Date.now(),
            email: payload.email,
            name: `${payload.firstName} ${payload.lastName}`,
        };

        state.users.push(user);
        console.log(`Created user: ${user.name} (${user.email})`);
    })
    .addStep('send-welcome-email', async (state, payload) => {
        // 🎯 payload type flows perfectly through all steps!
        console.log(`Sending welcome email to: ${payload.email}`);

        state.emails.push({
            id: 'email_' + Date.now(),
            to: payload.email,
            sent: true,
        });
    });

// ✅ NEW WAY 2: Using createTypedTransaction helper
console.log('\n✅ Method 2: Using createTypedTransaction helper');
const orderProcessingTx = saga
    .createTypedTransaction<OrderPayload>('process-order')
    .addStep('validate-order', async (state, payload) => {
        // 🎯 payload is perfectly typed as OrderPayload!
        console.log(`Processing order for product: ${payload.productId}`);
        console.log(`Quantity: ${payload.quantity}`);
        console.log(`Customer: ${payload.customerId}`);

        if (payload.quantity <= 0) {
            throw new Error('Invalid quantity');
        }
    })
    .addStep('create-order', async (state, payload) => {
        // 🎯 No unknown types anywhere!
        const order = {
            id: 'order_' + Date.now(),
            productId: payload.productId,
            total: payload.quantity * 29.99, // Example price
        };

        state.orders.push(order);
        console.log(`Created order: ${order.id} for $${order.total}`);
    });

// ✅ NEW WAY 3: For transactions with no payload
console.log('\n✅ Method 3: Void transactions (no payload)');
const healthCheckTx = saga
    .createTransaction<void>('health-check') // Explicit void type
    .addStep('check-database', async (state) => {
        // 🎯 No payload parameter - perfect for void transactions!
        console.log('Checking database connection...');
        // Simulate health check
        await new Promise(resolve => setTimeout(resolve, 100));
        console.log('Database: OK');
    })
    .addStep('check-external-apis', async (state) => {
        // 🎯 Clean, no unused payload parameter!
        console.log('Checking external APIs...');
        await new Promise(resolve => setTimeout(resolve, 100));
        console.log('External APIs: OK');
    });

// Alternative explicit void transaction
const cleanupTx = saga
    .createVoidTransaction('cleanup') // Explicit void helper
    .addStep('clear-cache', async (state) => {
        console.log('Clearing cache...');
    })
    .addStep('log-cleanup', async (state) => {
        console.log('Cleanup completed');
    });

// ✅ NEW WAY 4: Complex payload with nested types
console.log('\n✅ Method 4: Complex nested payload types');
interface ComplexPayload {
    user: {
        id: string;
        preferences: {
            theme: 'light' | 'dark';
            notifications: boolean;
        };
    };
    metadata: {
        source: string;
        timestamp: number;
        tags: string[];
    };
}

const complexTx = saga
    .createTransaction<ComplexPayload>('complex-operation')
    .addStep('process-user-data', async (state, payload) => {
        // 🎯 Perfect intellisense for nested object properties!
        console.log(`User ID: ${payload.user.id}`);
        console.log(`Theme: ${payload.user.preferences.theme}`);
        console.log(`Notifications: ${payload.user.preferences.notifications}`);
        console.log(`Source: ${payload.metadata.source}`);
        console.log(`Tags: ${payload.metadata.tags.join(', ')}`);
    });

// 🎯 DEMONSTRATION: Run the transactions
async function demonstrateNoUnknownPayloads() {
    console.log('\n🚀 Running transactions with PERFECT type safety...\n');

    try {
        // User registration with full type safety
        await userRegistrationTx.run({
            email: 'john.doe@example.com',
            password: 'secure123',
            firstName: 'John',
            lastName: 'Doe',
        });

        console.log('\n---');

        // Order processing with perfect payload typing
        await orderProcessingTx.run({
            productId: 'laptop-pro',
            quantity: 2,
            customerId: 'customer_123',
        });

        console.log('\n---');

        // Health check with no payload confusion
        await healthCheckTx.run(undefined); // Explicit undefined for void

        console.log('\n---');

        // Complex payload with nested type safety
        await complexTx.run({
            user: {
                id: 'user_456',
                preferences: {
                    theme: 'dark',
                    notifications: true,
                },
            },
            metadata: {
                source: 'web-app',
                timestamp: Date.now(),
                tags: ['premium', 'early-adopter'],
            },
        });

        console.log('\n🎉 ALL TRANSACTIONS COMPLETED WITH PERFECT TYPE SAFETY!');
        console.log('✅ No unknown payloads anywhere!');
        console.log('✅ Perfect IntelliSense in all steps!');
        console.log('✅ Compile-time validation of all payloads!');

    } catch (error) {
        console.error('Transaction failed:', error);
    }
}

// 🎯 Type safety comparison
console.log('\n🔍 TYPE SAFETY COMPARISON:\n');

console.log('❌ OLD (with unknown):');
console.log(`
const badTx = saga.createTransaction('bad'); // TPayload = unknown ❌
badTx.addStep('step', (state, payload) => {
  // payload is 'unknown' - have to cast everything! ❌
  const data = payload as SomeType;
  console.log(data.someProperty); // No IntelliSense ❌
});
`);

console.log('✅ NEW (perfectly typed):');
console.log(`
const goodTx = saga.createTransaction<UserPayload>('good'); // TPayload = UserPayload ✅
goodTx.addStep('step', (state, payload) => {
  // payload is perfectly typed as UserPayload! ✅
  console.log(payload.email); // Perfect IntelliSense! ✅
  console.log(payload.firstName); // Compile-time validation! ✅
});
`);

// 🎯 Advanced: Conditional payload types
type ActionPayload<T extends string> =
    T extends 'register' ? UserRegistrationPayload :
    T extends 'order' ? OrderPayload :
    T extends 'email' ? EmailPayload :
    never;

function createActionTransaction<T extends 'register' | 'order' | 'email'>(
    action: T
): TransactionBuilder<AppState, ActionPayload<T>> {
    return saga.createTransaction<ActionPayload<T>>(`action-${action}`);
}

// Usage with perfect type inference
const registerTx = createActionTransaction('register'); // Infers UserRegistrationPayload
const orderTx = createActionTransaction('order'); // Infers OrderPayload
const emailTx = createActionTransaction('email'); // Infers EmailPayload

export {
    saga,
    userRegistrationTx,
    orderProcessingTx,
    healthCheckTx,
    complexTx,
    demonstrateNoUnknownPayloads,
    createActionTransaction,
    type UserRegistrationPayload,
    type OrderPayload,
    type EmailPayload,
    type ComplexPayload,
    type ActionPayload,
};

// Run demo if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
    demonstrateNoUnknownPayloads().catch(console.error);
}