// ============================================================
// SUPABASE SETUP — Mwinbarka Imports lead capture
// ============================================================
// This file saves each import request to a Supabase table called
// "requests" so nothing is lost even if a customer never opens
// WhatsApp. It is OPTIONAL for the site to function — script.js
// checks whether window.saveRequestToSupabase exists before
// calling it, so leaving this unconfigured just means requests
// only go through WhatsApp.
//
// SETUP STEPS:
// 1. Create a free project at https://supabase.com
// 2. Open the SQL editor and run the contents of
//    supabase/schema.sql in this repo. It creates the "requests"
//    table plus the row level security policies that let the
//    public submit requests while only a signed-in admin can
//    read or update them.
// 3. In Project Settings > API, copy your Project URL and anon
//    public key, and paste them below. The anon key is safe to
//    publish — row level security is what protects the data.
// 4. Nothing else to wire up: request.html and admin.html already
//    load the Supabase library and this file before script.js.
// ============================================================

const SUPABASE_URL = "https://kajtwabmwbncfgvehqmm.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImthanR3YWJtd2JuY2ZndmVocW1tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcxODAxMzQsImV4cCI6MjEwMjc1NjEzNH0.U7KYHYne3umDVLMyR6qcdS_7RobiiOrCESdGT1ng1p8";

/** Official production site — used for auth/email redirects. */
const SITE_ORIGIN = "https://mwinbarakaimports.shop";

let supabaseClient = null;

if (
  typeof window.supabase !== "undefined" &&
  SUPABASE_URL &&
  SUPABASE_ANON_KEY &&
  !SUPABASE_URL.includes("YOUR_SUPABASE") &&
  !SUPABASE_ANON_KEY.includes("YOUR_SUPABASE")
) {
  supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: "pkce",
    },
  });
}

window.getSessionUser = async function () {
  if (!supabaseClient) return null;
  const { data } = await supabaseClient.auth.getUser();
  return data.user || null;
};

window.getMyProfile = async function () {
  const user = await window.getSessionUser();
  if (!user || !supabaseClient) return null;
  const { data } = await supabaseClient
    .from("profiles")
    .select("id, full_name, phone, email, company_name, whatsapp, region, city, address, landmark, notify_sms, notify_whatsapp, notify_email, is_staff, staff_role, created_at")
    .eq("id", user.id)
    .maybeSingle();
  return {
    id: user.id,
    email: user.email || (data && data.email) || "",
    full_name: (data && data.full_name) || user.user_metadata?.full_name || "",
    phone: (data && data.phone) || user.user_metadata?.phone || "",
    company_name: (data && data.company_name) || "",
    whatsapp: (data && data.whatsapp) || "",
    region: (data && data.region) || "",
    city: (data && data.city) || "",
    address: (data && data.address) || "",
    landmark: (data && data.landmark) || "",
    notify_sms: !data || data.notify_sms !== false,
    notify_whatsapp: !data || data.notify_whatsapp !== false,
    notify_email: !data || data.notify_email !== false,
    is_staff: !!(data && data.is_staff),
    staff_role: (data && data.staff_role) || (data && data.is_staff ? "owner" : "assistant"),
    created_at: (data && data.created_at) || user.created_at || "",
    last_sign_in_at: user.last_sign_in_at || "",
  };
};

window.isStaffSession = async function () {
  const profile = await window.getMyProfile();
  return !!(profile && profile.is_staff);
};

window.rememberStaffPassword = function () {
  // Passwords must never be kept in browser storage.
  try { sessionStorage.removeItem("mwinbarka_staff_pw"); } catch (_) {}
};

window.markStaffWelcome = function () {
  try { sessionStorage.setItem("mwinbarka_staff_welcome", "1"); } catch (_) {}
};

window.consumeStaffWelcome = function () {
  try {
    const show = sessionStorage.getItem("mwinbarka_staff_welcome") === "1";
    if (show) sessionStorage.removeItem("mwinbarka_staff_welcome");
    return show;
  } catch (_) {
    return false;
  }
};

window.normalizeLogin = function ({ email, password }) {
  return {
    email: String(email || "").trim().toLowerCase(),
    password: String(password == null ? "" : password).replace(/^\s+|\s+$/g, ""),
  };
};

window.authRedirectUrl = function (page) {
  const file = String(page || "account.html").replace(/^\/+/, "").split(/[?#]/)[0];
  const allowed = {
    "account.html": true,
    "auth-callback.html": true,
    "reset-password.html": true,
    "admin.html": true,
  };
  const safe = allowed[file] ? file : "account.html";
  return SITE_ORIGIN + "/" + safe;
};

const AUTH_NEXT_KEY = "mwinbarka_after_auth";
const AUTH_NEXT_PAGES = {
  "request.html": true,
  "quote-list.html": true,
  "item.html": true,
  "categories.html": true,
  "index.html": true,
  "account.html": true,
};

window.safeNextPath = function (raw) {
  let value = String(raw || "").trim();
  if (!value) return "";
  try { value = decodeURIComponent(value); } catch (_) {}
  value = value.replace(/^\/+/, "");
  if (!value || /^[a-z]+:/i.test(value) || value.startsWith("//") || value.includes("\\")) return "";
  const file = value.split(/[?#]/)[0];
  if (!AUTH_NEXT_PAGES[file]) return "";
  return value;
};

window.saveAuthNext = function (url) {
  const next = window.safeNextPath(url);
  try {
    if (next) sessionStorage.setItem(AUTH_NEXT_KEY, next);
  } catch (_) {}
  return next;
};

window.peekAuthNext = function () {
  try {
    return window.safeNextPath(sessionStorage.getItem(AUTH_NEXT_KEY) || "");
  } catch (_) {
    return "";
  }
};

window.consumeAuthNext = function () {
  const next = window.peekAuthNext();
  try { sessionStorage.removeItem(AUTH_NEXT_KEY); } catch (_) {}
  return next;
};

window.continueAfterCustomerAuth = function () {
  const next = window.consumeAuthNext();
  if (!next) return false;
  window.location.replace(next);
  return true;
};

window.resolveLoginEmail = async function (identifier) {
  const raw = String(identifier || "").trim();
  if (!raw) throw new Error("Enter your email or phone.");
  if (raw.includes("@")) return raw.toLowerCase();
  // Phone numbers are resolved server-side so browsers cannot harvest emails.
  throw new Error("PHONE_NEEDS_SERVER");
};

window.signInWithIdentifier = async function ({ email, password }) {
  if (!supabaseClient) throw new Error("Account service is not connected yet.");
  const login = window.normalizeLogin({ email, password });
  if (!login.password) throw new Error("Enter your password.");
  if (login.email.includes("@")) {
    const { data, error } = await supabaseClient.auth.signInWithPassword({
      email: login.email,
      password: login.password,
    });
    if (error) throw error;
    return data;
  }
  const { data, error } = await supabaseClient.functions.invoke("auth-with-identifier", {
    body: { action: "password", identifier: login.email, password: login.password },
  });
  if (error) throw new Error("Could not log in.");
  if (!data || !data.ok || !data.session) {
    throw new Error((data && data.error) || "Email or password is wrong.");
  }
  const { error: setError } = await supabaseClient.auth.setSession({
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
  });
  if (setError) throw setError;
  return data;
};

window.requestLoginLink = async function (identifier) {
  if (!supabaseClient) throw new Error("Account service is not connected yet.");
  const raw = String(identifier || "").trim();
  if (!raw) throw new Error("Enter your email or phone.");
  if (raw.includes("@")) {
    const { error } = await supabaseClient.auth.signInWithOtp({
      email: raw.toLowerCase(),
      options: {
        shouldCreateUser: false,
        emailRedirectTo: window.authRedirectUrl("auth-callback.html"),
      },
    });
    if (error) throw error;
    return raw.toLowerCase();
  }
  const { data, error } = await supabaseClient.functions.invoke("auth-with-identifier", {
    body: {
      action: "otp",
      identifier: raw,
      redirectTo: window.authRedirectUrl("auth-callback.html"),
    },
  });
  if (error) throw new Error("Could not send the sign-in link.");
  if (!data || !data.ok) throw new Error((data && data.error) || "Could not send the sign-in link.");
  return "";
};

window.requestPasswordReset = async function (identifier) {
  if (!supabaseClient) throw new Error("Account service is not connected yet.");
  const raw = String(identifier || "").trim();
  if (!raw) throw new Error("Enter your email or phone.");
  if (raw.includes("@")) {
    const { error } = await supabaseClient.auth.resetPasswordForEmail(raw.toLowerCase(), {
      redirectTo: window.authRedirectUrl("reset-password.html"),
    });
    if (error) throw error;
    return raw.toLowerCase();
  }
  const { data, error } = await supabaseClient.functions.invoke("auth-with-identifier", {
    body: {
      action: "reset",
      identifier: raw,
      redirectTo: window.authRedirectUrl("reset-password.html"),
    },
  });
  if (error) throw new Error("Could not send the reset link.");
  if (!data || !data.ok) throw new Error((data && data.error) || "Could not send the reset link.");
  return "";
};

window.routeSignedInUser = async function () {
  const staff = await window.isStaffSession();
  if (staff) {
    if (typeof window.markStaffWelcome === "function") window.markStaffWelcome();
    window.location.replace("admin.html");
    return { isStaff: true };
  }
  if (window.continueAfterCustomerAuth && window.continueAfterCustomerAuth()) {
    return { isStaff: false };
  }
  window.location.replace("account.html");
  return { isStaff: false };
};

window.staffWelcomeMessage = function (profile) {
  const name = String((profile && profile.full_name) || "").trim();
  const first = name.split(/\s+/)[0] || "there";
  let hour = new Date().getHours();
  try {
    hour = Number(
      new Intl.DateTimeFormat("en-GB", {
        timeZone: "Africa/Accra",
        hour: "numeric",
        hourCycle: "h23",
      }).format(new Date())
    );
  } catch (_) {}
  const hello = hour < 12 ? "Good morning" : hour < 16 ? "Good afternoon" : "Good evening";
  return hello + ", " + first + ". Welcome to the Mwinbarka desk.";
};

window.friendlyLoginError = function (err) {
  const raw = String((err && err.message) || err || "");
  const text = raw.toLowerCase();
  if (text.includes("invalid login") || text.includes("invalid credentials") || text.includes("invalid_credentials")) {
    return "Email or password is wrong. Chrome may be filling an old password — tap the eye and type it again.";
  }
  if (text.includes("email not confirmed")) {
    return "Confirm this email first, then sign in.";
  }
  if (text.includes("user already registered") || text.includes("already been registered")) {
    return "That email already has an account. Log in instead.";
  }
  if (text.includes("rate") || text.includes("too many")) {
    return "Too many tries. Wait a minute, then try again.";
  }
  if (text.includes("not connected")) {
    return "Account service is not connected yet.";
  }
  return raw || "Could not log in.";
};

window.friendlySignupError = function (err) {
  const raw = String((err && err.message) || err || "");
  const text = raw.toLowerCase();
  if (text.includes("weak_password") || text.includes("password should contain") || text.includes("characters")) {
    return "Password needs upper + lower letters, a number, and a symbol (example: Brain@1234).";
  }
  if (text.includes("user already registered") || text.includes("already been registered") || text.includes("already registered")) {
    return "That email already has an account. Log in instead.";
  }
  if (text.includes("rate") || text.includes("too many")) {
    return "Too many tries. Wait a minute, then try again.";
  }
  if (window.friendlyLoginError) return window.friendlyLoginError(err);
  return raw || "Could not create the account.";
};

window.readStaffPassword = function () {
  return "";
};

window.clearStaffPassword = function () {
  try {
    sessionStorage.removeItem("mwinbarka_staff_pw");
  } catch (_) {}
};

window.signInCustomer = async function ({ email, password }) {
  if (!supabaseClient) throw new Error("Account service is not connected yet.");
  const login = window.normalizeLogin({ email, password });
  if (!login.email) throw new Error("Enter your email or phone.");
  if (!login.password) throw new Error("Enter your password.");
  await window.signInWithIdentifier(login);
  const staff = await window.isStaffSession();
  if (staff) window.markStaffWelcome();
  return { isStaff: staff };
};

window.signUpCustomer = async function ({ email, password, fullName, phone }) {
  if (!supabaseClient) throw new Error("Account service is not connected yet.");
  const cleanEmail = String(email || "").trim().toLowerCase();
  const cleanPassword = String(password == null ? "" : password);
  const cleanName = String(fullName || "").trim();
  const cleanPhone = String(phone || "").trim();
  if (!cleanEmail || !cleanEmail.includes("@")) throw new Error("Enter a valid email address.");
  if (!cleanPassword) throw new Error("Enter your password.");
  const { data, error } = await supabaseClient.auth.signUp({
    email: cleanEmail,
    password: cleanPassword,
    options: {
      data: {
        full_name: cleanName,
        phone: cleanPhone,
      },
      emailRedirectTo: window.authRedirectUrl("account.html"),
    },
  });
  if (error) throw error;
  // Profile row is created by on_auth_user_created. Optionally fill name/phone
  // with UPDATE (never upsert — upsert needs table UPDATE privilege and 403s).
  if (data.session && data.user) {
    try {
      await supabaseClient
        .from("profiles")
        .update({
          full_name: cleanName.slice(0, 100),
          phone: cleanPhone.slice(0, 20),
          email: data.user.email || cleanEmail,
          updated_at: new Date().toISOString(),
        })
        .eq("id", data.user.id);
    } catch (_err) {
      // Auth already succeeded; desk can still open.
    }
  }
  return { needsConfirm: !!(data.user && !data.session), session: data.session || null };
};

window.signOutCustomer = async function (everywhere) {
  if (window.clearStaffPassword) window.clearStaffPassword();
  if (!supabaseClient) return;
  await supabaseClient.auth.signOut({ scope: everywhere ? "global" : "local" });
};

window.transferAdminship = async function (newOwnerEmail) {
  if (!supabaseClient) throw new Error("Account service is not connected yet.");
  const email = String(newOwnerEmail || "").trim().toLowerCase();
  if (!email || !email.includes("@")) throw new Error("Enter the new owner's registered email.");
  const { data, error } = await supabaseClient.rpc("transfer_adminship", {
    new_owner_email: email,
  });
  if (error) throw new Error(error.message || "Could not transfer adminship.");
  return data;
};

window.updateMyPassword = async function ({ currentPassword, newPassword }) {
  if (!supabaseClient) throw new Error("Account service is not connected yet.");
  const user = await window.getSessionUser();
  if (!user || !user.email) throw new Error("Please log in first.");
  const { error: checkError } = await supabaseClient.auth.signInWithPassword({
    email: user.email,
    password: currentPassword,
  });
  if (checkError) throw new Error("Current password is wrong.");
  const { error } = await supabaseClient.auth.updateUser({ password: newPassword });
  if (error) throw error;
  if (window.clearStaffPassword) window.clearStaffPassword();
  return true;
};

window.updateMyEmail = async function ({ currentPassword, newEmail, emailRedirectTo }) {
  if (!supabaseClient) throw new Error("Account service is not connected yet.");
  const user = await window.getSessionUser();
  if (!user || !user.email) throw new Error("Please log in first.");
  const next = String(newEmail || "").trim().toLowerCase();
  if (!next || !next.includes("@")) throw new Error("Enter a valid email address.");
  if (next === String(user.email).toLowerCase()) {
    throw new Error("That is already the login email.");
  }
  const { error: checkError } = await supabaseClient.auth.signInWithPassword({
    email: user.email,
    password: currentPassword,
  });
  if (checkError) throw new Error("Current password is wrong.");
  const { error } = await supabaseClient.auth.updateUser(
    { email: next },
    { emailRedirectTo: emailRedirectTo || window.authRedirectUrl("account.html") },
  );
  if (error) throw error;
  await supabaseClient.from("profiles").update({
    email: next,
    updated_at: new Date().toISOString(),
  }).eq("id", user.id);
  return true;
};

window.updateMyProfile = async function (fields) {
  const user = await window.getSessionUser();
  if (!user || !supabaseClient) throw new Error("Please log in first.");
  const forms = window.MwinbarkaForms;
  const clean = forms ? forms.parseProfile(fields) : { ok: true, data: fields, errors: {} };
  if (!clean.ok) throw new Error(forms.firstError(clean.errors));
  const payload = {
    full_name: clean.data.full_name || "",
    phone: clean.data.phone || "",
    company_name: clean.data.company_name || "",
    whatsapp: clean.data.whatsapp || "",
    region: clean.data.region || "",
    city: clean.data.city || "",
    address: clean.data.address || "",
    landmark: clean.data.landmark || "",
    updated_at: new Date().toISOString(),
  };
  if (typeof fields.notify_sms === "boolean") payload.notify_sms = fields.notify_sms;
  if (typeof fields.notify_whatsapp === "boolean") payload.notify_whatsapp = fields.notify_whatsapp;
  if (typeof fields.notify_email === "boolean") payload.notify_email = fields.notify_email;
  const { error } = await supabaseClient
    .from("profiles")
    .update(payload)
    .eq("id", user.id);
  if (error) throw error;
  return true;
};

window.updateMyAlerts = async function ({ notify_sms, notify_whatsapp, notify_email }) {
  const user = await window.getSessionUser();
  if (!user || !supabaseClient) throw new Error("Please log in first.");
  const { error } = await supabaseClient
    .from("profiles")
    .update({
      notify_sms: !!notify_sms,
      notify_whatsapp: !!notify_whatsapp,
      notify_email: !!notify_email,
      updated_at: new Date().toISOString(),
    })
    .eq("id", user.id);
  if (error) throw error;
  return true;
};

window.fetchMyOrders = async function () {
  const user = await window.getSessionUser();
  if (!user || !supabaseClient) return [];
  const { data, error } = await supabaseClient
    .from("requests")
    .select("id, request_details, category, quantity, status, shipment_status, created_at, location")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
};

window.saveRequestToSupabase = async function (data) {
  if (!supabaseClient) {
    // Not configured yet — silently skip, chat still handles the lead.
    return null;
  }
  const user = await window.getSessionUser();
  const forms = window.MwinbarkaForms;
  const parsed = forms ? forms.parseImportRequest(data) : { ok: true, data, errors: {} };
  if (!parsed.ok) throw new Error(forms.firstError(parsed.errors));
  const clean = parsed.data;
  const requestId = (window.crypto && window.crypto.randomUUID)
    ? window.crypto.randomUUID()
    : "";
  const row = {
    name: clean.name,
    phone: clean.phone,
    email: clean.email || null,
    location: clean.location || null,
    request_details: clean.request_details,
    category: clean.category || null,
    reference_url: clean.reference_url || null,
    budget_range: data.budget_range || null,
    quantity: clean.quantity || null,
    origin: clean.origin || null,
    shipping_method: data.shipping_method || null,
    photo_url: clean.photo_url || data.photo_url || null,
    user_id: user ? user.id : null,
  };
  if (requestId) row.id = requestId;
  const { error } = await supabaseClient.from("requests").insert([row]);
  if (error) throw error;
  // Auto-SMS is triggered only for signed-in customers (JWT-gated edge function).
  // Guests still get the chat confirmation; staff see the lead in admin.
  if (requestId && user) {
    supabaseClient.functions.invoke("notify-new-request", {
      body: { request_id: requestId },
    }).catch(() => {});
  }
  return requestId || null;
};

// The admin dashboard needs the client itself (for login and for
// reading/updating rows), not just the insert helper above.
window.getSupabaseClient = function () {
  return supabaseClient;
};
