/**
 * Advanced Features Demo - Showcasing all new capabilities
 */

import {
    SagaManager,
    type ValidState,
    createTypedSelector,
    CompositionPatterns,
    deepEqual
} from '../src/index';

// ===== STATE DEFINITION WITH ENHANCED TYPING =====

interface AppState extends ValidState<{
    user: {
        id: string;
        name: string;
        balance: number;
        isVip: boolean;
    };
    orders: Array<{
        id: string;
        userId: string;
        amount: number;
        status: 'pending' | 'processing' | 'completed' | 'failed';
        items: Array<{ id: string; name: string; price: number; quantity: number }>;
    }>;
    products: Array<{
        id: string;
        name: string;
        price: number;
        stock: number;
        category: string;
    }>;
    notifications: Array<{
        id: string;
        type: 'info' | 'warning' | 'error';
        message: string;
        timestamp: number;
    }>;
    analytics: {
        totalOrders: number;
        totalRevenue: number;
        averageOrderValue: number;
        topSellingProducts: string[];
    };
}> {
    user: {
        id: string;
        name: string;
        balance: number;
        isVip: boolean;
    };
    orders: Array<{
        id: string;
        userId: string;
        amount: number;
        status: 'pending' | 'processing' | 'completed' | 'failed';
        items: Array<{ id: string; name: string; price: number; quantity: number }>;
    }>;
    products: Array<{
        id: string;
        name: string;
        price: number;
        stock: number;
        category: string;
    }>;
    notifications: Array<{
        id: string;
        type: 'info' | 'warning' | 'error';
        message: string;
        timestamp: number;
    }>;
    analytics: {
        totalOrders: number;
        totalRevenue: number;
        averageOrderValue: number;
        topSellingProducts: string[];
    };
}

const initialState: AppState = {
    user: {
        id: 'user1',
        name: 'John Doe',
        balance: 1000,
        isVip: false
    },
    orders: [],
    products: [
        { id: 'p1', name: 'Laptop', price: 999, stock: 10, category: 'electronics' },
        { id: 'p2', name: 'Mouse', price: 29, stock: 50, category: 'accessories' },
        { id: 'p3', name: 'Keyboard', price: 79, stock: 25, category: 'accessories' }
    ],
    notifications: [],
    analytics: {
        totalOrders: 0,
        totalRevenue: 0,
        averageOrderValue: 0,
        topSellingProducts: []
    }
};

// ===== SAGA MANAGER SETUP =====

const saga = SagaManager.createWithOptions(initialState, {
    maxUndoHistory: 50,
    autoCleanup: true,
    snapshotInterval: 5
});

console.log('🎯 Advanced Features Demo Starting...\n');

// ===== 1. REACTIVE SELECTORS DEMO =====

console.log('📊 1. REACTIVE SELECTORS DEMO');
console.log('✨ Note: All selectors are fully type-safe without "as any" casts!');

// Create reactive selectors
const userBalance$ = saga.selectProperty('user').select(user => user.balance);
const totalOrders$ = saga.selectProperty('orders').select(orders => orders.length);
const pendingOrders$ = saga.selectFiltered(
    state => state.orders,
    order => order.status === 'pending'
);

// Create computed values
const laptopPrice$ = saga.selectProperty('products').select(products =>
    products.find(p => p.name === 'Laptop')?.price || 0
);

const canAffordLaptop$ = saga.computed(
    userBalance$,
    laptopPrice$,
    (balance, laptopPrice) => balance >= laptopPrice
);

const totalRevenue$ = saga.selectProperty('analytics').select(analytics => analytics.totalRevenue);

const orderStats$ = saga.computed(
    totalOrders$,
    totalRevenue$,
    (totalOrders, totalRevenue) => ({
        totalOrders,
        totalRevenue,
        averageOrderValue: totalOrders > 0 ? totalRevenue / totalOrders : 0
    }),
    deepEqual // Use deep equality for complex objects
);

// Example of combineLatest for multiple sources
const dashboardData$ = saga.combineLatest(
    [userBalance$, totalOrders$, totalRevenue$, pendingOrders$],
    (balance, totalOrders, revenue, pendingOrders) => ({
        userBalance: balance,
        totalOrders,
        totalRevenue: revenue,
        pendingOrdersCount: pendingOrders.length,
        status: balance > 500 ? 'healthy' : 'low-balance'
    })
);

// Subscribe to changes
userBalance$.subscribe((newBalance, oldBalance) => {
    console.log(`💰 User balance changed: ${oldBalance} → ${newBalance}`);
});

canAffordLaptop$.subscribe((canAfford) => {
    console.log(`💻 Can afford laptop: ${canAfford}`);
});

orderStats$.subscribe((stats) => {
    console.log(`📈 Order stats: ${JSON.stringify(stats)}`);
});

dashboardData$.subscribe((data) => {
    console.log(`📊 Dashboard update: ${JSON.stringify(data)}`);
});

// ===== 2. TRANSACTION COMPOSITION DEMO =====

console.log('\n🔧 2. TRANSACTION COMPOSITION DEMO');

// Create individual transactions
const validateOrderTransaction = saga
    .createTransaction<{ productId: string; quantity: number }>('validate-order')
    .addStep('check-product-exists', (state, payload) => {
        const product = state.products.find(p => p.id === payload.productId);
        if (!product) {
            throw new Error(`Product ${payload.productId} not found`);
        }
    })
    .addStep('check-stock', (state, payload) => {
        const product = state.products.find(p => p.id === payload.productId)!;
        if (product.stock < payload.quantity) {
            throw new Error(`Insufficient stock for ${product.name}`);
        }
    })
    .addStep('check-user-balance', (state, payload) => {
        const product = state.products.find(p => p.id === payload.productId)!;
        const totalCost = product.price * payload.quantity;
        if (state.user.balance < totalCost) {
            throw new Error(`Insufficient funds. Need ${totalCost}, have ${state.user.balance}`);
        }
    });

const createOrderTransaction = saga
    .createTransaction<{ productId: string; quantity: number }>('create-order')
    .addStep('reserve-stock', (state, payload) => {
        const product = state.products.find(p => p.id === payload.productId)!;
        product.stock -= payload.quantity;
    }, (state, payload) => {
        // Compensation: restore stock
        const product = state.products.find(p => p.id === payload.productId)!;
        product.stock += payload.quantity;
    })
    .addStep('create-order-record', (state, payload) => {
        const product = state.products.find(p => p.id === payload.productId)!;
        const orderId = `order_${Date.now()}`;
        const order = {
            id: orderId,
            userId: state.user.id,
            amount: product.price * payload.quantity,
            status: 'pending' as const,
            items: [{
                id: product.id,
                name: product.name,
                price: product.price,
                quantity: payload.quantity
            }]
        };
        state.orders.push(order);
    });

const processPaymentTransaction = saga
    .createTransaction<{ productId: string; quantity: number }>('process-payment')
    .addStep('charge-user', (state, payload) => {
        const product = state.products.find(p => p.id === payload.productId)!;
        const totalCost = product.price * payload.quantity;
        state.user.balance -= totalCost;

        // Update analytics
        state.analytics.totalRevenue += totalCost;
        state.analytics.totalOrders += 1;
        state.analytics.averageOrderValue = state.analytics.totalRevenue / state.analytics.totalOrders;
    })
    .addStep('update-order-status', (state, payload) => {
        const lastOrder = state.orders[state.orders.length - 1];
        if (lastOrder) {
            lastOrder.status = 'completed';
        }
    })
    .addStep('add-notification', (state, payload) => {
        const product = state.products.find(p => p.id === payload.productId)!;
        state.notifications.push({
            id: `notif_${Date.now()}`,
            type: 'info',
            message: `Order completed: ${payload.quantity}x ${product.name}`,
            timestamp: Date.now()
        });
    });

// Create a complex composed transaction
const complexOrderFlow = saga
    .createComposer<{ productId: string; quantity: number }>('complex-order-flow')
    .add(validateOrderTransaction)
    .add(createOrderTransaction)
    .addConditional(
        processPaymentTransaction,
        (state, payload) => {
            // Only process payment if user has enough balance
            const product = state.products.find(p => p.id === payload.productId)!;
            return state.user.balance >= product.price * payload.quantity;
        }
    );

// Create fallback transaction
const failedOrderTransaction = saga
    .createTransaction<{ productId: string; quantity: number }>('failed-order-cleanup')
    .addStep('add-error-notification', (state, payload) => {
        state.notifications.push({
            id: `error_${Date.now()}`,
            type: 'error',
            message: `Order failed for product ${payload.productId}`,
            timestamp: Date.now()
        });
    });

const orderWithFallback = saga
    .createComposer<{ productId: string; quantity: number }>('order-with-fallback')
    .addWithFallback(complexOrderFlow.createTransaction('main-order'),
        failedOrderTransaction);

// ===== 3. EVENT REPLAY DEMO =====

console.log('\n📹 3. EVENT REPLAY DEMO');

// Start recording
const sessionId = saga.startRecording({
    description: 'Advanced features demo session',
    testCase: 'order-flow-with-reactive-selectors'
});

console.log(`🔴 Recording started: ${sessionId}`);

// ===== 4. ENHANCED TYPESCRIPT DEMO =====

console.log('\n🔷 4. ENHANCED TYPESCRIPT DEMO');

// Create typed selectors with compile-time validation
const typedUserSelector = createTypedSelector((state: AppState) => state.user);
const typedOrdersSelector = createTypedSelector((state: AppState) => state.orders);

// Use circuit breaker pattern
const protectedOrderFlow = CompositionPatterns.createCircuitBreaker(
    complexOrderFlow.createTransaction('protected-order'),
    3, // fail after 3 attempts
    30000 // reset after 30 seconds
);

// ===== EXECUTE DEMO =====

async function runDemo() {
    try {
        console.log('\n🚀 Executing order flow...');

        // Test successful order
        await complexOrderFlow.execute({ productId: 'p2', quantity: 2 });
        console.log('✅ Order 1 completed successfully');

        // Test order that will fail due to insufficient funds
        try {
            await complexOrderFlow.execute({ productId: 'p1', quantity: 2 });
        } catch (error) {
            console.log('❌ Order 2 failed as expected:', error instanceof Error ? error.message : String(error));
        }

        // Test with fallback
        await orderWithFallback.execute({ productId: 'p1', quantity: 2 });
        console.log('✅ Order 3 completed with fallback');

        // Show reactive selector values
        console.log('\n📊 Current reactive values:');
        console.log(`User balance: ${userBalance$.value}`);
        console.log(`Total orders: ${totalOrders$.value}`);
        console.log(`Can afford laptop: ${canAffordLaptop$.value}`);
        console.log(`Order stats:`, orderStats$.value);

        // Stop recording and export
        const session = saga.stopRecording();
        console.log('\n📹 Recording stopped');

        if (session) {
            const recordedEvents = saga.getRecordedEvents();
            console.log(`📊 Recorded ${recordedEvents.length} events`);

            // Export recording
            const exportData = saga.exportRecording();
            console.log('💾 Recording exported (first 200 chars):');
            console.log(exportData.substring(0, 200) + '...');

            // Demo replay capabilities
            console.log('\n▶️ Setting up replay...');
            saga.importRecording(exportData);

            const replayManager = saga.getReplayManager();
            const replayer = replayManager.getReplayer();

            // Set up replay state monitoring
            replayer.onStateChange((state) => {
                console.log(`🎬 Replay: ${state.currentEvent}/${state.totalEvents} events`);
            });

            // Demo step-by-step replay
            console.log('⏭️ Stepping through first 3 events...');
            for (let i = 0; i < 3 && i < recordedEvents.length; i++) {
                await replayer.stepForward();
                const currentEvent = replayer.getCurrentEvent();
                if (currentEvent) {
                    console.log(`   Event ${i + 1}: ${currentEvent.type}`);
                }
            }
        }

        // Show performance metrics
        console.log('\n📈 Performance metrics:');
        const metrics = saga.getPerformanceMetrics();
        console.log(JSON.stringify(metrics, null, 2));

        console.log('\n🎉 Advanced Features Demo Complete!');

    } catch (error) {
        console.error('❌ Demo failed:', error);
    }
}

// Run the demo
runDemo().catch(console.error);

// ===== COMPOSITION PATTERNS DEMO =====

console.log('\n🛡️ 5. COMPOSITION PATTERNS DEMO');

// Demonstrate retry with exponential backoff
const retryOrderFlow = CompositionPatterns.createExponentialRetry(
    createOrderTransaction,
    3, // max retries
    1000 // base delay ms
);

// Demonstrate bulkhead pattern (resource isolation)
const isolatedOrderFlow = CompositionPatterns.createBulkhead(
    processPaymentTransaction,
    2 // max concurrent executions
);

console.log('🛡️ Composition patterns created (circuit breaker, retry, bulkhead)');

// ===== HELPER FUNCTIONS =====

function logStateChange(description: string) {
    console.log(`\n📝 ${description}`);
    console.log('Current state summary:');
    console.log(`- User balance: ${saga.getState().user.balance}`);
    console.log(`- Orders: ${saga.getState().orders.length}`);
    console.log(`- Notifications: ${saga.getState().notifications.length}`);
    console.log(`- Revenue: ${saga.getState().analytics.totalRevenue}`);
}

// Export for external use
export {
    saga,
    userBalance$,
    totalOrders$,
    canAffordLaptop$,
    orderStats$,
    complexOrderFlow,
    orderWithFallback
};

// Clean up the saga manager to avoid dangling timers
saga.dispose();