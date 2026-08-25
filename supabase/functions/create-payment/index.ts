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

function anonKey() {
  const legacy = Deno.env.get("SUPABASE_ANON_KEY");
  if (legacy) return legacy;
  try {
    return JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") || "{}").default;
  } catch {
    return "";
  }
}

function pesewasFromCedis(raw: unknown) {
  const text = String(raw ?? "").replace(/,/g, "").replace(/[^\d.]/g, "");
  const cedis = Number(text);
  if (!Number.isFinite(cedis) || cedis <= 0) return 0;
  return Math.round(cedis * 100);
}

function paymentReference() {
  const rand = crypto.randomUUID().replace(/-/g, "").slice(0, 10).toUpperCase();
  return `MW-${Date.now()}-${rand}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") || "",
      anonKey(),
      { global: { headers: { Authorization: authHeader } } },
    );

    const token = authHeader.replace(/^Bearer\s+/i, "");
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData.user) {
      return json({ error: "Sign in as staff to create a payment link." }, 401);
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("is_staff")
      .eq("id", userData.user.id)
      .maybeSingle();
    if (!profile?.is_staff) {
      return json({ error: "This desk is for staff only." }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const email = String(body.email || "").trim().toLowerCase();
    const name = String(body.name || "").trim();
    const phone = String(body.phone || "").trim();
    const requestId = String(body.request_id || "").trim() || null;
    const quoteId = String(body.quote_id || "").trim() || null;
    const kindRaw = String(body.kind || "full").trim().toLowerCase();
    const kind = kindRaw === "deposit" || kindRaw === "balance" ? kindRaw : "full";
    const amountPesewas = pesewasFromCedis(body.amount);
    const callbackUrl = String(body.callback_url || "").trim() ||
      "https://goods-impotation.vercel.app/pay";

    if (!email || !email.includes("@")) {
      return json({ error: "Paystack needs a customer email for the receipt." }, 400);
    }
    if (!amountPesewas) {
      return json({ error: "Enter a GH₵ amount greater than 0." }, 400);
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL") || "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
    );
    const { data: settings, error: settingsError } = await admin
      .from("payment_settings")
      .select("secret_key")
      .eq("id", 1)
      .maybeSingle();
    if (settingsError) throw settingsError;
    const secretKey = String(settings?.secret_key || "").trim();
    if (!secretKey) {
      return json({
        error: "Paste your Paystack secret key in the Payments tab first.",
      }, 400);
    }

    let invoiceNumber = String(body.invoice_number || "").trim() || null;
    if (quoteId) {
      const { data: quote } = await admin
        .from("quotes")
        .select("invoice_number, customer_name, phone, email")
        .eq("id", quoteId)
        .maybeSingle();
      if (quote?.invoice_number) invoiceNumber = quote.invoice_number;
    }

    const reference = paymentReference();
    const publicToken = crypto.randomUUID().replace(/-/g, "");
    const paystackRes = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secretKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email,
        amount: String(amountPesewas),
        currency: "GHS",
        reference,
        callback_url: callbackUrl,
        channels: ["card", "mobile_money", "bank"],
        metadata: {
          request_id: requestId,
          quote_id: quoteId,
          customer_name: name,
          phone,
          kind,
          invoice_number: invoiceNumber,
        },
      }),
    });
    const paystack = await paystackRes.json().catch(() => ({})) as Record<string, unknown>;
    const paystackData = paystack.data && typeof paystack.data === "object"
      ? paystack.data as Record<string, unknown>
      : {};
    if (!paystackRes.ok || paystack.status === false) {
      throw new Error(String(paystack.message || "Paystack did not create the payment link."));
    }

    const authorizationUrl = String(paystackData.authorization_url || "");
    const { data: inserted, error: insertError } = await admin.from("payments").insert([{
      request_id: requestId,
      quote_id: quoteId,
      kind,
      invoice_number: invoiceNumber,
      public_token: publicToken,
      customer_name: name || null,
      phone: phone || null,
      email,
      amount_pesewas: amountPesewas,
      currency: "GHS",
      reference,
      authorization_url: authorizationUrl || null,
      status: "pending",
      created_by: userData.user.id,
    }]).select("id, public_token").maybeSingle();
    if (insertError) throw insertError;

    return json({
      ok: true,
      reference,
      authorization_url: authorizationUrl,
      amount_pesewas: amountPesewas,
      public_token: inserted?.public_token || publicToken,
      invoice_number: invoiceNumber,
      kind,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Couldn't create the payment link.";
    return json({ error: message }, 500);
  }
});
