import "jsr:@supabase/functions-js/edge-runtime.d.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200 });
  }
  return new Response(JSON.stringify({ error: "Paystack is turned off." }), {
    status: 410,
    headers: { "Content-Type": "application/json" },
  });
});
