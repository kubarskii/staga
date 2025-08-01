/**
 * Type Safety Demo - Showcasing improved TypeScript experience
 */

import { SagaManager, Observable, type ReactiveValue } from '../src/index';

interface AppState {
    user: { name: string; age: number };
    count: number;
    isEnabled: boolean;
}

const initialState: AppState = {
    user: { name: 'John', age: 30 },
    count: 0,
    isEnabled: true
};

const saga = SagaManager.create(initialState);

console.log('🔷 Type Safety Demo - No more "as any" casts!\n');

// ===== PERFECTLY TYPED REACTIVE SELECTORS =====

// Create reactive selectors with full type inference
const userName$ = saga.selectProperty('user').select(user => user.name); // ReactiveSelector<AppState, string>
const userAge$ = saga.selectProperty('user').select(user => user.age);   // ReactiveSelector<AppState, number>
const count$ = saga.selectProperty('count');                             // ReactiveSelector<AppState, number>
const isEnabled$ = saga.selectProperty('isEnabled');                     // ReactiveSelector<AppState, boolean>

// ===== TWO-SOURCE COMPUTED VALUES =====

// Type-safe computed values from two sources - no type casting needed!
const userInfo$ = saga.computed(
    userName$,
    userAge$,
    (name, age) => `${name} (${age} years old)` // TypeScript infers: (name: string, age: number) => string
);

const canVote$ = saga.computed(
    userAge$,
    isEnabled$,
    (age, enabled) => enabled && age >= 18 // TypeScript infers: (age: number, enabled: boolean) => boolean
);

// ===== THREE-SOURCE COMPUTED VALUES =====

// For three sources, use the explicit computed3 method
const userStatus$ = saga.computed3(
    userName$,
    userAge$,
    count$,
    (name, age, count) => ({
        name,
        age,
        count,
        status: age >= 18 ? 'adult' : 'minor',
        isActive: count > 0
    }) // Full type inference for all parameters!
);

// ===== MULTIPLE SOURCES WITH COMBINELATES =====

// For more than 3 sources, use combineLatest with perfect type safety
const complexData$ = saga.combineLatest(
    [userName$, userAge$, count$, isEnabled$] as const, // 'as const' for tuple type inference
    (name, age, count, enabled) => ({
        // TypeScript knows exact types: string, number, number, boolean
        userSummary: `${name}, age ${age}`,
        metrics: { count, enabled },
        recommendations: [
            ...(age >= 18 ? ['voting', 'driving'] : ['education']),
            ...(count > 10 ? ['expert-level'] : ['beginner'])
        ]
    })
);

// ===== DEMONSTRATION =====

console.log('📝 Initial values:');
console.log('User info:', userInfo$.value);
console.log('Can vote:', canVote$.value);
console.log('User status:', userStatus$.value);
console.log('Complex data:', complexData$.value);

// Subscribe to changes with full type safety
userInfo$.subscribe((newInfo, oldInfo) => {
    console.log(`👤 User info changed: "${oldInfo}" → "${newInfo}"`);
});

canVote$.subscribe((canVote) => {
    console.log(`🗳️  Voting eligibility: ${canVote}`);
});

userStatus$.subscribe((status) => {
    console.log(`📊 Status update:`, status);
});

complexData$.subscribe((data) => {
    console.log(`🔍 Complex data:`, data);
});

// ===== TYPE SAFETY DEMONSTRATIONS =====

console.log('\n🔒 Type Safety Examples:');

// These would cause TypeScript errors (uncomment to see):

// ❌ Type error: Argument of type 'string' is not assignable to parameter of type 'number'
// const wrongTypes$ = saga.computed(userName$, userAge$, (name: string, age: string) => age);

// ❌ Type error: Property 'invalidProp' does not exist on type '{ name: string; age: number; }'
// const invalidProp$ = saga.selectProperty('user').select(user => user.invalidProp);

// ❌ Type error: Expected 3 arguments, but got 2
// const missingArg$ = saga.computed3(userName$, userAge$, (name, age) => name);

// ✅ These work perfectly with full type inference:
const correctTypes$ = saga.computed(
    userName$,
    userAge$,
    (name, age) => ({ fullName: name.toUpperCase(), ageInMonths: age * 12 })
);

const validProp$ = saga.selectProperty('user').select(user => user.name.length);

// ===== ADVANCED TYPE FEATURES =====

console.log('\n🚀 Advanced type features:');

// Custom observable with type safety
const customCounter$ = new Observable(42);
const doubledCounter$ = saga.computed(
    customCounter$,
    count$,
    (custom, sagaCount) => custom * 2 + sagaCount
);

console.log('Custom counter doubled + saga count:', doubledCounter$.value);

// Update state to see reactive changes
console.log('\n📝 Updating state to trigger reactive changes...');

saga.stateManager.setState({
    ...saga.getState(),
    user: { name: 'Jane', age: 25 },
    count: 5
});

console.log('\n✅ All reactive selectors updated automatically with full type safety!');
console.log('Final user info:', userInfo$.value);
console.log('Final can vote:', canVote$.value);
console.log('Final status:', userStatus$.value);

// ===== EXPORT FOR EXTERNAL USE =====

export {
    saga,
    userName$,
    userAge$,
    userInfo$,
    canVote$,
    userStatus$,
    complexData$,
    correctTypes$,
    validProp$
};

console.log('\n🎉 Type Safety Demo Complete - Zero "as any" casts used!');