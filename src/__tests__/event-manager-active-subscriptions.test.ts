/**
 * Regression test: UnifiedEventManager.getEventStats().activeSubscriptions must
 * reflect the number of live subscriptions. The per-stream counter was never
 * incremented/decremented, so it always reported 0.
 */

import { describe, it, expect } from 'vitest';
import { UnifiedEventManager } from '../managers/UnifiedEventManager';

describe('UnifiedEventManager activeSubscriptions', () => {
    it('increments and decrements the live subscription count', () => {
        const m = new UnifiedEventManager();
        expect(m.getEventStats().activeSubscriptions).toBe(0);

        const off1 = m.onSagaEvent('transaction:start', () => { });
        const off2 = m.onSagaEvent('transaction:fail', () => { });
        const off3 = m.onAnyEvent(() => { });
        expect(m.getEventStats().activeSubscriptions).toBe(3);

        off1();
        expect(m.getEventStats().activeSubscriptions).toBe(2);

        // Idempotent: calling unsubscribe again must not double-decrement
        off1();
        expect(m.getEventStats().activeSubscriptions).toBe(2);

        off2();
        off3();
        expect(m.getEventStats().activeSubscriptions).toBe(0);
    });

    it('counts subscriptions across the different subscribe APIs', () => {
        const m = new UnifiedEventManager();
        const offs = [
            m.on('custom-event', () => { }),
            m.onTypedEvent('step:start', () => { }),
            m.onAnyEvent(() => { }),
        ];
        expect(m.getEventStats().activeSubscriptions).toBe(3);

        offs.forEach(off => off());
        expect(m.getEventStats().activeSubscriptions).toBe(0);
    });

    it('resets the count on dispose', () => {
        const m = new UnifiedEventManager();
        m.onSagaEvent('transaction:start', () => { });
        m.onAnyEvent(() => { });
        expect(m.getEventStats().activeSubscriptions).toBe(2);

        m.dispose();
        expect(m.getEventStats().activeSubscriptions).toBe(0);
    });
});
