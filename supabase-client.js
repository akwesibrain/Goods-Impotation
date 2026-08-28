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
const SUPABASE_ANON_KEY = "sb_publishable_OthsZo5O7gJ_w23GJVdmuQ_EBsh6gsn";

let supabaseClient = null;

if (
  typeof window.supabase !== "undefined" &&
  SUPABASE_URL &&
  SUPABASE_ANON_KEY &&
  !SUPABASE_URL.includes("YOUR_SUPABASE") &&
  !SUPABASE_ANON_KEY.includes("YOUR_SUPABASE")
) {
  supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
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
    .select("id, full_name, phone, company_name, whatsapp, region, city, address, landmark, notify_sms, notify_whatsapp, notify_email, is_staff, staff_role, created_at")
    .eq("id", user.id)
    .maybeSingle();
  return {
    id: user.id,
    email: user.email || "",
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

window.signInCustomer = async function ({ email, password }) {
  if (!supabaseClient) throw new Error("Account service is not connected yet.");
  const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
  if (error) throw error;
  if (window.markAdvertSkippedForAccount) window.markAdvertSkippedForAccount();
  return true;
};

window.signUpCustomer = async function ({ email, password, fullName, phone }) {
  if (!supabaseClient) throw new Error("Account service is not connected yet.");
  const { data, error } = await supabaseClient.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName || "", phone: phone || "" } },
  });
  if (error) throw error;
  if (window.markAdvertSkippedForAccount) window.markAdvertSkippedForAccount();
  if (data.session && data.user) {
    await supabaseClient.from("profiles").upsert({
      id: data.user.id,
      full_name: fullName || "",
      phone: phone || "",
    }, { onConflict: "id" });
  }
  return { needsConfirm: !!(data.user && !data.session) };
};

window.signOutCustomer = async function (everywhere) {
  if (!supabaseClient) return;
  await supabaseClient.auth.signOut({ scope: everywhere ? "global" : "local" });
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
    { emailRedirectTo: emailRedirectTo || window.location.href.split("#")[0] },
  );
  if (error) throw error;
  return true;
};

window.updateMyProfile = async function (fields) {
  const user = await window.getSessionUser();
  if (!user || !supabaseClient) throw new Error("Please log in first.");
  const payload = {
    full_name: fields.full_name || "",
    phone: fields.phone || "",
    company_name: fields.company_name || "",
    whatsapp: fields.whatsapp || "",
    region: fields.region || "",
    city: fields.city || "",
    address: fields.address || "",
    landmark: fields.landmark || "",
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
  const requestId = (window.crypto && window.crypto.randomUUID)
    ? window.crypto.randomUUID()
    : "";
  const row = {
    name: data.name,
    phone: data.phone,
    email: data.email || null,
    location: data.location || null,
    request_details: data.request_details,
    category: data.category || null,
    reference_url: data.reference_url || null,
    budget_range: data.budget_range || null,
    quantity: data.quantity || null,
    origin: data.origin || null,
    shipping_method: data.shipping_method || null,
    photo_url: data.photo_url || null,
    user_id: user ? user.id : null,
  };
  if (requestId) row.id = requestId;
  const { error } = await supabaseClient.from("requests").insert([row]);
  if (error) throw error;
  if (requestId) {
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
