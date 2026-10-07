type Factory<T> = (container: Container) => T

export class Container {
  private readonly factories = new Map<string, Factory<unknown>>()
  private readonly instances = new Map<string, unknown>()

  register<T>(token: string, factory: Factory<T>): void {
    if (this.factories.has(token)) {
      throw new Error(`Already registered: ${token}`)
    }
    this.factories.set(token, factory)
  }

  get<T>(token: string): T {
    const cached = this.instances.get(token)
    if (cached) return cached as T

    const factory = this.factories.get(token)
    if (!factory) {
      throw new Error(`Not registered: ${token}`)
    }

    const instance = factory(this) as T
    this.instances.set(token, instance)
    return instance
  }

  clear(): void {
    this.factories.clear()
    this.instances.clear()
  }
}

export const tokens = {
  db: 'db',
  itemRepository: 'itemRepository',
  itemService: 'itemService',
  warehouseRepository: 'warehouseRepository',
  warehouseService: 'warehouseService',
  jobRepository: 'jobRepository',
  jobService: 'jobService',
  stockRepository: 'stockRepository',
  stockService: 'stockService',
  userRepository: 'userRepository',
  userService: 'userService',
  movementRepository: 'movementRepository',
  movementService: 'movementService',
  supplierRepository: 'supplierRepository',
  supplierService: 'supplierService',
  purchaseRepository: 'purchaseRepository',
  purchaseService: 'purchaseService',
  requisitionRepository: 'requisitionRepository',
  requisitionService: 'requisitionService',
  staffRepository: 'staffRepository',
  staffService: 'staffService',
  assignmentRepository: 'assignmentRepository',
  assignmentService: 'assignmentService',
} as const

export const container = new Container()
