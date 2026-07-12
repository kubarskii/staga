/**
 * Regression tests for ReactiveStateProxy caching and notification semantics.
 *
 * Two related bugs were fixed:
 *  1. The `get` trap returned the raw object (instead of the cached proxy) on
 *     repeated access to the same nested object, so deep mutations through a
 *     re-accessed path stopped triggering reactive notifications.
 *  2. The `set` trap forwarded the proxy as `receiver` to Reflect.set, which
 *     re-dispatched through the `defineProperty` trap and emitted a second
 *     notification for every single mutation.
 */

import { describe, it, expect } from 'vitest';
import { ReactiveStateProxy } from '../ReactiveStateProxy';
import { StateManager } from '../StateManager';

interface State {
    nested: { value: number };
    user: { name: string; prefs: { theme: string } };
}

function setup() {
    const sm = new StateManager<State>({
        nested: { value: 0 },
        user: { name: 'A', prefs: { theme: 'light' } },
    });
    const rp = new ReactiveStateProxy(sm);
    const proxy = rp.createProxy(sm.getState());
    return { sm, rp, proxy };
}

describe('ReactiveStateProxy caching & notifications', () => {
    it('returns a stable proxy on repeated nested access', () => {
        const { proxy } = setup();
        expect(proxy.nested).toBe(proxy.nested);
        expect(proxy.user.prefs).toBe(proxy.user.prefs);
    });

    it('emits exactly one notification per primitive mutation', () => {
        const { sm, proxy } = setup();
        let notifications = 0;
        sm.subscribe(() => notifications++); // immediate call
        const base = notifications;

        proxy.nested.value = 1;
        proxy.nested.value = 2;
        proxy.nested.value = 3;

        expect(notifications - base).toBe(3);
        expect(sm.getState().nested.value).toBe(3);
    });

    it('keeps notifying on deep mutation through a re-accessed path', () => {
        const { sm, proxy } = setup();
        let notifications = 0;
        sm.subscribe(() => notifications++);
        const base = notifications;

        // Access user.prefs several times; each mutation must notify
        proxy.user.prefs.theme = 'dark';
        proxy.user.prefs.theme = 'solarized';

        expect(notifications - base).toBe(2);
        expect(sm.getState().user.prefs.theme).toBe('solarized');
    });

    it('does not notify when assigning an identical primitive value', () => {
        const { sm, proxy } = setup();
        let notifications = 0;
        sm.subscribe(() => notifications++);
        const base = notifications;

        proxy.nested.value = 0; // same as current value
        expect(notifications - base).toBe(0);
    });
});
