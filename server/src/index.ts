import { createApp } from "./app.js";
import { createDb, type NewShipment } from "./db.js";

const PORT = Number(process.env.PORT ?? 3001);
const DB_FILE = process.env.DB_FILE ?? "data/goods.sqlite";

const store = createDb(DB_FILE);

// Seed a few example shipments on first run so the UI is not empty.
if (store.list().length === 0) {
  const seed: NewShipment[] = [
    {
      reference: "IMP-1001",
      goods_description: "Arabica coffee beans (60kg sacks)",
      origin_country: "Ethiopia",
      destination: "Rotterdam, NL",
      quantity: 320,
      value_usd: 84000,
      status: "in_transit",
    },
    {
      reference: "IMP-1002",
      goods_description: "Ceramic floor tiles",
      origin_country: "Spain",
      destination: "Tema, GH",
      quantity: 1500,
      value_usd: 42500,
      status: "customs",
    },
  ];
  for (const s of seed) store.create(s);
}

const app = createApp(store);

app.listen(PORT, () => {
  console.log(`Goods Importation API listening on http://localhost:${PORT}`);
  console.log(`Database file: ${DB_FILE}`);
});
