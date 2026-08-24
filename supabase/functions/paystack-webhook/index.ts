import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function hmacSha512Hex(secret: string, body: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-512" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i += 1) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200 });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    const raw = await req.text();
    const admin = createClient(
      Deno.env.get("SUPABASE_URL") || "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
    );
    const { data: settings } = await admin
      .from("payment_settings")
      .select("secret_key")
      .eq("id", 1)
      .maybeSingle();
    const secretKey = String(settings?.secret_key || "").trim();
    if (!secretKey) return json({ error: "Paystack is not connected." }, 400);

    const signature = req.headers.get("x-paystack-signature") || "";
    const expected = await hmacSha512Hex(secretKey, raw);
    if (!signature || !timingSafeEqual(signature, expected)) {
      return json({ error: "Invalid signature" }, 401);
    }

    const event = JSON.parse(raw) as {
      event?: string;
      data?: { reference?: string; status?: string; amount?: number };
    };
    const reference = String(event.data?.reference || "");
    if (!reference) return json({ ok: true });

    if (event.event === "charge.success" || event.data?.status === "success") {
      const verifyRes = await fetch(
        `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
        { headers: { Authorization: `Bearer ${secretKey}` } },
      );
      const verify = await verifyRes.json().catch(() => ({})) as Record<string, unknown>;
      const verifyData = verify.data && typeof verify.data === "object"
        ? verify.data as Record<string, unknown>
        : {};
      if (String(verifyData.status || "") !== "success") {
        return json({ ok: true, ignored: true });
      }

      const { data: payment } = await admin
        .from("payments")
        .select("id, request_id, status")
        .eq("reference", reference)
        .maybeSingle();
      if (payment && payment.status !== "paid") {
        await admin.from("payments").update({
          status: "paid",
          paid_at: new Date().toISOString(),
        }).eq("id", payment.id);
        if (payment.request_id) {
          await admin.from("requests").update({ status: "Confirmed" }).eq("id", payment.request_id);
        }
      }
    } else if (event.event === "charge.failed" || event.data?.status === "failed") {
      await admin.from("payments").update({ status: "failed" }).eq("reference", reference).eq("status", "pending");
    }

    return json({ ok: true });
  } catch (_err) {
    return json({ error: "Webhook failed" }, 500);
  }
});
