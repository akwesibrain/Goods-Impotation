import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

export interface Shipment {
  id: number;
  reference: string;
  goods_description: string;
  origin_country: string;
  destination: string;
  quantity: number;
  value_usd: number;
  status: ShipmentStatus;
  created_at: string;
}

export type ShipmentStatus =
  | "pending"
  | "in_transit"
  | "customs"
  | "cleared"
  | "delivered";

export const SHIPMENT_STATUSES: ShipmentStatus[] = [
  "pending",
  "in_transit",
  "customs",
  "cleared",
  "delivered",
];

export interface NewShipment {
  reference: string;
  goods_description: string;
  origin_country: string;
  destination: string;
  quantity: number;
  value_usd: number;
  status?: ShipmentStatus;
}

/**
 * Creates a SQLite-backed store for import shipments. Passing ":memory:"
 * yields an ephemeral database, which the test-suite relies on for isolation.
 */
export function createDb(file: string) {
  if (file !== ":memory:") {
    mkdirSync(dirname(file), { recursive: true });
  }

  const db = new Database(file);
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS shipments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      reference TEXT NOT NULL,
      goods_description TEXT NOT NULL,
      origin_country TEXT NOT NULL,
      destination TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      value_usd REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  return {
    list(): Shipment[] {
      return db
        .prepare("SELECT * FROM shipments ORDER BY id DESC")
        .all() as Shipment[];
    },
    get(id: number): Shipment | undefined {
      return db.prepare("SELECT * FROM shipments WHERE id = ?").get(id) as
        | Shipment
        | undefined;
    },
    create(input: NewShipment): Shipment {
      const result = db
        .prepare(
          `INSERT INTO shipments
            (reference, goods_description, origin_country, destination, quantity, value_usd, status)
           VALUES (@reference, @goods_description, @origin_country, @destination, @quantity, @value_usd, @status)`,
        )
        .run({
          reference: input.reference,
          goods_description: input.goods_description,
          origin_country: input.origin_country,
          destination: input.destination,
          quantity: input.quantity,
          value_usd: input.value_usd,
          status: input.status ?? "pending",
        });
      return this.get(Number(result.lastInsertRowid))!;
    },
    updateStatus(id: number, status: ShipmentStatus): Shipment | undefined {
      db.prepare("UPDATE shipments SET status = ? WHERE id = ?").run(status, id);
      return this.get(id);
    },
    remove(id: number): boolean {
      return db.prepare("DELETE FROM shipments WHERE id = ?").run(id).changes > 0;
    },
    close() {
      db.close();
    },
  };
}

export type ShipmentStore = ReturnType<typeof createDb>;
