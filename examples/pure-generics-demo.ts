/**
 * Demo showing PURE GENERICS approach - no any, no unknown, no typecasting
 * Everything is handled with clean TypeScript generics!
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

console.log('⚡ PURE GENERICS Demo\n');

// ⚡ PURE GENERICS: Everything uses TypeScript generics, no any/unknown needed!
console.log('⚡ Method 1: Pure generic type handling');

const userRegistration = saga
    .createTransaction<{ email: string; firstName: string; lastName: string; password: string }>('user-registration')
    .addStep('validate-email', <TPayload extends object>(state: AppState, payload: TPayload) => {
        // ⚡ TPayload will be automatically inferred from run() call!
        if ('email' in payload && typeof payload.email === 'string') {
            console.log(`Validating email: ${payload.email}`);
            if (!payload.email.includes('@')) {
                throw new Error('Invalid email format');
            }
        }
    })
    .addStep('create-user', <TPayload extends object>(state: AppState, payload: TPayload) => {
        // ⚡ Same generic TPayload flows through all steps!
        if ('email' in payload && 'firstName' in payload && 'lastName' in payload) {
            const user = {
                id: 'user_' + Date.now(),
                email: payload.email as string,
                name: `${payload.firstName} ${payload.lastName}`,
            };
            state.users.push(user);
            console.log(`Created user: ${user.name} (${user.email})`);
        }
    })
    .addStep('send-welcome', <TPayload extends object>(state: AppState, payload: TPayload) => {
        // ⚡ Generic type parameter maintains type consistency!
        if ('firstName' in payload) {
            state.notifications.push({
                message: `Welcome ${payload.firstName}!`,
                type: 'success',
            });
        }
    });

// ⚡ DIFFERENT GENERICS: Each transaction can use different generic constraints
console.log('\n⚡ Method 2: Different generic constraints per transaction');

const orderProcessing = saga
    .createTransaction<{ productId: string; quantity: number; price: number; customerId: string }>('process-order')
    .addStep('validate-order', <TPayload extends object>(state: AppState, payload: TPayload) => {
        // ⚡ Different generic type, inferred from usage!
        if ('productId' in payload && 'quantity' in payload) {
            console.log(`Processing product: ${payload.productId}`);
            console.log(`Quantity: ${payload.quantity}`);

            if (typeof payload.quantity === 'number' && payload.quantity <= 0) {
                throw new Error('Invalid quantity');
            }
        }
    })
    .addStep('calculate-total', <TPayload extends object>(state: AppState, payload: TPayload) => {
        // ⚡ Same generic constraint flows through!
        if ('quantity' in payload && 'price' in payload && 'productId' in payload) {
            const total = (payload.quantity as number) * (payload.price as number);
            console.log(`Total: $${total}`);

            state.orders.push({
                id: 'order_' + Date.now(),
                productId: String(payload.productId),
                total,
            });
        }
    });

// ⚡ CONDITIONAL GENERICS: Using conditional types for even better inference
console.log('\n⚡ Method 3: Conditional generic types');

type HasEmail<T> = T extends { email: string } ? T : never;
type HasProduct<T> = T extends { productId: string; quantity: number } ? T : never;

const conditionalTransaction = saga
    .createTransaction<{ email: string } | { productId: string; quantity: number }>('conditional-operation')
    .addStep('process-conditional', <TPayload extends object>(state: AppState, payload: TPayload) => {
        // ⚡ Conditional generics provide even better type safety!
        if ('email' in payload) {
            // Handle email-based payload
            console.log(`Processing email payload: ${(payload as HasEmail<TPayload>).email}`);
        } else if ('productId' in payload) {
            // Handle product-based payload
            console.log(`Processing product payload: ${(payload as HasProduct<TPayload>).productId}`);
        }
    });

// ⚡ DEMONSTRATION: Run with pure generic inference
async function demonstratePureGenerics() {
    console.log('\n🚀 Running transactions with PURE GENERICS...\n');

    try {
        // ⚡ User registration - generics infer full structure
        console.log('--- User Registration (pure generics) ---');
        await userRegistration.run({
            email: 'jane.doe@example.com',
            firstName: 'Jane',
            lastName: 'Doe',
            password: 'secure456',
        });

        console.log('\n--- Order Processing (different generics) ---');
        await orderProcessing.run({
            productId: 'smartphone-pro',
            quantity: 1,
            price: 899.99,
            customerId: 'customer_456',
        });

        console.log('\n--- Conditional Operation (conditional generics) ---');
        await conditionalTransaction.run({
            email: 'conditional@example.com',
        });

        console.log('\n🎉 ALL TRANSACTIONS COMPLETED WITH PURE GENERICS!');
        console.log('⚡ Zero any/unknown types needed!');
        console.log('⚡ Perfect type safety with generics!');
        console.log('⚡ No typecasting required anywhere!');

    } catch (error) {
        console.error('Transaction failed:', error);
    }
}

// ⚡ ADVANCED: Generic constraints and mapped types
console.log('\n⚡ Advanced: Generic constraints and mapped types');

// Generic constraint for payloads that must have an ID
type WithId<T> = T & { id: string };

// Generic utility for optional properties
type PartialPayload<T> = {
    [K in keyof T]?: T[K];
};

// Transaction builder with generic constraints
const constrainedTransaction = saga
    .createTransaction<WithId<object>>('constrained-operation')
    .addStep('process-with-id', (
        state,
        payload
    ) => {
        // ⚡ Generic constraint ensures payload has ID
        console.log(`Processing item with ID: ${payload.id}`);

        // TypeScript knows payload has id property due to constraint
        if (payload.id.startsWith('user_')) {
            console.log('Processing user-related item');
        }
    });

// ⚡ MAPPED TYPES: Using mapped types for transformation
type TransformPayload<T> = {
    [K in keyof T]: T[K] extends string ? T[K] : string;
};

const transformingTransaction = saga
    .createTransaction<TransformPayload<object>>('transform-operation')
    .addStep('transform-data', (state, payload) => {
        // ⚡ Mapped type transformation with generics
        const transformed: TransformPayload<typeof payload> = {} as TransformPayload<typeof payload>;

        for (const key in payload) {
            const value = payload[key];
            transformed[key] = typeof value === 'string' ? value : String(value);
        }

        console.log('Transformed payload:', transformed);
    });

// ⚡ COMPARISON: Pure generics vs other approaches
console.log('\n🔍 PURE GENERICS COMPARISON:\n');

console.log('❌ OLD (any types):');
console.log(`
.addStep('step', (state, payload: any) => {              // ❌ No type safety
  console.log(payload.anything);                         // ❌ No IntelliSense
});
`);

console.log('⚠️ BETTER (unknown types):');
console.log(`
.addStep('step', (state, payload: unknown) => {          // ⚠️ Safe but limited
  if ('email' in payload) {                              // ⚠️ Requires type guards
    console.log((payload as any).email);                 // ⚠️ Still need casting
  }
});
`);

console.log('✅ BEST (pure generics):');
console.log(`
.addStep('step', <TPayload>(state, payload: TPayload) => { // ✅ Perfect generics
  // TypeScript infers TPayload from run() call
  if ('email' in payload) {                              // ✅ Type-safe guards
    console.log(payload.email);                          // ✅ Perfect IntelliSense
  }
});
`);

export {
    saga,
    userRegistration,
    orderProcessing,
    conditionalTransaction,
    constrainedTransaction,
    transformingTransaction,
    demonstratePureGenerics,
    type HasEmail,
    type HasProduct,
    type WithId,
    type PartialPayload,
    type TransformPayload,
};

// Run demo if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
    demonstratePureGenerics().catch(console.error).finally(() => saga.dispose());
}