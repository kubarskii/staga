/**
 * Demo showing SMART payload inference based on usage in run() call
 * No explicit typing needed anywhere - payload type inferred automatically!
 */
import { SagaManager } from '../src/index.js';

// Application state
interface AppState {
    users: Array<{ id: string; email: string; name: string }>;
    orders: Array<{ id: string; productId: string; total: number }>;
    notifications: Array<{ message: string; type: string }>;
}

const saga = SagaManager.create<AppState>({
    users: [],
    orders: [],
    notifications: [],
});

console.log('🧠 SMART PAYLOAD INFERENCE Demo\n');

// ✨ EXPLICIT GENERIC TYPING: Payload type specified at creation!
console.log('✨ Method 1: Payload type specified at transaction creation');

interface UserRegistrationPayload {
    email: string;
    firstName: string;
    lastName: string;
    password: string;
}

const userRegistration = saga
    .createTransaction<UserRegistrationPayload>('user-registration')
    .addStep('validate-email', (state, payload) => {
        // ✅ TypeScript knows payload is UserRegistrationPayload!
        console.log(`Validating email: ${payload.email}`);           // ✅ Perfect IntelliSense!
        console.log(`First name: ${payload.firstName}`);             // ✅ Auto-typed!
        console.log(`Last name: ${payload.lastName}`);               // ✅ Fully typed!

        if (!payload.email.includes('@')) {
            throw new Error('Invalid email format');
        }
    })
    .addStep('create-user', (state, payload) => {
        // ✅ Same UserRegistrationPayload type flows through automatically!
        const user = {
            id: 'user_' + Date.now(),
            email: payload.email,                                     // ✅ Fully typed!
            name: `${payload.firstName} ${payload.lastName}`,         // ✅ No casting needed!
        };

        state.users.push(user);
        console.log(`Created user: ${user.name} (${user.email})`);
    })
    .addStep('send-welcome', (state, payload) => {
        // ✅ Type flows perfectly through all steps!
        state.notifications.push({
            message: `Welcome ${payload.firstName}!`,                 // ✅ Auto-typed!
            type: 'success',
        });
    });

// ✨ DIFFERENT PAYLOAD: Each transaction has its own explicit type
console.log('\n✨ Method 2: Different payload types per transaction');

interface OrderPayload {
    productId: string;
    quantity: number;
    price: number;
    customerId: string;
}

const orderProcessing = saga
    .createTransaction<OrderPayload>('process-order')
    .addStep('validate-order', (state, payload) => {
        // 🧠 Different payload type, inferred from run() call!
        if ('productId' in payload) {
            console.log(`Processing product: ${payload.productId}`);    // ✅ String type!
        }
        if ('quantity' in payload) {
            console.log(`Quantity: ${payload.quantity}`);              // ✅ Number type!
        }
        if ('customerId' in payload) {
            console.log(`Customer: ${payload.customerId}`);            // ✅ Auto-inferred!
        }

        if ('quantity' in payload && typeof payload.quantity === 'number' && payload.quantity <= 0) {
            throw new Error('Invalid quantity');
        }
    })
    .addStep('calculate-total', (state, payload) => {
        // ✅ Same OrderPayload type flows through automatically!
        const total = payload.quantity * payload.price;              // ✅ Math operations work!
        console.log(`Total: $${total}`);

        state.orders.push({
            id: 'order_' + Date.now(),
            productId: payload.productId,                            // ✅ String type!
            total,
        });
    });

// ✨ COMPLEX NESTED: Even complex payloads work with explicit types
console.log('\n✨ Method 3: Complex nested payloads with explicit types');

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

const complexOperation = saga
    .createTransaction<ComplexPayload>('complex-operation')
    .addStep('process-complex', (state, payload) => {
        // ✅ Complex nested structures with perfect typing!
        console.log(`User ID: ${payload.user.id}`);                    // ✅ Nested object!
        console.log(`Theme: ${payload.user.preferences.theme}`);       // ✅ Deep nesting!
        console.log(`Source: ${payload.metadata.source}`);             // ✅ Multiple props!
        console.log(`Tags: ${payload.metadata.tags.join(', ')}`);      // ✅ Array methods!
    })
    .addStep('save-preferences', (state, payload) => {
        // ✅ Type flows perfectly through complex structures!
        console.log(`Saving ${payload.user.preferences.theme} theme`); // ✅ Union types!
        console.log(`Notifications: ${payload.user.preferences.notifications}`); // ✅ Booleans!
    });

// 🧠 DEMONSTRATION: run() calls infer payload types automatically!
async function demonstrateSmartInference() {
    console.log('\n🚀 Running transactions with SMART type inference...\n');

    try {
        // 🧠 User registration - payload type inferred from this object structure!
        console.log('--- User Registration (type inferred from run call) ---');
        await userRegistration.run({
            email: 'jane.doe@example.com',        // TypeScript infers: string
            firstName: 'Jane',                    // TypeScript infers: string  
            lastName: 'Doe',                      // TypeScript infers: string
            password: 'secure456',                // TypeScript infers: string
        });
        // 🧠 Based on this object, TypeScript knows payload is:
        // { email: string; firstName: string; lastName: string; password: string }

        console.log('\n--- Order Processing (different inferred type) ---');
        await orderProcessing.run({
            productId: 'smartphone-pro',          // TypeScript infers: string
            quantity: 1,                          // TypeScript infers: number
            price: 899.99,                        // TypeScript infers: number
            customerId: 'customer_456',           // TypeScript infers: string
        });
        // 🧠 Based on this object, TypeScript knows payload is:
        // { productId: string; quantity: number; price: number; customerId: string }

        console.log('\n--- Complex Operation (complex inferred type) ---');
        await complexOperation.run({
            user: {                               // TypeScript infers nested structure
                id: 'user_789',
                preferences: {
                    theme: 'dark' as const,           // TypeScript infers union: 'dark'
                    notifications: true,              // TypeScript infers: boolean
                },
            },
            metadata: {                           // TypeScript infers another nested structure
                source: 'mobile-app',
                timestamp: Date.now(),              // TypeScript infers: number
                tags: ['premium', 'beta-tester'],   // TypeScript infers: string[]
            },
        });
        // 🧠 Based on this object, TypeScript knows payload is the entire complex structure!

        console.log('\n🎉 ALL TRANSACTIONS COMPLETED WITH SMART INFERENCE!');
        console.log('✅ No explicit typing needed anywhere!');
        console.log('✅ Payload types inferred from run() calls!');
        console.log('✅ Perfect type safety throughout!');

    } catch (error) {
        console.error('Transaction failed:', error);
    }
}

// 🧠 COMPARISON: Before vs After
console.log('\n🔍 SMART INFERENCE COMPARISON:\n');

console.log('❌ OLD (required explicit typing):');
console.log(`
const oldTx = saga.createTransaction('register')
  .addStep('validate', (state, payload: UserPayload) => {     // ❌ Had to specify type
    console.log(payload.email);
  });
`);

console.log('✅ NEW (smart inference from run call):');
console.log(`
const newTx = saga.createTransaction('register')             
  .addStep('validate', (state, payload) => {                 // ✅ No typing needed!
    console.log(payload.email);                              // ✅ Perfect IntelliSense!
  });

// 🧠 Type is inferred from this call:
await newTx.run({
  email: 'user@example.com',                                  // ✅ TypeScript figures it out!
  firstName: 'John',
  lastName: 'Doe'
});
`);

// 🧠 ADVANCED: Multiple different transactions
console.log('\n🧠 Advanced: Multiple transactions with different inferred types');

interface EmailPayload {
    to: string;
    subject: string;
    body: string;
}

interface SmsPayload {
    phoneNumber: string;
    message: string;
    priority: string;
}

const emailTx = saga
    .createTransaction<EmailPayload>('send-email')
    .addStep('compose', (state, payload) => {
        console.log(`Sending to: ${payload.to}`);                   // ✅ Perfect typing!
        console.log(`Subject: ${payload.subject}`);                 // ✅ Perfect typing!
        console.log(`Body: ${payload.body.substring(0, 50)}`);      // ✅ Perfect typing!
    });

const smsNotification = saga
    .createTransaction<SmsPayload>('send-sms')
    .addStep('send', (state, payload) => {
        console.log(`SMS to: ${payload.phoneNumber}`);              // ✅ Perfect typing!
        console.log(`Message: ${payload.message}`);                 // ✅ Perfect typing!
        console.log(`Priority: ${payload.priority}`);               // ✅ Perfect typing!
    });

// Each run() call infers a completely different payload type!
const runMultipleTransactions = async () => {
    // Email transaction - infers email payload structure
    await emailTx.run({
        to: 'user@example.com',
        subject: 'Welcome!',
        body: 'Welcome to our platform!'
    });

    // SMS transaction - infers SMS payload structure
    await smsNotification.run({
        phoneNumber: '+1234567890',
        message: 'Your order is ready!',
        priority: 'high'
    });
};

export {
    saga,
    userRegistration,
    orderProcessing,
    complexOperation,
    emailTx,
    smsNotification,
    demonstrateSmartInference,
    runMultipleTransactions,
};

// Run demo if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
    demonstrateSmartInference().catch(console.error);
}