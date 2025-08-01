/**
 * Demo showing EXPLICIT payload typing with generics at createTransaction level
 * Perfect type safety with upfront payload type specification!
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

console.log('🎯 EXPLICIT PAYLOAD TYPING Demo\n');

// ✨ EXPLICIT PAYLOAD TYPES: Specify payload type at createTransaction level!
console.log('✨ Method 1: Explicit payload typing at creation');

// 🎯 Define payload interfaces upfront
interface UserRegistrationPayload {
    email: string;
    firstName: string;
    lastName: string;
    password: string;
}

interface OrderPayload {
    productId: string;
    quantity: number;
    price: number;
    customerId: string;
}

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

// 🎯 PERFECT TYPING: Payload type specified at transaction creation!
const userRegistration = saga
    .createTransaction<UserRegistrationPayload>('user-registration')  // ✅ Explicit payload type!
    .addStep('validate-email', (state, payload) => {
        // 🎯 Perfect IntelliSense - payload is fully typed as UserRegistrationPayload!
        console.log(`Validating email: ${payload.email}`);           // ✅ TypeScript knows this is string!
        console.log(`First name: ${payload.firstName}`);             // ✅ Perfect autocomplete!
        console.log(`Last name: ${payload.lastName}`);               // ✅ No type guards needed!

        if (!payload.email.includes('@')) {                          // ✅ String methods work perfectly!
            throw new Error('Invalid email format');
        }
    })
    .addStep('create-user', (state, payload) => {
        // 🎯 Same perfect typing flows through all steps!
        const user = {
            id: 'user_' + Date.now(),
            email: payload.email,                                       // ✅ No casting needed!
            name: `${payload.firstName} ${payload.lastName}`,           // ✅ Template literals work!
        };

        state.users.push(user);
        console.log(`Created user: ${user.name} (${user.email})`);
    })
    .addStep('send-welcome', (state, payload) => {
        // 🎯 Type safety throughout!
        state.notifications.push({
            message: `Welcome ${payload.firstName}!`,                   // ✅ Direct property access!
            type: 'success',
        });
    });

// 🎯 DIFFERENT PAYLOAD TYPE: Each transaction can have different explicit types
const orderProcessing = saga
    .createTransaction<OrderPayload>('process-order')              // ✅ Different payload type!
    .addStep('validate-order', (state, payload) => {
        // 🎯 Perfect typing for OrderPayload!
        console.log(`Processing product: ${payload.productId}`);      // ✅ String type!
        console.log(`Quantity: ${payload.quantity}`);                // ✅ Number type!
        console.log(`Customer: ${payload.customerId}`);              // ✅ Auto-typed!

        if (payload.quantity <= 0) {                                 // ✅ Number comparison works!
            throw new Error('Invalid quantity');
        }
    })
    .addStep('calculate-total', (state, payload) => {
        // 🎯 Math operations work perfectly!
        const total = payload.quantity * payload.price;              // ✅ Number * Number!
        console.log(`Total: $${total.toFixed(2)}`);                  // ✅ Number methods!

        state.orders.push({
            id: 'order_' + Date.now(),
            productId: payload.productId,                              // ✅ String type!
            total,
        });
    });

// 🎯 COMPLEX NESTED: Even complex types work perfectly with explicit typing
const complexOperation = saga
    .createTransaction<ComplexPayload>('complex-operation')        // ✅ Complex payload type!
    .addStep('process-complex', (state, payload) => {
        // 🎯 Perfect nested object typing!
        console.log(`User ID: ${payload.user.id}`);                  // ✅ Deep property access!
        console.log(`Theme: ${payload.user.preferences.theme}`);     // ✅ Union type 'light' | 'dark'!
        console.log(`Source: ${payload.metadata.source}`);           // ✅ String property!
        console.log(`Tags: ${payload.metadata.tags.join(', ')}`);    // ✅ Array methods work!
    })
    .addStep('save-preferences', (state, payload) => {
        // 🎯 Union types and booleans work perfectly!
        console.log(`Saving ${payload.user.preferences.theme} theme`);         // ✅ Union type!
        console.log(`Notifications: ${payload.user.preferences.notifications}`); // ✅ Boolean!

        // TypeScript ensures theme can only be 'light' or 'dark'
        if (payload.user.preferences.theme === 'dark') {             // ✅ Type-safe comparison!
            console.log('Dark mode enabled');
        }
    });

// 🎯 DEMONSTRATION: Perfect type safety with explicit payload types
async function demonstrateExplicitTyping() {
    console.log('\n🚀 Running transactions with EXPLICIT payload typing...\n');

    try {
        // 🎯 User registration - payload must match UserRegistrationPayload exactly!
        console.log('--- User Registration (UserRegistrationPayload) ---');
        await userRegistration.run({
            email: 'jane.doe@example.com',        // ✅ Required string
            firstName: 'Jane',                    // ✅ Required string
            lastName: 'Doe',                      // ✅ Required string
            password: 'secure456',                // ✅ Required string
            // extraProp: 'invalid'               // ❌ TypeScript error - not in interface!
        });

        console.log('\n--- Order Processing (OrderPayload) ---');
        await orderProcessing.run({
            productId: 'smartphone-pro',          // ✅ Required string
            quantity: 1,                          // ✅ Required number
            price: 899.99,                        // ✅ Required number
            customerId: 'customer_456',           // ✅ Required string
            // email: 'test@example.com'          // ❌ TypeScript error - not in OrderPayload!
        });

        console.log('\n--- Complex Operation (ComplexPayload) ---');
        await complexOperation.run({
            user: {                               // ✅ Required nested object
                id: 'user_789',                     // ✅ Required string
                preferences: {                      // ✅ Required nested object
                    theme: 'dark',                    // ✅ Must be 'light' | 'dark'
                    notifications: true,              // ✅ Required boolean
                },
            },
            metadata: {                           // ✅ Required nested object
                source: 'mobile-app',               // ✅ Required string
                timestamp: Date.now(),              // ✅ Required number
                tags: ['premium', 'beta-tester'],   // ✅ Required string array
            },
            // invalidProp: 'error'               // ❌ TypeScript error!
        });

        console.log('\n🎉 ALL TRANSACTIONS COMPLETED WITH EXPLICIT TYPING!');
        console.log('✅ Perfect type safety at compile time!');
        console.log('✅ No runtime type checking needed!');
        console.log('✅ Excellent IntelliSense and autocomplete!');

    } catch (error) {
        console.error('Transaction failed:', error);
    }
}

// 🎯 COMPARISON: Different approaches
console.log('\n🔍 EXPLICIT TYPING COMPARISON:\n');

console.log('⚠️ BEFORE (unknown payload):');
console.log(`
const tx = saga.createTransaction('register')                     // ⚠️ No payload type
  .addStep('validate', (state, payload) => {                     // ⚠️ payload: unknown
    if ('email' in payload) {                                     // ⚠️ Runtime checks
      console.log((payload as any).email);                       // ⚠️ Casting needed
    }
  });
`);

console.log('✅ AFTER (explicit payload):');
console.log(`
interface UserPayload {                                          // ✅ Define interface
  email: string;
  name: string;
}

const tx = saga.createTransaction<UserPayload>('register')       // ✅ Explicit payload type!
  .addStep('validate', (state, payload) => {                     // ✅ payload: UserPayload
    console.log(payload.email);                                  // ✅ Perfect IntelliSense!
    console.log(payload.name);                                   // ✅ No casting needed!
  });
`);

// 🎯 ADVANCED: Generic constraints with explicit typing
console.log('\n🎯 Advanced: Generic constraints with explicit payload types');

// Generic constraint for payloads that must have an ID
interface WithId {
    id: string;
}

interface UserWithId extends WithId {
    id: string;
    email: string;
    name: string;
}

const constrainedTransaction = saga
    .createTransaction<UserWithId>('user-with-id')                 // ✅ Constrained payload type!
    .addStep('process-user', (state, payload) => {
        // 🎯 TypeScript guarantees payload has id, email, and name!
        console.log(`Processing user: ${payload.id}`);               // ✅ Required id property!
        console.log(`Email: ${payload.email}`);                      // ✅ Required email property!
        console.log(`Name: ${payload.name}`);                        // ✅ Required name property!

        if (payload.id.startsWith('user_')) {                        // ✅ String methods work!
            console.log('Valid user ID format');
        }
    });

// 🎯 UNION TYPES: Multiple possible payload shapes
type NotificationPayload =
    | { type: 'email'; to: string; subject: string; body: string }
    | { type: 'sms'; phoneNumber: string; message: string }
    | { type: 'push'; deviceId: string; title: string; content: string };

const notificationSender = saga
    .createTransaction<NotificationPayload>('send-notification')   // ✅ Union type payload!
    .addStep('send-notification', (state, payload) => {
        // 🎯 Perfect discriminated union handling!
        switch (payload.type) {                                      // ✅ TypeScript narrows type!
            case 'email':
                console.log(`Sending email to: ${payload.to}`);          // ✅ payload.to exists for email!
                console.log(`Subject: ${payload.subject}`);              // ✅ payload.subject exists!
                break;
            case 'sms':
                console.log(`Sending SMS to: ${payload.phoneNumber}`);   // ✅ payload.phoneNumber exists!
                console.log(`Message: ${payload.message}`);              // ✅ payload.message exists!
                break;
            case 'push':
                console.log(`Sending push to: ${payload.deviceId}`);     // ✅ payload.deviceId exists!
                console.log(`Title: ${payload.title}`);                  // ✅ payload.title exists!
                break;
        }
    });

export {
    saga,
    userRegistration,
    orderProcessing,
    complexOperation,
    constrainedTransaction,
    notificationSender,
    demonstrateExplicitTyping,
    type UserRegistrationPayload,
    type OrderPayload,
    type ComplexPayload,
    type UserWithId,
    type NotificationPayload,
};

// Run demo if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
    demonstrateExplicitTyping().catch(console.error);
}