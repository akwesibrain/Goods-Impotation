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
    if (!requestId) return json({ ok: true, skipped: true });

    const admin = createClient(
      Deno.env.get("SUPABASE_URL") || "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
    );

    const { data: request } = await admin
      .from("requests")
      .select("id, name, phone, request_details, staff_notified_at, created_at")
      .eq("id", requestId)
      .maybeSingle();
    if (!request || request.staff_notified_at) {
      return json({ ok: true, skipped: true });
    }

    const created = new Date(String(request.created_at || "")).getTime();
    if (!Number.isFinite(created) || Date.now() - created > 10 * 60 * 1000) {
      return json({ ok: true, skipped: true });
    }

    const { data: desk } = await admin
      .from("desk_settings")
      .select("notify_phone, notify_on_new_request")
      .eq("id", 1)
      .maybeSingle();

    await admin.from("requests").update({
      staff_notified_at: new Date().toISOString(),
    }).eq("id", requestId);

    if (!desk?.notify_on_new_request) return json({ ok: true, skipped: true });
    const to = ghanaMsisdn(String(desk.notify_phone || ""));
    if (!to || to.length < 12) return json({ ok: true, skipped: true });

    const { data: sms } = await admin
      .from("sms_settings")
      .select("provider, api_key, sender_id")
      .eq("id", 1)
      .maybeSingle();
    const apiKey = String(sms?.api_key || "").trim();
    const sender = String(sms?.sender_id || "Mwinbarka").trim();
    if (!apiKey) return json({ ok: true, skipped: true });

    const snippet = String(request.request_details || "").replace(/\s+/g, " ").slice(0, 80);
    const message =
      `New order from ${request.name || "a customer"} (${request.phone || "no phone"}): ${snippet}`;

    if ((sms?.provider || "txtconnect") === "txtconnect") {
      await sendTxtConnect(apiKey, sender, to, message);
    }

    await admin.from("sms_messages").insert([{
      customer_name: "Desk alert",
      phone: to,
      body: message,
      status: "sent",
    }]);

    return json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Couldn't send the desk alert.";
    return json({ error: message }, 500);
  }
});
