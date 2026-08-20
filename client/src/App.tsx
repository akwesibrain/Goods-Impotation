import { useEffect, useMemo, useState } from "react";
import {
  api,
  type NewShipment,
  type Shipment,
  type ShipmentStatus,
} from "./api";

const STATUS_ORDER: ShipmentStatus[] = [
  "pending",
  "in_transit",
  "customs",
  "cleared",
  "delivered",
];

const STATUS_LABELS: Record<ShipmentStatus, string> = {
  pending: "Pending",
  in_transit: "In transit",
  customs: "Customs",
  cleared: "Cleared",
  delivered: "Delivered",
};

const EMPTY_FORM: NewShipment = {
  reference: "",
  goods_description: "",
  origin_country: "",
  destination: "",
  quantity: 1,
  value_usd: 0,
};

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

export default function App() {
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [form, setForm] = useState<NewShipment>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  async function refresh() {
    try {
      setShipments(await api.listShipments());
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  const totals = useMemo(() => {
    const value = shipments.reduce((sum, s) => sum + s.value_usd, 0);
    const inTransit = shipments.filter((s) => s.status === "in_transit").length;
    return { count: shipments.length, value, inTransit };
  }, [shipments]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.createShipment(form);
      setForm(EMPTY_FORM);
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  async function onStatusChange(id: number, status: ShipmentStatus) {
    try {
      await api.updateStatus(id, status);
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function onDelete(id: number) {
    try {
      await api.deleteShipment(id);
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <div className="app">
      <header className="header">
        <div>
          <h1>Goods Importation</h1>
          <p className="subtitle">Track import shipments from origin to delivery.</p>
        </div>
        <div className="stats">
          <div className="stat">
            <span className="stat-value">{totals.count}</span>
            <span className="stat-label">Shipments</span>
          </div>
          <div className="stat">
            <span className="stat-value">{totals.inTransit}</span>
            <span className="stat-label">In transit</span>
          </div>
          <div className="stat">
            <span className="stat-value">{currency.format(totals.value)}</span>
            <span className="stat-label">Total value</span>
          </div>
        </div>
      </header>

      {error && <div className="banner error">{error}</div>}

      <section className="card">
        <h2>New import shipment</h2>
        <form className="form" onSubmit={onSubmit} autoComplete="off">
          <label>
            Reference
            <input
              required
              value={form.reference}
              placeholder="IMP-1003"
              onChange={(e) => setForm({ ...form, reference: e.target.value })}
            />
          </label>
          <label>
            Goods description
            <input
              required
              value={form.goods_description}
              placeholder="Electronics"
              onChange={(e) =>
                setForm({ ...form, goods_description: e.target.value })
              }
            />
          </label>
          <label>
            Origin country
            <input
              required
              value={form.origin_country}
              placeholder="Germany"
              onChange={(e) =>
                setForm({ ...form, origin_country: e.target.value })
              }
            />
          </label>
          <label>
            Destination
            <input
              required
              value={form.destination}
              placeholder="Accra, GH"
              onChange={(e) => setForm({ ...form, destination: e.target.value })}
            />
          </label>
          <label>
            Quantity
            <input
              type="number"
              min={1}
              required
              value={form.quantity}
              onChange={(e) =>
                setForm({ ...form, quantity: Number(e.target.value) })
              }
            />
          </label>
          <label>
            Value (USD)
            <input
              type="number"
              min={0}
              required
              value={form.value_usd}
              onChange={(e) =>
                setForm({ ...form, value_usd: Number(e.target.value) })
              }
            />
          </label>
          <button type="submit" disabled={submitting}>
            {submitting ? "Adding…" : "Add shipment"}
          </button>
        </form>
      </section>

      <section className="card">
        <h2>Shipments</h2>
        {loading ? (
          <p className="muted">Loading…</p>
        ) : shipments.length === 0 ? (
          <p className="muted">No shipments yet. Add your first one above.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Reference</th>
                <th>Goods</th>
                <th>Route</th>
                <th>Qty</th>
                <th>Value</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {shipments.map((s) => (
                <tr key={s.id}>
                  <td className="mono">{s.reference}</td>
                  <td>{s.goods_description}</td>
                  <td className="muted">
                    {s.origin_country} → {s.destination}
                  </td>
                  <td>{s.quantity}</td>
                  <td>{currency.format(s.value_usd)}</td>
                  <td>
                    <select
                      className={`status status-${s.status}`}
                      value={s.status}
                      onChange={(e) =>
                        onStatusChange(s.id, e.target.value as ShipmentStatus)
                      }
                    >
                      {STATUS_ORDER.map((st) => (
                        <option key={st} value={st}>
                          {STATUS_LABELS[st]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <button
                      className="link danger"
                      onClick={() => onDelete(s.id)}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
