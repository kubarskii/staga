/**
 * Complete guide to transaction patterns with different typing approaches
 */
import { SagaManager } from '../src/index.js';

// Define payload types
interface LoginPayload {
    email: string;
    password: string;
    rememberMe?: boolean;
}

interface OrderPayload {
    productId: string;
    quantity: number;
    price: number;
}

interface AppState {
    user: { id: string; email: string } | null;
    orders: Array<{ id: string; total: number }>;
    cart: Array<{ productId: string; quantity: number; price: number }>;
}

const saga = SagaManager.create<AppState>({
    user: null,
    orders: [],
    cart: []
});

console.log('📋 Transaction Patterns Demo\n');

// ✅ PATTERN 1: Explicit payload typing at creation (like your example)
console.log('✅ Pattern 1: Explicit payload typing at creation');

const loginTransaction = saga
    .createTransaction<LoginPayload>('user-login')
    .addStep(
        'validate-payload',
        async (state: AppState, payload: LoginPayload) => {
            // ✅ payload is explicitly typed as LoginPayload
            console.log(`Logging in user: ${payload.email}`);
            console.log(`Remember me: ${payload.rememberMe || false}`);

            if (!payload.email.includes('@')) {
                throw new Error('Invalid email format');
            }
        }
    )
    .addStep(
        'authenticate',
        async (state: AppState, payload: LoginPayload) => {
            // ✅ Same LoginPayload type flows through all steps
            console.log(`Authenticating: ${payload.email}`);

            // Simulate auth
            await new Promise(resolve => setTimeout(resolve, 500));

            state.user = {
                id: 'user_' + Date.now(),
                email: payload.email
            };
        }
    );

// ✅ PATTERN 2: Inferred payload typing (TypeScript infers from function signature)
console.log('\n✅ Pattern 2: Inferred payload typing');

const orderTransaction = saga
    .createTransaction<OrderPayload>('process-order')
    .addStep(
        'validate-order',
        async (state, payload) => {
            // ⚠️ TypeScript might not infer payload type without explicit annotation
            // Better to be explicit: async (state: AppState, payload: OrderPayload)
            console.log(`Processing order for product: ${(payload as OrderPayload).productId}`);
        }
    )
    .addStep(
        'process-payment',
        async (state: AppState, payload: OrderPayload) => {
            // ✅ Explicit typing ensures perfect IntelliSense
            const total = payload.quantity * payload.price;
            console.log(`Payment processed: $${total}`);

            state.orders.push({
                id: 'order_' + Date.now(),
                total
            });
        }
    );

// ✅ PATTERN 3: No explicit payload type (uses unknown, requires type guards)
console.log('\n✅ Pattern 3: Runtime type checking with unknown payload');

const flexibleTransaction = saga
    .createTransaction('flexible-operation')
    .addStep(
        'handle-dynamic-payload',
        async (state: AppState, payload) => {
            // payload is unknown, need type guards
            if (typeof payload === 'object' && payload && 'email' in payload) {
                console.log(`Handling login: ${(payload as LoginPayload).email}`);
            } else if (typeof payload === 'object' && payload && 'productId' in payload) {
                console.log(`Handling order: ${(payload as OrderPayload).productId}`);
            } else {
                console.log('Unknown payload type');
            }
        }
    );

// ✅ PATTERN 4: Mixed approach - explicit state, explicit payload
console.log('\n✅ Pattern 4: Fully explicit typing');

const explicitTransaction = saga
    .createTransaction<LoginPayload>('explicit-login')
    .addStep(
        'step1',
        async (state: AppState, payload: LoginPayload) => {
            // ✅ Both state and payload are explicitly typed
            console.log(`State has ${state.orders.length} orders`);
            console.log(`Payload email: ${payload.email}`);
        }
    );

// 🚀 DEMO: Running the transactions
async function runTransactionPatterns() {
    console.log('\n🚀 Running transaction patterns...\n');

    try {
        // Pattern 1: Explicit payload type
        console.log('--- Pattern 1: Login Transaction ---');
        await loginTransaction.run({
            email: 'user@example.com',
            password: 'secure123',
            rememberMe: true
        });

        // Pattern 2: Inferred payload type
        console.log('\n--- Pattern 2: Order Transaction ---');
        await orderTransaction.run({
            productId: 'laptop-pro',
            quantity: 1,
            price: 1299.99
        });

        // Pattern 3: Dynamic payload
        console.log('\n--- Pattern 3: Flexible Transaction (Login) ---');
        await flexibleTransaction.run({
            email: 'dynamic@example.com',
            password: 'test123'
        });

        console.log('\n--- Pattern 3: Flexible Transaction (Order) ---');
        await flexibleTransaction.run({
            productId: 'mouse-wireless',
            quantity: 2,
            price: 49.99
        });

        // Pattern 4: Fully explicit
        console.log('\n--- Pattern 4: Explicit Transaction ---');
        await explicitTransaction.run({
            email: 'explicit@example.com',
            password: 'explicit123'
        });

        console.log('\n--- Final State ---');
        const finalState = saga.getState();
        console.log('User:', finalState.user?.email);
        console.log('Orders:', finalState.orders.length);

    } catch (error) {
        console.error('Transaction failed:', error);
    }
}

// 📊 COMPARISON: When to use each pattern
console.log('\n📊 When to use each pattern:\n');

console.log('🎯 Pattern 1 (Explicit at creation): createTransaction<PayloadType>()');
console.log('  ✅ Use when: You know the exact payload structure upfront');
console.log('  ✅ Benefits: Compile-time type safety, perfect IntelliSense');
console.log('  ✅ Example: User registration, checkout, specific workflows\n');

console.log('🎯 Pattern 2 (Inferred): Let TypeScript infer from usage');
console.log('  ⚠️  Use when: You prefer implicit typing');
console.log('  ⚠️  Note: May require explicit parameter types for best results\n');

console.log('🎯 Pattern 3 (Dynamic): createTransaction() with type guards');
console.log('  ✅ Use when: Handling multiple payload types in one transaction');
console.log('  ✅ Benefits: Maximum flexibility, runtime type checking');
console.log('  ✅ Example: Generic handlers, API proxies\n');

console.log('🎯 Pattern 4 (Fully explicit): Explicit state + payload types');
console.log('  ✅ Use when: Maximum type safety is required');
console.log('  ✅ Benefits: Zero ambiguity, perfect autocomplete');
console.log('  ✅ Example: Critical business logic, complex state management\n');

// 💡 BEST PRACTICES
console.log('💡 Best Practices:\n');

console.log('1. ✅ Prefer Pattern 1 for most use cases:');
console.log('   saga.createTransaction<PayloadType>().addStep(...)');
console.log();

console.log('2. ✅ Always type your step functions explicitly:');
console.log('   .addStep("name", async (state: AppState, payload: PayloadType) => {})');
console.log();

console.log('3. ✅ Use Pattern 3 for flexible/generic handlers:');
console.log('   if ("email" in payload) { /* handle login */ }');
console.log();

console.log('4. ✅ Consider compensation functions:');
console.log('   .addStep("name", execute, compensate, options)');

export {
    saga,
    loginTransaction,
    orderTransaction,
    flexibleTransaction,
    explicitTransaction,
    runTransactionPatterns,
    type LoginPayload,
    type OrderPayload,
    type AppState
};

// Run demo if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
    runTransactionPatterns().catch(console.error);
}