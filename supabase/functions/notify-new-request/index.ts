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

function isUnicodeSms(message: string) {
  return /[^\x00-\x7F]/.test(message);
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
      unicode: isUnicodeSms(message) ? "1" : "0",
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
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    const body = await req.json().catch(() => ({}));
    const requestId = String(body.request_id || "").trim();
    if (!requestId) return json({ ok: true });

    const admin = createClient(
      Deno.env.get("SUPABASE_URL") || "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
    );

    const { data: order } = await admin
      .from("requests")
      .select("id, name, phone, status, shipment_status, created_at")
      .eq("id", requestId)
      .maybeSingle();
    if (!order?.phone) return json({ ok: true });

    const created = order.created_at ? new Date(String(order.created_at)).getTime() : 0;
    if (created && Date.now() - created > 5 * 60 * 1000) {
      return json({ ok: true, skipped: true });
    }

    const { data: templates } = await admin
      .from("sms_templates")
      .select("body")
      .eq("active", true)
      .eq("trigger_event", "order:New");
    if (!templates?.length) return json({ ok: true });

    const { data: sms } = await admin
      .from("sms_settings")
      .select("api_key, sender_id, provider")
      .eq("id", 1)
      .maybeSingle();
    const apiKey = String(sms?.api_key || "").trim();
    const sender = String(sms?.sender_id || "Mwinbarka").trim();
    const to = ghanaMsisdn(String(order.phone || ""));
    if (!apiKey || to.length < 12) return json({ ok: true });

    const vars = {
      name: String(order.name || "there"),
      business: "Mwinbarka Imports",
      line: "054 030 9637",
      status: String(order.status || "New"),
      shipment: "",
    };

    for (const tpl of templates) {
      const text = fillTemplate(String(tpl.body || ""), vars).slice(0, 480);
      if (!text) continue;
      try {
        if ((sms?.provider || "txtconnect") === "txtconnect") {
          await sendTxtConnect(apiKey, sender, to, text);
        }
        await admin.from("sms_messages").insert([{
          customer_name: order.name,
          phone: to,
          body: text,
          status: "sent",
        }]);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Couldn't send the SMS.";
        await admin.from("sms_messages").insert([{
          customer_name: order.name,
          phone: to,
          body: text,
          status: "failed",
          error: message,
        }]);
      }
    }

    return json({ ok: true });
  } catch (_err) {
    return json({ ok: true });
  }
});
