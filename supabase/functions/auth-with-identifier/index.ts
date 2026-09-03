import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeadersFor } from "../_shared/cors.ts";

function json(req: Request, body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeadersFor(req), "Content-Type": "application/json" },
  });
}

function isSafeRedirect(url: string) {
  try {
    const u = new URL(url);
    if (u.hostname === "localhost" || u.hostname === "127.0.0.1") return true;
    if (u.protocol !== "https:") return false;
    if (u.hostname === "www.mwinbarakaimports.shop") return true;
    if (u.hostname === "mwinbarakaimports.shop") return true;
    if (u.hostname === "goods-impotation.vercel.app") return true;
    if (u.hostname.endsWith(".netlify.app")) return true;
    return /^goods-impotation[-.].+\.vercel\.app$/.test(u.hostname);
  } catch {
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeadersFor(req) });
  }
  if (req.method !== "POST") {
    return json(req, { error: "Method not allowed" }, 405);
  }

  try {
    const body = await req.json().catch(() => ({}));
    const identifier = String(body.identifier || "").trim();
    const action = String(body.action || "password").trim().toLowerCase();
    const password = String(body.password == null ? "" : body.password);
    const redirectTo = String(body.redirectTo || "").trim();

    if (!identifier) {
      return json(req, { error: "Enter your email or phone." }, 400);
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL") || "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
    );

    const { data: resolved, error: resolveError } = await admin.rpc(
      "login_email_for_identifier",
      { p_id: identifier },
    );
    if (resolveError) {
      return json(req, { error: "Could not check that login. Try again." }, 400);
    }

    // Never disclose whether the phone/email exists for link flows.
    if (action === "otp" || action === "reset") {
      if (!redirectTo || !isSafeRedirect(redirectTo)) {
        return json(req, { error: "Invalid redirect." }, 400);
      }
      if (resolved) {
        if (action === "otp") {
          await admin.auth.signInWithOtp({
            email: String(resolved),
            options: { shouldCreateUser: false, emailRedirectTo: redirectTo },
          });
        } else {
          await admin.auth.resetPasswordForEmail(String(resolved), {
            redirectTo,
          });
        }
      }
      return json(req, {
        ok: true,
        message: "If an account matches, we sent a message to the email on file.",
      });
    }

    if (!password) {
      return json(req, { error: "Enter your password." }, 400);
    }
    if (!resolved) {
      return json(req, { error: "Email or password is wrong." }, 400);
    }

    const anon = createClient(
      Deno.env.get("SUPABASE_URL") || "",
      Deno.env.get("SUPABASE_ANON_KEY") || "",
    );
    const { data, error } = await anon.auth.signInWithPassword({
      email: String(resolved),
      password,
    });
    if (error || !data.session) {
      return json(req, { error: "Email or password is wrong." }, 400);
    }

    return json(req, {
      ok: true,
      session: {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        expires_in: data.session.expires_in,
        expires_at: data.session.expires_at,
        token_type: data.session.token_type,
        user: data.session.user,
      },
    });
  } catch (_err) {
    return json(req, { error: "Could not log in." }, 500);
  }
});
