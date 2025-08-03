/**
 * Basic usage example for Staga library
 */
import {
    SagaManager,
    createLoggingMiddleware,
    createPersistenceMiddleware,
    type TransactionStartEvent,
    type TransactionSuccessEvent,
    type TransactionFailEvent,
    type StepRetryEvent,
} from '../src/index.js';

// Define application state
interface AppState {
    users: Array<{ id: string; name: string; email: string }>;
    balance: number;
    lastTransactionId: string | null;
}

// Initial state
const initialState: AppState = {
    users: [],
    balance: 1000,
    lastTransactionId: null,
};

// Create saga manager
const saga = SagaManager.create(initialState);

// Add middleware
saga.use(createLoggingMiddleware());

// Set up event listeners (store disposers for cleanup)
const disposeTransactionStart = saga.onEvent('transaction:start', (event: TransactionStartEvent) => {
    console.log(`🚀 Starting transaction: ${event.transactionName}`, event.payload);
});

const disposeTransactionSuccess = saga.onEvent('transaction:success', (event: TransactionSuccessEvent) => {
    console.log(`✅ Transaction completed: ${event.transactionName}`);
});

const disposeTransactionFail = saga.onEvent('transaction:fail', (event: TransactionFailEvent) => {
    console.log(`❌ Transaction failed: ${event.transactionName}`, event.error);
});

const disposeStepRetry = saga.onEvent('step:retry', (event: StepRetryEvent) => {
    console.log(`🔄 Retrying step: ${event.stepName} (attempt ${event.attempt})`);
});

// Create a user registration transaction
async function createUserRegistrationTransaction() {
    const transaction = saga
        .createTransaction<{ name: string; email: string }>('user-registration')
        .addStep(
            'validate-input',
            async (state, payload) => {
                if (!payload.name || payload.name.length < 2) {
                    throw new Error('Name must be at least 2 characters');
                }
                if (!payload.email || !payload.email.includes('@')) {
                    throw new Error('Valid email is required');
                }
                console.log('✓ Input validation passed');
            }
        )
        .addStep(
            'check-duplicate-email',
            async (state, payload) => {
                const existingUser = state.users.find(u => u.email === payload.email);
                if (existingUser) {
                    throw new Error('Email already exists');
                }
                console.log('✓ Email is unique');
            }
        )
        .addStep(
            'create-user',
            async (state, payload) => {
                const newUser = {
                    id: Math.random().toString(36).substr(2, 9),
                    name: payload.name,
                    email: payload.email,
                };
                state.users.push(newUser);
                console.log('✓ User created:', newUser);
            },
            // Compensation function - remove user if transaction fails
            async (state, payload) => {
                const index = state.users.findIndex(u => u.email === payload.email);
                if (index > -1) {
                    const removedUser = state.users.splice(index, 1)[0];
                    console.log('↩️ Removed user during rollback:', removedUser);
                }
            },
            { retries: 2, timeout: 5000 }
        )
        .addStep(
            'send-welcome-email',
            async (state, payload) => {
                // Simulate email sending that might fail
                if (Math.random() < 0.3) {
                    throw new Error('Email service temporarily unavailable');
                }
                console.log(`✓ Welcome email sent to ${payload.email}`);
            },
            // Compensation - mark email as not sent
            async (state, payload) => {
                console.log(`↩️ Marking welcome email as not sent for ${payload.email}`);
            },
            { retries: 3, timeout: 10000 }
        );

    return transaction;
}

// Create a money transfer transaction
async function createMoneyTransferTransaction() {
    const transaction = saga
        .createTransaction<{ amount: number; description: string }>('money-transfer')
        .addStep(
            'validate-amount',
            async (state, payload) => {
                if (payload.amount <= 0) {
                    throw new Error('Amount must be positive');
                }
                if (payload.amount > state.balance) {
                    throw new Error('Insufficient balance');
                }
                console.log(`✓ Transfer amount ${payload.amount} validated`);
            }
        )
        .addStep(
            'deduct-balance',
            async (state, payload) => {
                state.balance -= payload.amount;
                console.log(`✓ Deducted ${payload.amount}, new balance: ${state.balance}`);
            },
            // Compensation - restore balance
            async (state, payload) => {
                state.balance += payload.amount;
                console.log(`↩️ Restored ${payload.amount} to balance: ${state.balance}`);
            }
        )
        .addStep(
            'record-transaction',
            async (state, payload) => {
                const transactionId = `tx_${Date.now()}`;
                state.lastTransactionId = transactionId;
                console.log(`✓ Recorded transaction: ${transactionId}`);

                // Simulate external service failure
                if (Math.random() < 0.4) {
                    throw new Error('Transaction recording service failed');
                }
            },
            // Compensation - clear transaction record
            async (state, payload) => {
                state.lastTransactionId = null;
                console.log('↩️ Cleared transaction record');
            },
            { retries: 2, timeout: 3000 }
        );

    return transaction;
}

// Example usage
async function runExamples() {
    console.log('=== Staga Library Example ===\n');

    console.log('Initial state:', saga.getState());
    console.log('\n--- User Registration Examples ---\n');

    // Successful user registration
    try {
        const userTx = await createUserRegistrationTransaction();
        await userTx.run({ name: 'John Doe', email: 'john@example.com' });
        console.log('State after user registration:', saga.getState());
    } catch (error) {
        console.error('User registration failed:', error);
    }

    console.log('\n--- Money Transfer Examples ---\n');

    // Successful money transfer
    try {
        const transferTx = await createMoneyTransferTransaction();
        await transferTx.run({ amount: 100, description: 'Payment for services' });
        console.log('State after money transfer:', saga.getState());
    } catch (error) {
        console.error('Money transfer failed:', error);
    }

    // Failed money transfer (insufficient funds)
    try {
        const failedTransferTx = await createMoneyTransferTransaction();
        await failedTransferTx.run({ amount: 2000, description: 'Large payment' });
    } catch (error) {
        console.error('Expected failure - insufficient funds:', error.message);
    }

    console.log('\n--- Undo/Redo Example ---\n');

    console.log('Current state:', saga.getState());
    saga.undo();
    console.log('After undo:', saga.getState());
    saga.redo();
    console.log('After redo:', saga.getState());

    console.log('\n--- Duplicate Email Example ---\n');

    // Try to register user with duplicate email
    try {
        const duplicateUserTx = await createUserRegistrationTransaction();
        await duplicateUserTx.run({ name: 'Jane Doe', email: 'john@example.com' });
    } catch (error) {
        console.error('Expected failure - duplicate email:', error.message);
    }

    console.log('\nFinal state:', saga.getState());

    // Clean up listeners once we're done to prevent memory leaks
    disposeTransactionStart();
    disposeTransactionSuccess();
    disposeTransactionFail();
    disposeStepRetry();
}

// Run the examples
if (import.meta.url === `file://${process.argv[1]}`) {
    runExamples().catch(console.error).finally(() => saga.dispose());
}

export { runExamples };
