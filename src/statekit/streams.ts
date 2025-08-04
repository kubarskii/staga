import type { Unsubscribe } from './utils';

type Observer<T> = (v: T) => void;

export class Stream<T> {
    private observers = new Set<Observer<T>>();
    subscribe(obs: Observer<T>): Unsubscribe {
        this.observers.add(obs);
        return () => this.observers.delete(obs);
    }
    next(v: T) {
        for (const o of [...this.observers]) o(v);
    }
    pipe<A>(op: (src: Stream<T>) => Stream<A>): Stream<A> {
        return op(this);
    }
}

export const map = <A, B>(fn: (a: A) => B) => (src: Stream<A>) => {
    const out = new Stream<B>();
    src.subscribe((v) => out.next(fn(v)));
    return out;
};

export const filter = <A>(pred: (a: A) => boolean) => (src: Stream<A>) => {
    const out = new Stream<A>();
    src.subscribe((v) => { if (pred(v)) out.next(v); });
    return out;
};


