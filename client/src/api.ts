export type ShipmentStatus =
  | "pending"
  | "in_transit"
  | "customs"
  | "cleared"
  | "delivered";

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

export interface NewShipment {
  reference: string;
  goods_description: string;
  origin_country: string;
  destination: string;
  quantity: number;
  value_usd: number;
}

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  async listShipments(): Promise<Shipment[]> {
    return handle(await fetch("/api/shipments"));
  },
  async createShipment(input: NewShipment): Promise<Shipment> {
    return handle(
      await fetch("/api/shipments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      }),
    );
  },
  async updateStatus(id: number, status: ShipmentStatus): Promise<Shipment> {
    return handle(
      await fetch(`/api/shipments/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      }),
    );
  },
  async deleteShipment(id: number): Promise<void> {
    const res = await fetch(`/api/shipments/${id}`, { method: "DELETE" });
    if (!res.ok) throw new Error(`Delete failed (${res.status})`);
  },
};
