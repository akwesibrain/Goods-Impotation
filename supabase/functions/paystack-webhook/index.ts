import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeadersFor } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  const cors = corsHeadersFor(req);
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: cors });
  }
  return new Response(JSON.stringify({ error: "Paystack is turned off." }), {
    status: 410,
    headers: { ...cors, "Content-Type": "application/json" },
  });
});
