import { createDb } from '../db/client'
import { ItemRepository } from '../repositories/item.repository'
import { JobRepository } from '../repositories/job.repository'
import { MovementRepository } from '../repositories/movement.repository'
import { AssignmentRepository } from '../repositories/assignment.repository'
import { PurchaseRepository } from '../repositories/purchase.repository'
import { RequisitionRepository } from '../repositories/requisition.repository'
import { StaffRepository } from '../repositories/staff.repository'
import { StockRepository } from '../repositories/stock.repository'
import { SupplierRepository } from '../repositories/supplier.repository'
import { UserRepository } from '../repositories/user.repository'
import { WarehouseRepository } from '../repositories/warehouse.repository'
import { ItemService } from '../services/item.service'
import { MovementService } from '../services/movement.service'
import { JobService } from '../services/job.service'
import { AssignmentService } from '../services/assignment.service'
import { PurchaseService } from '../services/purchase.service'
import { RequisitionService } from '../services/requisition.service'
import { StaffService } from '../services/staff.service'
import { StockService } from '../services/stock.service'
import { SupplierService } from '../services/supplier.service'
import { UserService } from '../services/user.service'
import { WarehouseService } from '../services/warehouse.service'
import { container, tokens } from './container'

export function registerServices(): void {
  container.register(tokens.db, () => createDb())
  container.register(
    tokens.itemRepository,
    (c) => new ItemRepository(c.get(tokens.db)),
  )
  container.register(
    tokens.itemService,
    (c) => new ItemService(c.get(tokens.itemRepository)),
  )
  container.register(
    tokens.warehouseRepository,
    (c) => new WarehouseRepository(c.get(tokens.db)),
  )
  container.register(
    tokens.warehouseService,
    (c) => new WarehouseService(c.get(tokens.warehouseRepository)),
  )
  container.register(
    tokens.jobRepository,
    (c) => new JobRepository(c.get(tokens.db)),
  )
  container.register(
    tokens.jobService,
    (c) => new JobService(c.get(tokens.jobRepository)),
  )
  container.register(
    tokens.stockRepository,
    (c) => new StockRepository(c.get(tokens.db)),
  )
  container.register(
    tokens.stockService,
    (c) => new StockService(c.get(tokens.stockRepository)),
  )
  container.register(
    tokens.userRepository,
    (c) => new UserRepository(c.get(tokens.db)),
  )
  container.register(
    tokens.userService,
    (c) => new UserService(c.get(tokens.userRepository)),
  )
  container.register(
    tokens.movementRepository,
    (c) => new MovementRepository(c.get(tokens.db)),
  )
  container.register(
    tokens.movementService,
    (c) => new MovementService(c.get(tokens.movementRepository)),
  )
  container.register(
    tokens.supplierRepository,
    (c) => new SupplierRepository(c.get(tokens.db)),
  )
  container.register(
    tokens.supplierService,
    (c) => new SupplierService(c.get(tokens.supplierRepository)),
  )
  container.register(
    tokens.purchaseRepository,
    (c) => new PurchaseRepository(c.get(tokens.db)),
  )
  container.register(
    tokens.purchaseService,
    (c) => new PurchaseService(c.get(tokens.purchaseRepository)),
  )
  container.register(
    tokens.requisitionRepository,
    (c) => new RequisitionRepository(c.get(tokens.db)),
  )
  container.register(
    tokens.requisitionService,
    (c) => new RequisitionService(c.get(tokens.requisitionRepository)),
  )
  container.register(
    tokens.staffRepository,
    (c) => new StaffRepository(c.get(tokens.db)),
  )
  container.register(
    tokens.staffService,
    (c) => new StaffService(c.get(tokens.staffRepository)),
  )
  container.register(
    tokens.assignmentRepository,
    (c) => new AssignmentRepository(c.get(tokens.db)),
  )
  container.register(
    tokens.assignmentService,
    (c) => new AssignmentService(c.get(tokens.assignmentRepository)),
  )
}
