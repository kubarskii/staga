/**
 * Regression tests for statekit `derived()` dependency tracking.
 *
 * `derived()` re-collects its dependency set on every recomputation. Previously
 * it only subscribed to the dependencies collected on the very first run, so a
 * computation that switched which signals it read (dynamic dependencies) would
 * stop reacting to newly-used signals and leak subscriptions on stale ones.
 */

import { describe, it, expect } from 'vitest';
import { signal, derived } from '../statekit';

describe('statekit derived()', () => {
    it('reacts to static dependencies', () => {
        const a = signal(2);
        const b = signal(3);
        const sum = derived(() => a.get() + b.get());
        expect(sum.get()).toBe(5);

        a.set(10);
        expect(sum.get()).toBe(13);
        b.set(0);
        expect(sum.get()).toBe(10);
    });

    it('tracks newly-used dependencies after switching branches', () => {
        const a = signal(1);
        const b = signal(2);
        const flag = signal(true);

        const d = derived(() => (flag.get() ? a.get() : b.get()));
        expect(d.get()).toBe(1);

        flag.set(false);
        expect(d.get()).toBe(2);

        // b is now an active dependency and must trigger updates
        b.set(99);
        expect(d.get()).toBe(99);
    });

    it('stops reacting to dependencies no longer used', () => {
        const a = signal(1);
        const flag = signal(true);
        const d = derived(() => (flag.get() ? a.get() : 0));
        expect(d.get()).toBe(1);

        let notifications = 0;
        d.subscribe(() => notifications++);

        flag.set(false); // d becomes constant 0; a is no longer a dependency
        expect(d.get()).toBe(0);

        const before = notifications;
        a.set(1234); // stale dependency; must not affect d nor notify
        expect(d.get()).toBe(0);
        expect(notifications).toBe(before);
    });

    it('supports nested derived signals with dynamic deps', () => {
        const x = signal(1);
        const y = signal(100);
        const useX = signal(true);

        const pick = derived(() => (useX.get() ? x.get() : y.get()));
        const plusOne = derived(() => pick.get() + 1);

        expect(plusOne.get()).toBe(2);

        useX.set(false);
        expect(plusOne.get()).toBe(101);

        y.set(5);
        expect(plusOne.get()).toBe(6);
    });
});
