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

function ghanaMsisdn(raw: string) {
  let digits = String(raw || "").replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("0")) digits = "233" + digits.slice(1);
  else if (!digits.startsWith("233") && digits.length === 9) digits = "233" + digits;
  return digits;
}

function fillTemplate(body: string, vars: Record<string, string>) {
  return body.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key) => vars[key] || "");
}

function formatCedis(pesewas: number) {
  return "GH₵ " + (Number(pesewas || 0) / 100).toFixed(2);
}

async function sendTxtConnect(apiKey: string, sender: string, to: string, message: string) {
  const res = await fetch("https://api.txtconnect.net/dev/api/sms/send", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      to,
      from: sender,
      unicode: /[^\x00-\x7F]/.test(message) ? "1" : "0",
      sms: message,
    }),
  });
  const payload = await res.json().catch(() => ({})) as Record<string, unknown>;
  const nested = payload.data && typeof payload.data === "object"
    ? payload.data as Record<string, unknown>
    : null;
  const statusCode = String(nested?.status_code || payload.status_code || "");
  const inError = nested?.in_error === true || payload.in_error === true;
  if (!res.ok || inError || (statusCode && statusCode !== "000")) {
    throw new Error("TxtConnect did not send the SMS.");
  }
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
        .select("id, request_id, status, kind, amount_pesewas, customer_name, phone")
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

        const { data: desk } = await admin
          .from("desk_settings")
          .select("auto_sms_on_status")
          .eq("id", 1)
          .maybeSingle();
        if (desk?.auto_sms_on_status && payment.phone) {
          const trigger = payment.kind === "deposit" ? "payment:deposit" : "payment:paid";
          const { data: templates } = await admin
            .from("sms_templates")
            .select("body")
            .eq("active", true)
            .eq("trigger_event", trigger);
          const { data: sms } = await admin
            .from("sms_settings")
            .select("api_key, sender_id, provider")
            .eq("id", 1)
            .maybeSingle();
          const apiKey = String(sms?.api_key || "").trim();
          const sender = String(sms?.sender_id || "Mwinbarka").trim();
          const to = ghanaMsisdn(String(payment.phone || ""));
          if (apiKey && to.length >= 12) {
            let orderName = String(payment.customer_name || "there");
            let orderStatus = "Confirmed";
            if (payment.request_id) {
              const { data: order } = await admin
                .from("requests")
                .select("name, status")
                .eq("id", payment.request_id)
                .maybeSingle();
              if (order?.name) orderName = String(order.name);
              if (order?.status) orderStatus = String(order.status);
            }
            for (const tpl of templates || []) {
              const text = fillTemplate(String(tpl.body || ""), {
                name: orderName,
                amount: formatCedis(Number(payment.amount_pesewas || 0)),
                line: "054 030 9637",
                status: orderStatus,
              }).slice(0, 480);
              if (!text) continue;
              try {
                if ((sms?.provider || "txtconnect") === "txtconnect") {
                  await sendTxtConnect(apiKey, sender, to, text);
                }
                await admin.from("sms_messages").insert([{
                  customer_name: payment.customer_name,
                  phone: to,
                  body: text,
                  status: "sent",
                }]);
              } catch {
                /* payment already recorded */
              }
            }
          }
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
