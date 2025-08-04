/**
 * Test suite for DI Container type safety fixes
 * Tests proper type handling and elimination of 'any' types
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { 
    DIContainer,
    Injectable,
    Inject,
    InjectableEnhanced,
    InjectEnhanced,
    autoRegister,
    autoRegisterEnhanced,
    DependencyResolutionError
} from '../di/Container';

// Test service interfaces
interface ITestService {
    getValue(): string;
}

interface IRepository {
    save(data: string): void;
    load(): string;
}

// Test service implementations
class TestService implements ITestService {
    constructor(private repository: IRepository) {}
    
    getValue(): string {
        return this.repository.load();
    }
}

class MockRepository implements IRepository {
    private data = 'test-data';
    
    save(data: string): void {
        this.data = data;
    }
    
    load(): string {
        return this.data;
    }
}

// Decorated test services
@Injectable('decoratedService')
class DecoratedService {
    constructor(@Inject('repository') private repo: IRepository) {}
    
    process(): string {
        return `Processed: ${this.repo.load()}`;
    }
}

@InjectableEnhanced({ key: 'enhancedService', scope: 'singleton' })
class EnhancedService {
    constructor(@InjectEnhanced('repository') private repo: IRepository) {}
    
    execute(): string {
        return `Enhanced: ${this.repo.load()}`;
    }
}

describe('DI Container Type Safety Fixes', () => {
    let container: DIContainer;

    beforeEach(() => {
        container = new DIContainer();
    });

    describe('Type-Safe Service Registration', () => {
        it('should register services with proper typing', () => {
            // Register with unknown[] instead of any[]
            container.register<IRepository>(
                'repository',
                () => new MockRepository(),
                { scope: 'singleton' }
            );

            container.register<ITestService>(
                'testService',
                (repo: IRepository) => new TestService(repo),
                { dependencies: ['repository'], scope: 'transient' }
            );

            expect(container.isRegistered('repository')).toBe(true);
            expect(container.isRegistered('testService')).toBe(true);
        });

        it('should handle factory functions with unknown parameters', () => {
            const factoryWithUnknownDeps = (...deps: unknown[]) => {
                const [repo] = deps as [IRepository];
                return new TestService(repo);
            };

            container.register('repository', () => new MockRepository());
            container.register('typedService', factoryWithUnknownDeps, {
                dependencies: ['repository']
            });

            const service = container.resolve<ITestService>('typedService');
            expect(service.getValue()).toBe('test-data');
        });
    });

    describe('Type-Safe Resolution', () => {
        beforeEach(() => {
            container.register<IRepository>('repository', () => new MockRepository());
            container.register<ITestService>(
                'testService',
                (repo: IRepository) => new TestService(repo),
                { dependencies: ['repository'] }
            );
        });

        it('should resolve services with proper type inference', () => {
            const service = container.resolve<ITestService>('testService');
            expect(service).toBeInstanceOf(TestService);
            expect(service.getValue()).toBe('test-data');
        });

        it('should handle missing dependencies gracefully', () => {
            container.register('dependentService', (missing: unknown) => {
                return { data: missing || 'fallback' };
            }, { dependencies: ['nonExistent'] });

            expect(() => container.resolve('dependentService')).toThrow(DependencyResolutionError);
        });

        it('should provide proper error context for resolution failures', () => {
            try {
                container.resolve('nonExistentService');
            } catch (error) {
                expect(error).toBeInstanceOf(DependencyResolutionError);
                expect((error as DependencyResolutionError).dependencyKey).toBe('nonExistentService');
            }
        });
    });

    describe('Decorator Type Safety', () => {
        it('should handle Injectable decorator with proper constructor typing', () => {
            // DecoratedService uses @Injectable decorator
            const services = [DecoratedService];
            
            container.register<IRepository>('repository', () => new MockRepository());
            
            expect(() => autoRegister(container, services)).not.toThrow();
            expect(container.isRegistered('decoratedService')).toBe(true);
        });

        it('should handle enhanced decorators with metadata', () => {
            const services = [EnhancedService];
            
            container.register<IRepository>('repository', () => new MockRepository());
            
            expect(() => autoRegisterEnhanced(container, services)).not.toThrow();
            expect(container.isRegistered('enhancedService')).toBe(true);
        });

        it('should resolve decorated services correctly', () => {
            container.register<IRepository>('repository', () => new MockRepository());
            autoRegister(container, [DecoratedService]);
            
            const service = container.resolve<DecoratedService>('decoratedService');
            expect(service.process()).toBe('Processed: test-data');
        });
    });

    describe('Enhanced Type Safety Features', () => {
        it('should handle property injection with type safety', () => {
            class ServiceWithPropertyInjection {
                repository?: IRepository;
                
                getValue(): string {
                    return this.repository?.load() || 'no-data';
                }
            }

            container.register<IRepository>('repository', () => new MockRepository());
            container.register('propertyService', () => {
                const instance = new ServiceWithPropertyInjection();
                // Property injection would be handled by the enhanced auto-register
                (instance as Record<string, unknown>)['repository'] = container.resolve('repository');
                return instance;
            });

            const service = container.resolve<ServiceWithPropertyInjection>('propertyService');
            expect(service.getValue()).toBe('test-data');
        });

        it('should handle optional dependencies correctly', () => {
            class ServiceWithOptionalDep {
                constructor(private optional?: unknown) {}
                
                hasOptional(): boolean {
                    return this.optional !== undefined;
                }
            }

            container.register('optionalService', (...deps: unknown[]) => {
                return new ServiceWithOptionalDep(deps[0]);
            }, { dependencies: [] }); // No dependencies

            const service = container.resolve<ServiceWithOptionalDep>('optionalService');
            expect(service.hasOptional()).toBe(false);
        });
    });

    describe('Metadata Handling Safety', () => {
        it('should handle metadata storage with proper typing', () => {
            class MetadataTestService {
                static metadata = { custom: 'value' };
            }

            container.register('metadataService', () => new MetadataTestService(), {
                metadata: { version: '1.0', type: 'test' }
            });

            const registration = container.getRegistration('metadataService');
            expect(registration?.metadata).toEqual({ version: '1.0', type: 'test' });
        });

        it('should handle missing metadata gracefully', () => {
            class NoMetadataService {}

            container.register('noMetadataService', () => new NoMetadataService());
            
            const registration = container.getRegistration('noMetadataService');
            expect(registration?.metadata).toBeUndefined();
        });
    });

    describe('Lifecycle Management Safety', () => {
        it('should handle singleton lifecycle correctly', () => {
            let instanceCount = 0;
            
            container.register('singletonService', () => {
                instanceCount++;
                return { id: instanceCount };
            }, { scope: 'singleton' });

            const instance1 = container.resolve<{ id: number }>('singletonService');
            const instance2 = container.resolve<{ id: number }>('singletonService');

            expect(instance1).toBe(instance2);
            expect(instanceCount).toBe(1);
        });

        it('should handle transient lifecycle correctly', () => {
            let instanceCount = 0;
            
            container.register('transientService', () => {
                instanceCount++;
                return { id: instanceCount };
            }, { scope: 'transient' });

            const instance1 = container.resolve<{ id: number }>('transientService');
            const instance2 = container.resolve<{ id: number }>('transientService');

            expect(instance1).not.toBe(instance2);
            expect(instanceCount).toBe(2);
        });

        it('should handle scoped lifecycle correctly', () => {
            let instanceCount = 0;
            
            container.register('scopedService', () => {
                instanceCount++;
                return { id: instanceCount };
            }, { scope: 'scoped' });

            container.beginScope();
            const instance1 = container.resolve<{ id: number }>('scopedService');
            const instance2 = container.resolve<{ id: number }>('scopedService');
            
            expect(instance1).toBe(instance2);
            expect(instanceCount).toBe(1);

            container.endScope();
            container.beginScope();
            const instance3 = container.resolve<{ id: number }>('scopedService');
            
            expect(instance3).not.toBe(instance1);
            expect(instanceCount).toBe(2);
        });
    });
});

