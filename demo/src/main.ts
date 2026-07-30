import './styles.css';
import {
    SagaManager,
    createLoggingMiddleware,
    createTimingMiddleware,
    type SagaEvent,
} from '@staga/core';

/* ================================================================ */
/*  Utility helpers                                                  */
/* ================================================================ */

function el<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    className?: string,
    text?: string,
): HTMLElementTagNameMap[K] {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
}

function button(label: string, className = 'btn'): HTMLButtonElement {
    const b = el('button', className, label);
    return b;
}

function jsonView(obj: unknown): string {
    return JSON.stringify(obj, null, 2);
}

function escapeHtml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function delay(ms: number): Promise<void> {
    return new Promise(r => setTimeout(r, ms));
}

/* ================================================================ */
/*  Nav                                                              */
/* ================================================================ */

const NAV_ITEMS = [
    { id: 'hero', label: 'Overview' },
    { id: 'state', label: 'State' },
    { id: 'transactions', label: 'Transactions' },
    { id: 'reactive', label: 'Reactivity' },
    { id: 'cart', label: 'Shopping Cart' },
    { id: 'events', label: 'Events' },
    { id: 'middleware', label: 'Middleware' },
];

function buildNav(app: HTMLElement): void {
    const nav = el('nav', 'topnav');
    const brand = el('a', 'brand', '◆ staga');
    brand.href = '#hero';
    nav.append(brand);
    const links = el('div', 'nav-links');
    for (const item of NAV_ITEMS) {
        const a = el('a', null, item.label);
        a.href = '#' + item.id;
        links.append(a);
    }
    nav.append(links);
    app.prepend(nav);
}

/* ================================================================ */
/*  Section 1 — Hero                                                 */
/* ================================================================ */

function buildHero(container: HTMLElement): void {
    const sec = el('section', 'hero');
    sec.id = 'hero';
    sec.innerHTML = `
        <div class="hero-badge">TypeScript · Zero Dependencies · MIT</div>
        <h1 class="hero-title">State management with<br/><span class="grad">sagas, transactions &amp; rollback</span></h1>
        <p class="hero-sub">
            Staga gives you atomic multi-step operations with automatic compensation,
            reactive selectors, event streams, and a middleware pipeline — all in
            a tiny, dependency-free package.
        </p>
        <div class="hero-actions">
            <a class="btn btn-primary" href="#transactions">Try the Transaction Lab →</a>
            <code class="hero-install">npm i @staga/core</code>
        </div>
        <div class="hero-stats" id="hero-stats"></div>
    `;
    container.append(sec);
}

/* ================================================================ */
/*  Section 2 — State Management                                     */
/* ================================================================ */

function buildStateSection(container: HTMLElement): void {
    const sec = el('section', 'section');
    sec.id = 'state';
    sec.innerHTML = `
        <header class="sec-head">
            <h2>State Management &amp; Undo/Redo</h2>
            <p>Every <code>setState</code> is recorded on an undo stack. Snapshots give
               you point-in-time recovery. Selectors stay in sync automatically.</p>
        </header>
    `;
    const body = el('div', 'card-grid card-grid-2');
    const controls = el('div', 'card');
    const display = el('div', 'card');

    controls.innerHTML = `
        <h3>Controls</h3>
        <div class="control-row">
            <label>Name</label>
            <input id="st-name" type="text" value="Alice" class="input" />
        </div>
        <div class="control-row">
            <label>Balance</label>
            <input id="st-balance" type="number" value="100" class="input" />
        </div>
        <div class="control-row">
            <label>Score</label>
            <input id="st-score" type="number" value="0" class="input" />
        </div>
        <div class="btn-row">
            <button class="btn" id="st-commit">Commit Change</button>
            <button class="btn btn-warn" id="st-undo">↶ Undo</button>
            <button class="btn btn-warn" id="st-redo">↷ Redo</button>
        </div>
        <div class="btn-row">
            <button class="btn btn-ghost" id="st-snapshot">📷 Snapshot</button>
            <button class="btn btn-danger" id="st-rollback">↺ Rollback to Snapshot</button>
        </div>
        <div class="stack-info" id="st-stack"></div>
    `;
    display.innerHTML = `
        <h3>Live State</h3>
        <pre class="json-block" id="st-state-view"></pre>
    `;
    body.append(controls, display);
    sec.append(body);
    container.append(sec);

    /* ---- Staga instance ---- */
    interface DemoState {
        user: { name: string; balance: number };
        score: number;
    }
    const saga = SagaManager.create<DemoState>({
        user: { name: 'Alice', balance: 100 },
        score: 0,
    });

    const stateView = display.querySelector('#st-state-view') as HTMLPreElement;
    const stackInfo = controls.querySelector('#st-stack') as HTMLDivElement;

    function render(): void {
        stateView.textContent = jsonView(saga.getState());
        const sm = saga.stateManager;
        stackInfo.innerHTML = `
            <span class="badge">Undo: ${sm.undoStackLength}</span>
            <span class="badge">Redo: ${sm.redoStackLength}</span>
            <span class="badge">Snapshots: ${sm.snapshotsLength}</span>
        `;
    }
    saga.select(s => s).subscribe(render);
    render();

    function commit(): void {
        const nameInput = controls.querySelector('#st-name') as HTMLInputElement;
        const balInput = controls.querySelector('#st-balance') as HTMLInputElement;
        const scoreInput = controls.querySelector('#st-score') as HTMLInputElement;
        const s = saga.getState();
        saga.stateManager.setState({
            user: { name: nameInput.value, balance: Number(balInput.value) },
            score: Number(scoreInput.value),
        });
    }
    (controls.querySelector('#st-commit') as HTMLButtonElement).onclick = commit;
    (controls.querySelector('#st-undo') as HTMLButtonElement).onclick = () => { saga.stateManager.undo(); };
    (controls.querySelector('#st-redo') as HTMLButtonElement).onclick = () => { saga.stateManager.redo(); };
    (controls.querySelector('#st-snapshot') as HTMLButtonElement).onclick = () => {
        saga.stateManager.createSnapshot();
        render();
    };
    (controls.querySelector('#st-rollback') as HTMLButtonElement).onclick = () => {
        saga.stateManager.rollbackToLastSnapshot();
    };
}

/* ================================================================ */
/*  Section 3 — Transaction Lab                                      */
/* ================================================================ */

function buildTransactionSection(container: HTMLElement): void {
    const sec = el('section', 'section');
    sec.id = 'transactions';
    sec.innerHTML = `
        <header class="sec-head">
            <h2>Transaction Lab</h2>
            <p>Multi-step transactions with automatic rollback. If any step fails,
               all completed steps are compensated in reverse order and state is
               restored. Toggle the failure switch to see it in action.</p>
        </header>
    `;

    const body = el('div', 'card-grid card-grid-2');
    const ctrl = el('div', 'card');
    const viz = el('div', 'card');

    ctrl.innerHTML = `
        <h3>Money Transfer Flow</h3>
        <p class="muted">5 steps: validate → debit sender → credit receiver → log → confirm.
           Step 4 can be configured to fail.</p>
        <div class="control-row">
            <label class="switch-label">
                <input type="checkbox" id="tx-fail" />
                <span>Fail at step "log" (triggers rollback)</span>
            </label>
        </div>
        <div class="control-row">
            <label>Amount</label>
            <input id="tx-amount" type="number" value="30" class="input" />
        </div>
        <button class="btn btn-primary" id="tx-run" style="width:100%;margin-top:.5rem;">▶ Run Transaction</button>
        <div class="step-list" id="tx-steps"></div>
    `;
    viz.innerHTML = `
        <h3>State</h3>
        <pre class="json-block" id="tx-state"></pre>
    `;
    body.append(ctrl, viz);
    sec.append(body);
    container.append(sec);

    interface TxState {
        sender: number;
        receiver: number;
        log: string[];
        confirmed: boolean;
    }
    const saga = SagaManager.create<TxState>({
        sender: 500,
        receiver: 200,
        log: [],
        confirmed: false,
    });

    const stateView = viz.querySelector('#tx-state') as HTMLPreElement;
    const stepsList = ctrl.querySelector('#tx-steps') as HTMLDivElement;

    saga.select(s => s).subscribe(s => {
        stateView.textContent = jsonView(s);
    });

    const stepDefs = [
        'validate',
        'debit sender',
        'credit receiver',
        'log entry',
        'confirm',
    ];

    function renderSteps(active: number, status: 'running' | 'done' | 'failed' | 'rolled'): void {
        stepsList.innerHTML = '';
        stepDefs.forEach((name, i) => {
            const item = el('div', 'step-item');
            let icon = '○';
            let cls = 'step-pending';
            if (i < active) { icon = '✓'; cls = 'step-done'; }
            if (i === active) {
                if (status === 'failed') { icon = '✗'; cls = 'step-failed'; }
                else if (status === 'rolled') { icon = '↩'; cls = 'step-rolled'; }
                else { icon = '●'; cls = 'step-active'; }
            }
            item.className = 'step-item ' + cls;
            item.innerHTML = `<span class="step-icon">${icon}</span> ${escapeHtml(name)}`;
            stepsList.append(item);
        });
    }
    renderSteps(-1, 'running');

    saga.onEventStream('step:start').subscribe((e: SagaEvent<unknown>) => {
        const idx = stepDefs.indexOf((e as { stepName: string }).stepName);
        renderSteps(idx, 'running');
    });
    saga.onEventStream('step:success').subscribe((e: SagaEvent<unknown>) => {
        const idx = stepDefs.indexOf((e as { stepName: string }).stepName);
        renderSteps(idx + 1, 'running');
    });
    saga.onEventStream('transaction:rollback').subscribe(() => {
        renderSteps(stepDefs.length, 'rolled');
    });
    saga.onEventStream('transaction:success').subscribe(() => {
        renderSteps(stepDefs.length, 'done');
    });

    const tx = saga
        .createTransaction('money-transfer')
        .addStep('validate', (state, payload) => {
            const amount = (payload as { amount: number }).amount;
            if (amount <= 0) throw new Error('Amount must be positive');
            if (state.sender < amount) throw new Error('Insufficient funds');
        })
        .addStep('debit sender', (state, payload) => {
            const amount = (payload as { amount: number }).amount;
            saga.stateManager.setState({
                ...saga.getState(),
                sender: saga.getState().sender - amount,
            });
        }, (state, payload) => {
            const amount = (payload as { amount: number }).amount;
            saga.stateManager.setState({
                ...saga.getState(),
                sender: saga.getState().sender + amount,
            });
        })
        .addStep('credit receiver', (state, payload) => {
            const amount = (payload as { amount: number }).amount;
            saga.stateManager.setState({
                ...saga.getState(),
                receiver: saga.getState().receiver + amount,
            });
        }, (state, payload) => {
            const amount = (payload as { amount: number }).amount;
            saga.stateManager.setState({
                ...saga.getState(),
                receiver: saga.getState().receiver - amount,
            });
        })
        .addStep('log entry', async (state, payload) => {
            const shouldFail = (payload as { fail: boolean }).fail;
            await delay(300);
            if (shouldFail) throw new Error('Audit service unavailable');
            saga.stateManager.setState({
                ...saga.getState(),
                log: [...saga.getState().log, `Transfer ${(payload as { amount: number }).amount}`],
            });
        }, () => {
            const s = saga.getState();
            saga.stateManager.setState({
                ...s,
                log: s.log.slice(0, -1),
            });
        })
        .addStep('confirm', () => {
            saga.stateManager.setState({
                ...saga.getState(),
                confirmed: true,
            });
        }, () => {
            saga.stateManager.setState({
                ...saga.getState(),
                confirmed: false,
            });
        });

    (ctrl.querySelector('#tx-run') as HTMLButtonElement).onclick = async () => {
        const failCheckbox = ctrl.querySelector('#tx-fail') as HTMLInputElement;
        const amountInput = ctrl.querySelector('#tx-amount') as HTMLInputElement;
        renderSteps(0, 'running');
        try {
            await tx.run({ amount: Number(amountInput.value), fail: failCheckbox.checked });
        } catch {
            /* rollback already visualised via events */
        }
    };
}

/* ================================================================ */
/*  Section 4 — Reactive Selectors                                  */
/* ================================================================ */

function buildReactiveSection(container: HTMLElement): void {
    const sec = el('section', 'section');
    sec.id = 'reactive';
    sec.innerHTML = `
        <header class="sec-head">
            <h2>Reactive Selectors &amp; Computed Values</h2>
            <p>Selectors derive data from state and only re-emit when the slice changes.
               Computed values combine multiple signals reactively.</p>
        </header>
    `;
    const body = el('div', 'card-grid card-grid-3');

    /* Counter card */
    const counterCard = el('div', 'card reactive-card');
    counterCard.innerHTML = `
        <h3>Live Counter</h3>
        <div class="big-num" id="rx-count">0</div>
        <div class="btn-row">
            <button class="btn" id="rx-inc">+1</button>
            <button class="btn" id="rx-dec">−1</button>
            <button class="btn btn-danger" id="rx-reset">Reset</button>
        </div>
    `;

    /* Derived card */
    const derivedCard = el('div', 'card reactive-card');
    derivedCard.innerHTML = `
        <h3>Derived (doubled)</h3>
        <div class="big-num grad" id="rx-doubled">0</div>
        <p class="muted small">Automatically tracks the counter signal.</p>
    `;

    /* Computed card */
    const computedCard = el('div', 'card reactive-card');
    computedCard.innerHTML = `
        <h3>Computed (is even?)</h3>
        <div class="big-num" id="rx-even">—</div>
        <p class="muted small">Combines the counter selector with a parity check.</p>
    `;

    body.append(counterCard, derivedCard, computedCard);
    sec.append(body);
    container.append(sec);

    interface RxState { count: number }
    const saga = SagaManager.create<RxState>({ count: 0 });

    const count$ = saga.select(s => s.count);
    const doubled$ = saga.computed(count$, c => c * 2);

    const countEl = counterCard.querySelector('#rx-count') as HTMLDivElement;
    const doubledEl = derivedCard.querySelector('#rx-doubled') as HTMLDivElement;
    const evenEl = computedCard.querySelector('#rx-even') as HTMLDivElement;

    count$.subscribe(c => {
        countEl.textContent = String(c);
        evenEl.textContent = c % 2 === 0 ? '✓ even' : '✗ odd';
        evenEl.className = 'big-num ' + (c % 2 === 0 ? 'grad' : 'warn-text');
    });
    doubled$.subscribe(d => {
        doubledEl.textContent = String(d);
    });

    (counterCard.querySelector('#rx-inc') as HTMLButtonElement).onclick = () => {
        saga.stateManager.setState({ count: saga.getState().count + 1 });
    };
    (counterCard.querySelector('#rx-dec') as HTMLButtonElement).onclick = () => {
        saga.stateManager.setState({ count: saga.getState().count - 1 });
    };
    (counterCard.querySelector('#rx-reset') as HTMLButtonElement).onclick = () => {
        saga.stateManager.setState({ count: 0 });
    };
}

/* ================================================================ */
/*  Section 5 — Shopping Cart                                        */
/* ================================================================ */

function buildCartSection(container: HTMLElement): void {
    const sec = el('section', 'section');
    sec.id = 'cart';
    sec.innerHTML = `
        <header class="sec-head">
            <h2>Shopping Cart (Transaction-based)</h2>
            <p>Add items, then checkout as a single atomic transaction. If checkout
               fails at any step (e.g. payment), the cart is restored automatically.</p>
        </header>
    `;
    const body = el('div', 'card-grid card-grid-2');
    const shopCard = el('div', 'card');
    const cartCard = el('div', 'card');

    shopCard.innerHTML = `
        <h3>Products</h3>
        <div class="product-list" id="ct-products"></div>
    `;
    cartCard.innerHTML = `
        <h3>Cart &amp; Checkout</h3>
        <div class="cart-items" id="ct-items"></div>
        <div class="cart-summary" id="ct-summary"></div>
        <div class="control-row">
            <label class="switch-label">
                <input type="checkbox" id="ct-fail-pay" />
                <span>Simulate payment failure</span>
            </label>
        </div>
        <button class="btn btn-primary" id="ct-checkout" style="width:100%;margin-top:.5rem;">Checkout</button>
        <pre class="log-block" id="ct-log"></pre>
    `;
    body.append(shopCard, cartCard);
    sec.append(body);
    container.append(sec);

    interface CartState {
        cart: { id: string; name: string; price: number }[];
        balance: number;
        purchased: boolean;
    }
    const saga = SagaManager.create<CartState>({
        cart: [],
        balance: 1000,
        purchased: false,
    });

    const PRODUCTS = [
        { id: 'p1', name: 'Widget', price: 49 },
        { id: 'p2', name: 'Gadget', price: 129 },
        { id: 'p3', name: 'Gizmo', price: 299 },
        { id: 'p4', name: 'Doohickey', price: 19 },
    ];

    const productsEl = shopCard.querySelector('#ct-products') as HTMLDivElement;
    const itemsEl = cartCard.querySelector('#ct-items') as HTMLDivElement;
    const summaryEl = cartCard.querySelector('#ct-summary') as HTMLDivElement;
    const logEl = cartCard.querySelector('#ct-log') as HTMLPreElement;

    PRODUCTS.forEach(p => {
        const row = el('div', 'product-row');
        row.innerHTML = `
            <span class="product-name">${escapeHtml(p.name)}</span>
            <span class="product-price">$${p.price}</span>
            <button class="btn btn-small">Add</button>
        `;
        (row.querySelector('button') as HTMLButtonElement).onclick = () => {
            const s = saga.getState();
            saga.stateManager.setState({
                ...s,
                cart: [...s.cart, { id: p.id + Date.now(), name: p.name, price: p.price }],
                purchased: false,
            });
        };
        productsEl.append(row);
    });

    function logCart(msg: string): void {
        logEl.textContent += msg + '\n';
        logEl.scrollTop = logEl.scrollHeight;
    }

    saga.select(s => s).subscribe(s => {
        if (s.cart.length === 0) {
            itemsEl.innerHTML = '<p class="muted small">Cart is empty.</p>';
        } else {
            itemsEl.innerHTML = s.cart
                .map((item, i) => `
                    <div class="cart-row">
                        <span>${escapeHtml(item.name)} — $${item.price}</span>
                        <button class="btn btn-small btn-danger" data-idx="${i}">✕</button>
                    </div>
                `)
                .join('');
            itemsEl.querySelectorAll('button[data-idx]').forEach(btn => {
                (btn as HTMLButtonElement).onclick = () => {
                    const idx = Number((btn as HTMLElement).dataset.idx);
                    const st = saga.getState();
                    saga.stateManager.setState({
                        ...st,
                        cart: st.cart.filter((_, i) => i !== idx),
                    });
                };
            });
        }
        const total = s.cart.reduce((sum, i) => sum + i.price, 0);
        summaryEl.innerHTML = `
            <div class="summary-row"><span>Items:</span><span>${s.cart.length}</span></div>
            <div class="summary-row"><span>Total:</span><span>$${total}</span></div>
            <div class="summary-row"><span>Balance:</span><span>$${s.balance}</span></div>
            <div class="summary-row"><span>Status:</span><span>${s.purchased ? '✓ Purchased' : 'Pending'}</span></div>
        `;
    });

    saga.onEventStream('transaction:start').subscribe((e: SagaEvent<unknown>) =>
        logCart(`▶ ${(e as { transactionName: string }).transactionName} started`));
    saga.onEventStream('step:success').subscribe((e: SagaEvent<unknown>) =>
        logCart(`  ✓ ${(e as { stepName: string }).stepName}`));
    saga.onEventStream('transaction:success').subscribe(() =>
        logCart('✓ Checkout complete!'));
    saga.onEventStream('transaction:rollback').subscribe(() =>
        logCart('↩ Rolled back — cart restored'));
    saga.onEventStream('transaction:fail').subscribe((e: SagaEvent<unknown>) =>
        logCart(`✗ Failed: ${(e as { error: Error }).error?.message}`));

    const checkout = saga
        .createTransaction('checkout')
        .addStep('validate-cart', (state) => {
            if (state.cart.length === 0) throw new Error('Cart is empty');
        })
        .addStep('check-balance', (state) => {
            const total = state.cart.reduce((s, i) => s + i.price, 0);
            if (state.balance < total) throw new Error('Insufficient balance');
        })
        .addStep('reserve-funds', (state) => {
            const total = state.cart.reduce((s, i) => s + i.price, 0);
            saga.stateManager.setState({
                ...saga.getState(),
                balance: saga.getState().balance - total,
            });
        }, () => {
            const st = saga.getState();
            const total = st.cart.reduce((s, i) => s + i.price, 0);
            saga.stateManager.setState({
                ...st,
                balance: st.balance + total,
            });
        })
        .addStep('process-payment', async (_state, payload) => {
            await delay(500);
            if ((payload as { fail: boolean }).fail) throw new Error('Card declined');
        })
        .addStep('fulfil', () => {
            saga.stateManager.setState({
                ...saga.getState(),
                purchased: true,
            });
        });

    (cartCard.querySelector('#ct-checkout') as HTMLButtonElement).onclick = async () => {
        logEl.textContent = '';
        const failPay = (cartCard.querySelector('#ct-fail-pay') as HTMLInputElement).checked;
        try {
            await checkout.run({ fail: failPay });
        } catch {
            /* handled by events */
        }
    };
}

/* ================================================================ */
/*  Section 6 — Event Stream                                         */
/* ================================================================ */

function buildEventSection(container: HTMLElement): void {
    const sec = el('section', 'section');
    sec.id = 'events';
    sec.innerHTML = `
        <header class="sec-head">
            <h2>Event Stream &amp; Recording</h2>
            <p>Every state change and transaction lifecycle emits typed events.
               Record a session and replay it to restore state step-by-step.</p>
        </header>
    `;
    const body = el('div', 'card-grid card-grid-2');
    const ctrl = el('div', 'card');
    const feed = el('div', 'card');

    ctrl.innerHTML = `
        <h3>Controls</h3>
        <div class="btn-row">
            <button class="btn" id="ev-emit-a">Emit "action.a"</button>
            <button class="btn" id="ev-emit-b">Emit "action.b"</button>
        </div>
        <div class="btn-row">
            <button class="btn btn-ghost" id="ev-record">● Record</button>
            <button class="btn btn-warn" id="ev-stop">■ Stop</button>
            <button class="btn btn-primary" id="ev-replay">▶ Replay</button>
        </div>
        <div class="stack-info" id="ev-stats"></div>
    `;
    feed.innerHTML = `
        <h3>Live Event Feed</h3>
        <div class="event-feed" id="ev-feed"></div>
    `;
    body.append(ctrl, feed);
    sec.append(body);
    container.append(sec);

    interface EvState { counter: number }
    const saga = SagaManager.create<EvState>({ counter: 0 });

    const feedEl = feed.querySelector('#ev-feed') as HTMLDivElement;
    const statsEl = ctrl.querySelector('#ev-stats') as HTMLDivElement;

    let eventCount = 0;
    const MAX_FEED = 30;

    function addEvent(text: string, type: string): void {
        eventCount++;
        const entry = el('div', 'event-entry event-' + type);
        entry.innerHTML = `<span class="event-time">${new Date().toLocaleTimeString()}</span> ${escapeHtml(text)}`;
        feedEl.prepend(entry);
        while (feedEl.children.length > MAX_FEED) {
            feedEl.lastChild?.remove();
        }
        statsEl.innerHTML = `<span class="badge">Events: ${eventCount}</span><span class="badge">Recorded: ${saga.getRecordedEvents().length}</span>`;
    }

    saga.onAllEventsStream().subscribe((event: SagaEvent<unknown>) => {
        const e = event as { type: string; stepName?: string; transactionName?: string };
        if (e.type.startsWith('step:')) {
            addEvent(`${e.type}: ${e.stepName ?? ''}`, 'step');
        } else if (e.type.startsWith('transaction:')) {
            addEvent(`${e.type}: ${e.transactionName ?? ''}`, 'tx');
        } else {
            addEvent(`${e.type}`, 'custom');
        }
    });

    (ctrl.querySelector('#ev-emit-a') as HTMLButtonElement).onclick = () => {
        saga.emitSagaEvent({ type: 'action.a' as unknown as 'step:start', payload: { n: Math.random() }, timestamp: Date.now() } as unknown as SagaEvent<unknown>);
        saga.stateManager.setState({ counter: saga.getState().counter + 1 });
    };
    (ctrl.querySelector('#ev-emit-b') as HTMLButtonElement).onclick = () => {
        saga.emitSagaEvent({ type: 'action.b' as unknown as 'step:start', payload: { n: Math.random() }, timestamp: Date.now() } as unknown as SagaEvent<unknown>);
        saga.stateManager.setState({ counter: saga.getState().counter + 10 });
    };
    (ctrl.querySelector('#ev-record') as HTMLButtonElement).onclick = () => {
        saga.startRecording();
        addEvent('Recording started', 'custom');
    };
    (ctrl.querySelector('#ev-stop') as HTMLButtonElement).onclick = () => {
        saga.stopRecording();
        addEvent('Recording stopped', 'custom');
    };
    (ctrl.querySelector('#ev-replay') as HTMLButtonElement).onclick = async () => {
        addEvent('Replaying...', 'custom');
        await saga.startReplay({ delay: 200 });
        addEvent('Replay done', 'custom');
    };
}

/* ================================================================ */
/*  Section 7 — Middleware                                           */
/* ================================================================ */

function buildMiddlewareSection(container: HTMLElement): void {
    const sec = el('section', 'section');
    sec.id = 'middleware';
    sec.innerHTML = `
        <header class="sec-head">
            <h2>Middleware Pipeline</h2>
            <p>Middleware wraps every transaction. The logging middleware prints
               lifecycle events; the timing middleware measures duration.
               Both run as a chain.</p>
        </header>
    `;
    const body = el('div', 'card-grid card-grid-2');
    const ctrl = el('div', 'card');
    const log = el('div', 'card');

    ctrl.innerHTML = `
        <h3>Timed Operation</h3>
        <p class="muted small">Runs a 3-step transaction through logging + timing middleware.</p>
        <button class="btn btn-primary" id="mw-run" style="width:100%;">Run Operation</button>
        <div class="timing-stats" id="mw-stats"></div>
    `;
    log.innerHTML = `
        <h3>Middleware Output</h3>
        <pre class="log-block" id="mw-log"></pre>
    `;
    body.append(ctrl, log);
    sec.append(body);
    container.append(sec);

    interface MwState { value: number; label: string }
    const saga = SagaManager.create<MwState>({ value: 0, label: 'init' });

    /* capture console output */
    const logEl = log.querySelector('#mw-log') as HTMLPreElement;
    const statsEl = ctrl.querySelector('#mw-stats') as HTMLDivElement;
    const originalLog = console.log;
    const originalErr = console.error;

    function captureConsole(): void {
        console.log = (...args: unknown[]) => {
            originalLog(...args);
            logEl.textContent += args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ') + '\n';
            logEl.scrollTop = logEl.scrollHeight;
        };
        console.error = (...args: unknown[]) => {
            originalErr(...args);
            logEl.textContent += '⚠ ' + args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ') + '\n';
        };
    }
    function restoreConsole(): void {
        console.log = originalLog;
        console.error = originalErr;
    }

    saga.use(createLoggingMiddleware());
    let lastDuration = 0;
    saga.use(createTimingMiddleware((_name, duration) => {
        lastDuration = duration;
    }));

    const op = saga
        .createTransaction('timed-op')
        .addStep('step-a', async () => {
            await delay(150);
            saga.stateManager.setState({ ...saga.getState(), value: saga.getState().value + 1, label: 'a' });
        })
        .addStep('step-b', async () => {
            await delay(200);
            saga.stateManager.setState({ ...saga.getState(), value: saga.getState().value + 1, label: 'b' });
        })
        .addStep('step-c', async () => {
            await delay(100);
            saga.stateManager.setState({ ...saga.getState(), value: saga.getState().value + 1, label: 'c' });
        });

    (ctrl.querySelector('#mw-run') as HTMLButtonElement).onclick = async () => {
        logEl.textContent = '';
        captureConsole();
        try {
            await op.run();
            statsEl.innerHTML = `<span class="badge grad">Last duration: ${lastDuration}ms</span><span class="badge">Value: ${saga.getState().value}</span>`;
        } finally {
            restoreConsole();
        }
    };
}

/* ================================================================ */
/*  Footer                                                           */
/* ================================================================ */

function buildFooter(container: HTMLElement): void {
    const footer = el('footer', 'footer');
    footer.innerHTML = `
        <p>
            <a href="https://www.npmjs.com/package/@staga/core" target="_blank" rel="noopener">npm</a> ·
            <a href="https://github.com/kubarskii/staga" target="_blank" rel="noopener">GitHub</a> ·
            MIT License
        </p>
        <p class="muted small">Built with @staga/core — state management with sagas &amp; transactions.</p>
    `;
    container.append(footer);
}

/* ================================================================ */
/*  Bootstrap                                                        */
/* ================================================================ */

function main(): void {
    const app = document.getElementById('app');
    if (!app) throw new Error('#app not found');

    buildHero(app);
    buildStateSection(app);
    buildTransactionSection(app);
    buildReactiveSection(app);
    buildCartSection(app);
    buildEventSection(app);
    buildMiddlewareSection(app);
    buildFooter(app);
    buildNav(app);

    /* Smooth scroll */
    document.querySelectorAll('a[href^="#"]').forEach(a => {
        a.addEventListener('click', (e) => {
            const href = (a as HTMLAnchorElement).getAttribute('href');
            if (href && href.length > 1) {
                const target = document.querySelector(href);
                if (target) {
                    e.preventDefault();
                    target.scrollIntoView({ behavior: 'smooth' });
                }
            }
        });
    });

    /* Hero live stats */
    const heroStats = document.getElementById('hero-stats');
    if (heroStats) {
        const stats = [
            { label: 'Zero deps', value: '0' },
            { label: 'Bundle', value: '~10KB' },
            { label: 'Tests', value: '180+' },
            { label: 'License', value: 'MIT' },
        ];
        heroStats.innerHTML = stats
            .map(s => `<div class="stat-item"><div class="stat-value">${s.value}</div><div class="stat-label">${s.label}</div></div>`)
            .join('');
    }
}

main();
