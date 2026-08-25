import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    const body = await req.json().catch(() => ({}));
    const token = String(body.token || "").trim();
    if (!token) return json({ error: "Missing quote." }, 400);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL") || "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
    );

    const { data: quote, error } = await admin
      .from("quotes")
      .select(
        "id, invoice_number, public_token, customer_name, phone, email, location, line_items, freight_pesewas, duty_pesewas, agent_fee_pesewas, total_pesewas, deposit_pesewas, notes, status, created_at, request_id",
      )
      .eq("public_token", token)
      .maybeSingle();
    if (error) throw error;
    if (!quote) return json({ error: "This quote link is not valid." }, 404);

    const { data: payments } = await admin
      .from("payments")
      .select("id, amount_pesewas, status, kind, authorization_url, public_token, paid_at, created_at")
      .eq("quote_id", quote.id)
      .order("created_at", { ascending: false });

    const paid = (payments || [])
      .filter((p) => p.status === "paid")
      .reduce((sum, p) => sum + Number(p.amount_pesewas || 0), 0);
    const pendingPay = (payments || []).find((p) => p.status === "pending" && p.authorization_url);
    const balance = Math.max(0, Number(quote.total_pesewas || 0) - paid);

    return json({
      ok: true,
      quote: {
        invoice_number: quote.invoice_number,
        customer_name: quote.customer_name,
        location: quote.location,
        line_items: quote.line_items,
        freight_pesewas: quote.freight_pesewas,
        duty_pesewas: quote.duty_pesewas,
        agent_fee_pesewas: quote.agent_fee_pesewas,
        total_pesewas: quote.total_pesewas,
        deposit_pesewas: quote.deposit_pesewas,
        notes: quote.notes,
        created_at: quote.created_at,
      },
      paid_pesewas: paid,
      balance_pesewas: balance,
      pay_url: pendingPay?.authorization_url || null,
    });
  } catch (_err) {
    return json({ error: "Couldn't load this quote." }, 500);
  }
});
