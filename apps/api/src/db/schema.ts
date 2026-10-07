import { real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

export const items = sqliteTable('items', {
  id: text('id').primaryKey(),
  sku: text('sku').notNull().unique(),
  name: text('name').notNull(),
  unit: text('unit').notNull(),
  createdAt: text('created_at').notNull(),
})

export const warehouses = sqliteTable('warehouses', {
  id: text('id').primaryKey(),
  name: text('name').notNull().unique(),
  createdAt: text('created_at').notNull(),
})

export const jobs = sqliteTable('jobs', {
  id: text('id').primaryKey(),
  name: text('name').notNull().unique(),
  createdAt: text('created_at').notNull(),
})

export const staff = sqliteTable('staff', {
  id: text('id').primaryKey(),
  name: text('name').notNull().unique(),
  createdAt: text('created_at').notNull(),
})

export const assignments = sqliteTable('assignments', {
  id: text('id').primaryKey(),
  staffId: text('staff_id')
    .notNull()
    .references(() => staff.id),
  jobId: text('job_id')
    .notNull()
    .references(() => jobs.id),
  startDate: text('start_date').notNull(),
  endDate: text('end_date').notNull(),
  createdAt: text('created_at').notNull(),
})

export const suppliers = sqliteTable('suppliers', {
  id: text('id').primaryKey(),
  name: text('name').notNull().unique(),
  createdAt: text('created_at').notNull(),
})

export const purchases = sqliteTable('purchases', {
  id: text('id').primaryKey(),
  supplierId: text('supplier_id')
    .notNull()
    .references(() => suppliers.id),
  itemId: text('item_id')
    .notNull()
    .references(() => items.id),
  warehouseId: text('warehouse_id')
    .notNull()
    .references(() => warehouses.id),
  quantity: real('quantity').notNull(),
  createdAt: text('created_at').notNull(),
})

export const requisitions = sqliteTable('requisitions', {
  id: text('id').primaryKey(),
  itemId: text('item_id')
    .notNull()
    .references(() => items.id),
  jobId: text('job_id')
    .notNull()
    .references(() => jobs.id),
  quantity: real('quantity').notNull(),
  purchaseId: text('purchase_id').references(() => purchases.id),
  createdAt: text('created_at').notNull(),
})

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: text('role').notNull(),
  createdAt: text('created_at').notNull(),
})

export const stock = sqliteTable(
  'stock',
  {
    id: text('id').primaryKey(),
    warehouseId: text('warehouse_id')
      .notNull()
      .references(() => warehouses.id),
    itemId: text('item_id')
      .notNull()
      .references(() => items.id),
    quantity: real('quantity').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    uniqueIndex('stock_warehouse_item_unique').on(table.warehouseId, table.itemId),
  ],
)

export const movements = sqliteTable(
  'movements',
  {
    id: text('id').primaryKey(),
    type: text('type').notNull(),
    itemId: text('item_id')
      .notNull()
      .references(() => items.id),
    quantity: real('quantity').notNull(),
    warehouseId: text('warehouse_id')
      .notNull()
      .references(() => warehouses.id),
    toWarehouseId: text('to_warehouse_id').references(() => warehouses.id),
    jobId: text('job_id').references(() => jobs.id),
    purchaseId: text('purchase_id').references(() => purchases.id),
    createdAt: text('created_at').notNull(),
  },
  (table) => [uniqueIndex('movements_purchase_id_unique').on(table.purchaseId)],
)
