import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeadersFor } from "../_shared/cors.ts";

function json(req: Request, body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeadersFor(req), "Content-Type": "application/json" },
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

function ghanaMsisdn(raw: string) {
  let digits = String(raw || "").replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("0")) digits = "233" + digits.slice(1);
  else if (!digits.startsWith("233") && digits.length === 9) digits = "233" + digits;
  return digits;
}

function smsErrorText(payload: Record<string, unknown>, fallback: string) {
  const nested = payload.data && typeof payload.data === "object"
    ? payload.data as Record<string, unknown>
    : null;
  return String(
    payload.message ||
      payload.msg ||
      payload.error ||
      payload.reason ||
      nested?.message ||
      nested?.reason ||
      fallback,
  );
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
    throw new Error(smsErrorText(payload, "TxtConnect did not send the SMS."));
  }
  return payload;
}

async function sendArkesel(apiKey: string, sender: string, to: string, message: string) {
  const res = await fetch("https://sms.arkesel.com/api/v2/sms/send", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-key": apiKey,
    },
    body: JSON.stringify({
      sender,
      message,
      recipients: [to],
    }),
  });
  const payload = await res.json().catch(() => ({}));
  const status = String(payload.status || "").toLowerCase();
  if (!res.ok || status === "error" || status === "fail") {
    throw new Error(
      payload.message || payload.error || "Arkesel did not send the SMS.",
    );
  }
  return payload;
}

async function sendTwilio(
  sid: string,
  token: string,
  from: string,
  to: string,
  message: string,
) {
  const auth = btoa(`${sid}:${token}`);
  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        To: to.startsWith("+") ? to : `+${to}`,
        From: from,
        Body: message,
      }),
    },
  );
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(payload.message || "Twilio did not send the SMS.");
  }
  return payload;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeadersFor(req) });
  }
  if (req.method !== "POST") {
    return json(req, { error: "Method not allowed" }, 405);
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
      return json(req, { error: "Sign in as staff to send SMS." }, 401);
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("is_staff")
      .eq("id", userData.user.id)
      .maybeSingle();
    if (!profile?.is_staff) {
      return json(req, { error: "This desk is for staff only." }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const name = String(body.name || "").replace(/<[^>]+>/g, "").trim().slice(0, 100);
    const message = String(body.message || "").replace(/<[^>]+>/g, "").trim();
    const phone = ghanaMsisdn(String(body.phone || ""));

    if (!phone || phone.length < 12) {
      return json(req, { error: "Enter a valid Ghana phone number." }, 400);
    }
    if (!message) {
      return json(req, { error: "Write the SMS first." }, 400);
    }
    if (message.length > 480) {
      return json(req, { error: "Keep the SMS under 480 characters." }, 400);
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL") || "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
    );
    const { data: settings, error: settingsError } = await admin
      .from("sms_settings")
      .select("provider, api_key, account_sid, sender_id")
      .eq("id", 1)
      .maybeSingle();
    if (settingsError) throw settingsError;

    const provider = settings?.provider || "txtconnect";
    const apiKey = (
      settings?.api_key ||
      Deno.env.get("TXTCONNECT_API_KEY") ||
      Deno.env.get("ARKESEL_API_KEY") ||
      ""
    ).trim();
    const senderId = (settings?.sender_id || Deno.env.get("SMS_SENDER_ID") || "Mwinbarka").trim();
    const accountSid = (settings?.account_sid || Deno.env.get("TWILIO_ACCOUNT_SID") || "").trim();

    try {
      if (provider === "twilio") {
        if (!accountSid || !apiKey || !senderId) {
          throw new Error(
            "Save your Twilio Account SID, Auth Token, and From number in the SMS tab first.",
          );
        }
        await sendTwilio(accountSid, apiKey, senderId, phone, message);
      } else if (provider === "arkesel") {
        if (!apiKey || !senderId) {
          throw new Error(
            "Save your Arkesel API key and sender ID in the SMS tab first.",
          );
        }
        await sendArkesel(apiKey, senderId, phone, message);
      } else {
        if (!apiKey || !senderId) {
          throw new Error(
            "Save your TxtConnect API key and sender ID in the SMS tab first.",
          );
        }
        await sendTxtConnect(apiKey, senderId, phone, message);
      }

      await supabase.from("sms_messages").insert([{
        customer_name: name || null,
        phone,
        body: message,
        status: "sent",
        created_by: userData.user.id,
      }]);

      return json(req, { ok: true, phone });
    } catch (sendErr) {
      const errMessage = sendErr instanceof Error ? sendErr.message : "Couldn't send the SMS.";
      await supabase.from("sms_messages").insert([{
        customer_name: name || null,
        phone,
        body: message,
        status: "failed",
        error: errMessage,
        created_by: userData.user.id,
      }]);
      return json(req, { error: errMessage }, 400);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Couldn't send the SMS.";
    return json(req, { error: message }, 500);
  }
});
