# 🎯 Staga Library HTML Demo

This demo showcases all the key features of the Staga library in a browser environment.

## 🚀 How to Run

1. **Build the library** (if not already done):
   ```bash
   npm run build
   ```

2. **Open the demo**:
   - Simply open `demo/index.html` in your browser
   - Or serve it with a local server for better experience

## 📋 Demo Features

### 🏪 State Management
- **Update User**: Modify user name and balance
- **Undo/Redo**: Navigate through state history
- **Snapshots**: Create restore points
- **Real-time State Display**: See the complete state structure

### ⚡ Reactive Selectors
- **Live Values**: Watch computed values update automatically
- **Add/Remove Orders**: See reactive selectors respond to changes
- **Smart Computations**: Balance checks, order counts, affordability calculations
- **Type-safe Operations**: All selectors maintain type safety

### 🔄 Transactions
- **Order Processing**: Multi-step transactions with validation
- **Automatic Rollback**: Failed steps trigger compensation
- **Fallback Patterns**: Handle failures gracefully
- **Step-by-step Logging**: See each transaction step execute

### 📹 Event Replay
- **Record Sessions**: Capture all state changes and events
- **Replay Events**: Step through recorded interactions
- **Debug Mode**: Analyze application behavior
- **Event Analytics**: View recorded event statistics

## 🎮 Try These Scenarios

### Scenario 1: Basic State Management
1. Change user name and balance
2. Create some orders
3. Use undo/redo to navigate history
4. Watch reactive values update

### Scenario 2: Transaction Testing
1. Start recording
2. Try to buy a laptop (should succeed if balance > $999)
3. Try to buy 10 laptops (should fail with insufficient funds)
4. Try order with fallback
5. Stop recording and replay the session

### Scenario 3: Reactive Selectors
1. Watch the "Can Afford Laptop" indicator
2. Reduce balance below $999 and see it change to "No"
3. Add orders and watch order count update
4. See how all metrics update automatically

### Scenario 4: Error Handling
1. Set balance to $100
2. Try to order a laptop ($999)
3. Watch the transaction fail and rollback
4. See compensation logic restore state

## 🔍 What to Observe

### Reactive Updates
- Values update automatically without manual refresh
- Complex computations recalculate only when dependencies change
- Type-safe transformations throughout the chain

### Transaction Integrity
- Failed transactions automatically rollback
- Compensation functions restore previous state
- Events are emitted for each step

### Event System
- All actions generate events
- Events can be recorded and replayed
- Perfect for debugging and testing

### Performance
- Metrics show optimization effects
- Memory usage controlled through cleanup
- Efficient state patching vs full clones

## 🛠️ Technical Implementation

The demo uses:
- **IIFE Bundle**: `dist/index.global.js` loaded directly in HTML
- **Global API**: Available as `window.Staga`
- **Pure JavaScript**: No build tools needed for the demo
- **Modern Browser Features**: Uses ES2020+ features

## 📚 Code Examples

The demo shows practical usage of:

```javascript
// Creating a saga manager
const saga = Staga.SagaManager.createWithOptions(initialState, options);

// Reactive selectors
const balance$ = saga.selectProperty('user').select(user => user.balance);
const canAfford$ = saga.computed(balance$, price$, (balance, price) => balance >= price);

// Transactions with compensation
const transaction = saga
  .createTransaction('process-order')
  .addStep('reserve-stock', executeStep, compensateStep)
  .addStep('charge-user', chargeStep);

// Event recording and replay
saga.startRecording();
// ... perform actions ...
saga.stopRecording();
saga.startReplay();
```

## 🎯 Learning Objectives

After exploring this demo, you'll understand:

1. **State Management**: How to manage complex application state with undo/redo
2. **Reactive Programming**: Building reactive data flows with selectors
3. **Transaction Patterns**: Implementing reliable multi-step operations
4. **Event Sourcing**: Recording and replaying application events
5. **Error Handling**: Graceful failure handling with compensation patterns
6. **Performance**: Optimizing state updates and memory usage

## 🌟 Next Steps

- Explore the source code in `src/` directory
- Check out TypeScript examples in `examples/` folder
- Read the full documentation
- Build your own applications with Staga!

Happy exploring! 🚀