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
    if (!token) return json({ error: "Missing receipt." }, 400);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL") || "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
    );

    const { data: payment, error } = await admin
      .from("payments")
      .select(
        "customer_name, phone, email, amount_pesewas, currency, reference, status, kind, invoice_number, paid_at, created_at, public_token, quote_id",
      )
      .eq("public_token", token)
      .maybeSingle();
    if (error) throw error;
    if (!payment) return json({ error: "This receipt link is not valid." }, 404);

    let quoteInvoice = payment.invoice_number;
    if (!quoteInvoice && payment.quote_id) {
      const { data: quote } = await admin
        .from("quotes")
        .select("invoice_number")
        .eq("id", payment.quote_id)
        .maybeSingle();
      quoteInvoice = quote?.invoice_number || null;
    }

    return json({
      ok: true,
      receipt: {
        customer_name: payment.customer_name,
        email: payment.email,
        amount_pesewas: payment.amount_pesewas,
        currency: payment.currency || "GHS",
        reference: payment.reference,
        status: payment.status,
        kind: payment.kind,
        invoice_number: quoteInvoice,
        paid_at: payment.paid_at,
        created_at: payment.created_at,
      },
    });
  } catch (_err) {
    return json({ error: "Couldn't load this receipt." }, 500);
  }
});
