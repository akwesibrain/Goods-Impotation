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

window.saveRequestToSupabase = async function (data) {
  if (!supabaseClient) {
    // Not configured yet — silently skip, WhatsApp still handles the lead.
    return null;
  }
  const { error } = await supabaseClient.from("requests").insert([
    {
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
    },
  ]);
  if (error) throw error;
  return true;
};

// The admin dashboard needs the client itself (for login and for
// reading/updating rows), not just the insert helper above.
window.getSupabaseClient = function () {
  return supabaseClient;
};
