/**
 * MiddlewareOrchestrator handles the execution of middleware chains
 */

import type { Middleware, MiddlewareContext } from './types';

export class MiddlewareOrchestrator<TState extends object, TPayload> {
    constructor(private middleware: Middleware<TState, TPayload>[]) { }

    /**
     * Execute the middleware chain with proper composition
     */
    async executeWithMiddleware(
        context: MiddlewareContext<TState, TPayload>,
        next: () => Promise<void>
    ): Promise<void> {
        let index = -1;

        const run = async (i: number): Promise<void> => {
            if (i <= index) {
                throw new Error("next() called multiple times");
            }
            index = i;

            const mw = this.middleware[i];
            if (mw) {
                return mw(context, () => run(i + 1));
            }
            return next();
        };

        return run(0);
    }

    /**
     * Add middleware to the chain
     */
    addMiddleware(middleware: Middleware<TState, TPayload>): void {
        this.middleware.push(middleware);
    }

    /**
     * Get the current middleware count
     */
    get middlewareCount(): number {
        return this.middleware.length;
    }
}