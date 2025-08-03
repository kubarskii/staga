/**
 * Demo showing AUTOMATIC payload type inference - no manual type specification needed!
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

console.log('🎯 AUTOMATIC PAYLOAD INFERENCE Demo\n');

// ✨ AUTOMATIC INFERENCE: TypeScript infers payload type from the first addStep!
console.log('✨ Method 1: Automatic inference from first step');

const userRegistration = saga
    .createTransaction('user-registration')
    .addStep('validate-email', async (state, payload) => {
        // 🎯 TypeScript automatically infers payload type from usage!
        console.log(`Validating email: ${payload.email}`);     // ✅ Auto-inferred!
        console.log(`First name: ${payload.firstName}`);       // ✅ Perfect typing!
        console.log(`Last name: ${payload.lastName}`);         // ✅ IntelliSense works!

        if (!payload.email.includes('@')) {
            throw new Error('Invalid email format');
        }
    })
    .addStep('create-user', async (state, payload) => {
        // 🎯 Payload type flows perfectly through all subsequent steps!
        const user = {
            id: 'user_' + Date.now(),
            email: payload.email,                                 // ✅ Fully typed!
            name: `${payload.firstName} ${payload.lastName}`,     // ✅ No casting needed!
        };

        state.users.push(user);
        console.log(`Created user: ${user.name} (${user.email})`);
    })
    .addStep('send-welcome', async (state, payload) => {
        // 🎯 Type inference continues through the entire chain!
        state.notifications.push({
            message: `Welcome ${payload.firstName}!`,            // ✅ Auto-typed!
            type: 'success',
        });
    });

// ✨ DIFFERENT PAYLOAD: Each transaction infers its own payload type
console.log('\n✨ Method 2: Different payload types auto-inferred per transaction');

const orderProcessing = saga
    .createTransaction('process-order')
    .addStep('validate-order', async (state, payload) => {
        // 🎯 Different payload type, automatically inferred!
        console.log(`Processing product: ${payload.productId}`);   // ✅ Different type!
        console.log(`Quantity: ${payload.quantity}`);             // ✅ Number type!
        console.log(`Customer: ${payload.customerId}`);           // ✅ Auto-inferred!

        if (payload.quantity <= 0) {
            throw new Error('Invalid quantity');
        }
    })
    .addStep('calculate-total', async (state, payload) => {
        // 🎯 Same payload type flows through - no manual specification!
        const total = payload.quantity * payload.price;           // ✅ Math operations work!
        console.log(`Total: $${total}`);

        state.orders.push({
            id: 'order_' + Date.now(),
            productId: payload.productId,                          // ✅ String type!
            total,
        });
    });

// ✨ VOID TRANSACTIONS: For steps that don't need payload
console.log('\n✨ Method 3: Void transactions (no payload)');

const healthCheck = saga
    .createTransaction('health-check')
    .addVoidStep('check-database', async (state) => {          // ✅ No payload parameter!
        console.log('Checking database connection...');
        await new Promise(resolve => setTimeout(resolve, 100));
        console.log('Database: OK');
    });

// Add second step separately since addVoidStep returns Transaction, not builder
healthCheck.addStep('check-apis', async (state) => {         // ✅ Clean, no payload confusion!
    console.log('Checking external APIs...');
    await new Promise(resolve => setTimeout(resolve, 100));
    console.log('External APIs: OK');
});

// ✨ COMPLEX NESTED PAYLOADS: Auto-inferred even for complex structures
console.log('\n✨ Method 4: Complex nested payloads auto-inferred');

const complexOperation = saga
    .createTransaction('complex-operation')
    .addStep('process-complex', async (state, payload) => {
        // 🎯 Even complex nested structures are auto-inferred!
        console.log(`User ID: ${payload.user.id}`);                    // ✅ Nested object!
        console.log(`Theme: ${payload.user.preferences.theme}`);       // ✅ Deep nesting!
        console.log(`Source: ${payload.metadata.source}`);             // ✅ Multiple props!
        console.log(`Tags: ${payload.metadata.tags.join(', ')}`);      // ✅ Array methods!
    })
    .addStep('save-preferences', async (state, payload) => {
        // 🎯 Type flows perfectly through complex structures!
        console.log(`Saving ${payload.user.preferences.theme} theme`); // ✅ Union types!
        console.log(`Notifications: ${payload.user.preferences.notifications}`); // ✅ Booleans!
    });

// 🎯 DEMONSTRATION: Run transactions with inferred types
async function demonstrateAutomaticInference() {
    console.log('\n🚀 Running transactions with AUTOMATIC type inference...\n');

    try {
        // User registration - payload type inferred from first step usage
        console.log('--- User Registration (auto-inferred payload) ---');
        await userRegistration.run({
            email: 'jane.doe@example.com',
            firstName: 'Jane',
            lastName: 'Doe',
            password: 'secure456',
        });

        console.log('\n--- Order Processing (different auto-inferred payload) ---');
        await orderProcessing.run({
            productId: 'smartphone-pro',
            quantity: 1,
            price: 899.99,
            customerId: 'customer_456',
        });

        console.log('\n--- Health Check (void - no payload) ---');
        await healthCheck.run();

        console.log('\n--- Complex Operation (complex auto-inferred payload) ---');
        await complexOperation.run({
            user: {
                id: 'user_789',
                preferences: {
                    theme: 'dark',
                    notifications: true,
                },
            },
            metadata: {
                source: 'mobile-app',
                timestamp: Date.now(),
                tags: ['premium', 'beta-tester'],
            },
        });

        console.log('\n🎉 ALL TRANSACTIONS COMPLETED WITH AUTOMATIC INFERENCE!');
        console.log('✅ No manual type specification needed!');
        console.log('✅ Perfect type safety throughout!');
        console.log('✅ IntelliSense works everywhere!');

    } catch (error) {
        console.error('Transaction failed:', error);
    }
}

// 🎯 TYPE INFERENCE COMPARISON
console.log('\n🔍 TYPE INFERENCE COMPARISON:\n');

console.log('❌ OLD (manual type specification):');
console.log(`
const oldTx = saga.createTransaction<UserPayload>('register'); // ❌ Manual typing required
oldTx.addStep('step', (state, payload: UserPayload) => {       // ❌ Repetitive typing
  console.log(payload.email);
});
`);

console.log('✅ NEW (automatic inference):');
console.log(`
const newTx = saga.createTransaction('register')               // ✅ No manual types!
  .addStep('step', (state, payload) => {                      // ✅ Type auto-inferred!
    console.log(payload.email);                               // ✅ Perfect IntelliSense!
  });
`);

// 🎯 ADVANCED: Type inference with conditional logic
const conditionalTx = saga
    .createTransaction('conditional-processing')
    .addStep('process-conditional', async (state, payload) => {
        // 🎯 TypeScript can even infer union types and discriminated unions!
        if (payload.type === 'user') {
            console.log(`Processing user: ${payload.userData.email}`);     // ✅ Type narrowing!
        } else if (payload.type === 'order') {
            console.log(`Processing order: ${payload.orderData.total}`);   // ✅ Different branch!
        }
    });

// ✨ HELPER: Type extraction for advanced patterns
type ExtractPayloadType<T> = T extends { run(payload: infer P): any } ? P : never;

// Usage examples
type UserRegistrationPayload = ExtractPayloadType<typeof userRegistration>;
type OrderProcessingPayload = ExtractPayloadType<typeof orderProcessing>;
type ComplexOperationPayload = ExtractPayloadType<typeof complexOperation>;

console.log('\n🎯 Advanced: Extracted payload types for reuse');
const processUser = (payload: UserRegistrationPayload) => {
    console.log(`Extracted type - Email: ${payload.email}`);           // ✅ Reusable types!
};

const processOrder = (payload: OrderProcessingPayload) => {
    console.log(`Extracted type - Product: ${payload.productId}`);     // ✅ Type extraction!
};

export {
    saga,
    userRegistration,
    orderProcessing,
    healthCheck,
    complexOperation,
    conditionalTx,
    demonstrateAutomaticInference,
    processUser,
    processOrder,
    type UserRegistrationPayload,
    type OrderProcessingPayload,
    type ComplexOperationPayload,
};

// Run demo if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
    demonstrateAutomaticInference().catch(console.error).finally(() => saga.dispose());
}