import cors from "cors";
import express, { type Request, type Response } from "express";
import {
  SHIPMENT_STATUSES,
  type NewShipment,
  type ShipmentStatus,
  type ShipmentStore,
} from "./db.js";

function validateNewShipment(body: unknown): {
  value?: NewShipment;
  error?: string;
} {
  if (typeof body !== "object" || body === null) {
    return { error: "Request body must be a JSON object." };
  }
  const b = body as Record<string, unknown>;
  const required = ["reference", "goods_description", "origin_country", "destination"];
  for (const field of required) {
    if (typeof b[field] !== "string" || (b[field] as string).trim() === "") {
      return { error: `Field "${field}" is required.` };
    }
  }
  const quantity = Number(b.quantity);
  const value_usd = Number(b.value_usd);
  if (!Number.isFinite(quantity) || quantity <= 0) {
    return { error: `Field "quantity" must be a positive number.` };
  }
  if (!Number.isFinite(value_usd) || value_usd < 0) {
    return { error: `Field "value_usd" must be a non-negative number.` };
  }
  let status: ShipmentStatus | undefined;
  if (b.status !== undefined) {
    if (!SHIPMENT_STATUSES.includes(b.status as ShipmentStatus)) {
      return { error: `Field "status" is invalid.` };
    }
    status = b.status as ShipmentStatus;
  }
  return {
    value: {
      reference: (b.reference as string).trim(),
      goods_description: (b.goods_description as string).trim(),
      origin_country: (b.origin_country as string).trim(),
      destination: (b.destination as string).trim(),
      quantity,
      value_usd,
      status,
    },
  };
}

export function createApp(store: ShipmentStore) {
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.get("/api/health", (_req: Request, res: Response) => {
    res.json({ status: "ok", service: "goods-importation", statuses: SHIPMENT_STATUSES });
  });

  app.get("/api/shipments", (_req: Request, res: Response) => {
    res.json(store.list());
  });

  app.get("/api/shipments/:id", (req: Request, res: Response) => {
    const shipment = store.get(Number(req.params.id));
    if (!shipment) {
      return res.status(404).json({ error: "Shipment not found." });
    }
    res.json(shipment);
  });

  app.post("/api/shipments", (req: Request, res: Response) => {
    const { value, error } = validateNewShipment(req.body);
    if (error) {
      return res.status(400).json({ error });
    }
    res.status(201).json(store.create(value!));
  });

  app.patch("/api/shipments/:id", (req: Request, res: Response) => {
    const status = (req.body as { status?: unknown })?.status;
    if (!SHIPMENT_STATUSES.includes(status as ShipmentStatus)) {
      return res.status(400).json({ error: `Field "status" is invalid.` });
    }
    const updated = store.updateStatus(Number(req.params.id), status as ShipmentStatus);
    if (!updated) {
      return res.status(404).json({ error: "Shipment not found." });
    }
    res.json(updated);
  });

  app.delete("/api/shipments/:id", (req: Request, res: Response) => {
    const removed = store.remove(Number(req.params.id));
    if (!removed) {
      return res.status(404).json({ error: "Shipment not found." });
    }
    res.status(204).end();
  });

  return app;
}
