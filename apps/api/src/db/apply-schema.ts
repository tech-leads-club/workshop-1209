import type { Database } from 'bun:sqlite'

export function applySchema(sqlite: Database): void {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS items (
      id TEXT PRIMARY KEY NOT NULL,
      sku TEXT NOT NULL,
      name TEXT NOT NULL,
      unit TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS items_sku_unique ON items (sku);

    CREATE TABLE IF NOT EXISTS warehouses (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS warehouses_name_unique ON warehouses (name);

    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS jobs_name_unique ON jobs (name);

    CREATE TABLE IF NOT EXISTS staff (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS staff_name_unique ON staff (name);

    CREATE TABLE IF NOT EXISTS assignments (
      id TEXT PRIMARY KEY NOT NULL,
      staff_id TEXT NOT NULL,
      job_id TEXT NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (staff_id) REFERENCES staff(id),
      FOREIGN KEY (job_id) REFERENCES jobs(id)
    );

    CREATE TABLE IF NOT EXISTS stock (
      id TEXT PRIMARY KEY NOT NULL,
      warehouse_id TEXT NOT NULL,
      item_id TEXT NOT NULL,
      quantity REAL NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (warehouse_id) REFERENCES warehouses(id),
      FOREIGN KEY (item_id) REFERENCES items(id)
    );
    CREATE UNIQUE INDEX IF NOT EXISTS stock_warehouse_item_unique ON stock (warehouse_id, item_id);

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY NOT NULL,
      email TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique ON users (email);

    CREATE TABLE IF NOT EXISTS suppliers (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS suppliers_name_unique ON suppliers (name);

    CREATE TABLE IF NOT EXISTS purchases (
      id TEXT PRIMARY KEY NOT NULL,
      supplier_id TEXT NOT NULL,
      item_id TEXT NOT NULL,
      warehouse_id TEXT NOT NULL,
      quantity REAL NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (supplier_id) REFERENCES suppliers(id),
      FOREIGN KEY (item_id) REFERENCES items(id),
      FOREIGN KEY (warehouse_id) REFERENCES warehouses(id)
    );

    CREATE TABLE IF NOT EXISTS requisitions (
      id TEXT PRIMARY KEY NOT NULL,
      item_id TEXT NOT NULL,
      job_id TEXT NOT NULL,
      quantity REAL NOT NULL,
      purchase_id TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (item_id) REFERENCES items(id),
      FOREIGN KEY (job_id) REFERENCES jobs(id),
      FOREIGN KEY (purchase_id) REFERENCES purchases(id)
    );
    CREATE UNIQUE INDEX IF NOT EXISTS requisitions_purchase_id_unique ON requisitions (purchase_id);

    CREATE TABLE IF NOT EXISTS movements (
      id TEXT PRIMARY KEY NOT NULL,
      type TEXT NOT NULL,
      item_id TEXT NOT NULL,
      quantity REAL NOT NULL,
      warehouse_id TEXT NOT NULL,
      to_warehouse_id TEXT,
      job_id TEXT,
      purchase_id TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (item_id) REFERENCES items(id),
      FOREIGN KEY (warehouse_id) REFERENCES warehouses(id),
      FOREIGN KEY (to_warehouse_id) REFERENCES warehouses(id),
      FOREIGN KEY (job_id) REFERENCES jobs(id),
      FOREIGN KEY (purchase_id) REFERENCES purchases(id)
    );
    CREATE UNIQUE INDEX IF NOT EXISTS movements_purchase_id_unique ON movements (purchase_id);
  `)

  ensureMovementsPurchaseId(sqlite)
}

function ensureMovementsPurchaseId(sqlite: Database): void {
  const columns = sqlite.query('PRAGMA table_info(movements)').all() as { name: string }[]
  if (!columns.some((column) => column.name === 'purchase_id')) {
    sqlite.exec('ALTER TABLE movements ADD COLUMN purchase_id TEXT REFERENCES purchases(id)')
  }
  sqlite.exec('CREATE UNIQUE INDEX IF NOT EXISTS movements_purchase_id_unique ON movements (purchase_id)')
}
