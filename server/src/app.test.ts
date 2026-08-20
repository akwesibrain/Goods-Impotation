import { afterEach, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "./app.js";
import { createDb, type ShipmentStore } from "./db.js";

describe("Goods Importation API", () => {
  let store: ShipmentStore;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    store = createDb(":memory:");
    app = createApp(store);
  });

  afterEach(() => {
    store.close();
  });

  const validShipment = {
    reference: "IMP-2001",
    goods_description: "Solar inverters",
    origin_country: "China",
    destination: "Accra, GH",
    quantity: 50,
    value_usd: 120000,
  };

  it("reports health", async () => {
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
    expect(res.body.statuses).toContain("delivered");
  });

  it("starts with no shipments", async () => {
    const res = await request(app).get("/api/shipments");
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it("creates a shipment and reads it back", async () => {
    const create = await request(app).post("/api/shipments").send(validShipment);
    expect(create.status).toBe(201);
    expect(create.body.id).toBeGreaterThan(0);
    expect(create.body.status).toBe("pending");
    expect(create.body.reference).toBe("IMP-2001");

    const list = await request(app).get("/api/shipments");
    expect(list.body).toHaveLength(1);

    const get = await request(app).get(`/api/shipments/${create.body.id}`);
    expect(get.status).toBe(200);
    expect(get.body.goods_description).toBe("Solar inverters");
  });

  it("rejects an invalid shipment", async () => {
    const res = await request(app)
      .post("/api/shipments")
      .send({ ...validShipment, reference: "" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/reference/);
  });

  it("rejects a non-positive quantity", async () => {
    const res = await request(app)
      .post("/api/shipments")
      .send({ ...validShipment, quantity: 0 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/quantity/);
  });

  it("updates shipment status", async () => {
    const create = await request(app).post("/api/shipments").send(validShipment);
    const patch = await request(app)
      .patch(`/api/shipments/${create.body.id}`)
      .send({ status: "cleared" });
    expect(patch.status).toBe(200);
    expect(patch.body.status).toBe("cleared");
  });

  it("rejects an invalid status update", async () => {
    const create = await request(app).post("/api/shipments").send(validShipment);
    const patch = await request(app)
      .patch(`/api/shipments/${create.body.id}`)
      .send({ status: "nonsense" });
    expect(patch.status).toBe(400);
  });

  it("deletes a shipment", async () => {
    const create = await request(app).post("/api/shipments").send(validShipment);
    const del = await request(app).delete(`/api/shipments/${create.body.id}`);
    expect(del.status).toBe(204);
    const get = await request(app).get(`/api/shipments/${create.body.id}`);
    expect(get.status).toBe(404);
  });
});
