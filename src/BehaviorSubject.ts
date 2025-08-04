/**
 * Unified reactive system for both state and events
 * Provides push-based reactivity with optional current value semantics
 */

export type Subscription = () => void;
export type Observer<T> = (value: T) => void;

/**
 * Subject for events (no current value semantics)
 * Use for events that don't need to store current state
 * @deprecated Use statekit.Stream instead. This class will be removed in the next major release.
 */
export class Subject<T> {
    protected observers: Set<Observer<T>> = new Set();
    protected _isCompleted = false;

    /**
     * Emit a value to all subscribers
     */
    next(value: T): void {
        if (this._isCompleted) {
            throw new Error('Cannot emit to completed Subject');
        }

        // Immediately notify all observers (push-based)
        for (const observer of this.observers) {
            try {
                observer(value);
            } catch (error) {
                console.error('Subject observer error:', error);
            }
        }
    }

    /**
     * Subscribe to value changes
     * Returns subscription function for cleanup
     */
    subscribe(observer: Observer<T>): Subscription {
        if (this._isCompleted) {
            throw new Error('Cannot subscribe to completed Subject');
        }

        this.observers.add(observer);

        return () => {
            this.observers.delete(observer);
        };
    }

    /**
     * Complete the subject (no more emissions)
     */
    /**
     * Complete the subject (no more emissions)
     * @deprecated Streams in statekit do not require completion. Avoid relying on this.
     */
    complete(): void {
        this._isCompleted = true;
        this.observers.clear();
    }

    /**
     * Get number of active subscribers
     */
    /**
     * Get number of active subscribers
     * @deprecated Use statekit.Stream and track subscribers in consumer if needed.
     */
    get observerCount(): number {
        return this.observers.size;
    }

    /**
     * Check if subject has been completed
     */
    /**
     * Check if subject has been completed
     * @deprecated Use statekit.Stream instead.
     */
    get isCompleted(): boolean {
        return this._isCompleted;
    }
}

/**
 * BehaviorSubject maintains a current value and immediately notifies subscribers of changes
 * Extends Subject to add current value semantics
 */
export class BehaviorSubject<T> extends Subject<T> {
    private _value: T;

    constructor(initialValue: T) {
        super();
        this._value = initialValue;
    }

    /**
     * Get the current value
     */
    get value(): T {
        if (this._isCompleted) {
            throw new Error('BehaviorSubject has been completed');
        }
        return this._value;
    }

    /**
     * Get the current value (ReactiveValue interface compatibility)
     */
    get(): T {
        return this.value;
    }

    /**
     * Set the current value (Observable interface compatibility)
     */
    set(newValue: T): void {
        this.next(newValue);
    }

    /**
     * Listeners for Observable compatibility
     */
    get listeners(): Set<Observer<T>> {
        return this.observers;
    }

    /**
     * Notify listeners for Observable compatibility
     */
    notifyListeners(newValue: T, _oldValue: T): void {
        this.next(newValue);
    }

    /**
     * Subscribe to value changes with ReactiveValue interface compatibility
     * (StateChangeListener signature: (newValue, oldValue) => void)
     */
    subscribeToChanges(listener: (newValue: T, oldValue: T) => void): () => void {
        let lastValue = this._value;

        const observer: Observer<T> = (newValue: T) => {
            const oldValue = lastValue;
            lastValue = newValue;
            try {
                listener(newValue, oldValue);
            } catch (error) {
                console.error('BehaviorSubject StateChangeListener error:', error);
            }
        };

        this.observers.add(observer);

        // Immediately call listener with current value (oldValue = current for initial call)
        try {
            listener(this._value, this._value);
        } catch (error) {
            console.error('BehaviorSubject immediate StateChangeListener error:', error);
        }

        return () => {
            this.observers.delete(observer);
        };
    }

    /**
 * Emit a new value to all subscribers
 */
    override next(value: T): void {
        if (this._isCompleted) {
            throw new Error('Cannot emit to completed BehaviorSubject');
        }

        this._value = value;
        super.next(value); // Use parent's notification logic
    }

    /**
     * Subscribe to value changes
     * Returns subscription function for cleanup
     */
    override subscribe(observer: Observer<T>): Subscription {
        if (this._isCompleted) {
            throw new Error('Cannot subscribe to completed BehaviorSubject');
        }

        const subscription = super.subscribe(observer);

        // Immediately emit current value (behavior subject characteristic)
        try {
            observer(this._value);
        } catch (error) {
            console.error('BehaviorSubject initial value error:', error);
        }

        return subscription;
    }
}

