// ============================================================
// MWINBARKA IMPORTS — shared site behavior
// ============================================================

// WhatsApp business number in international format (no + or spaces)
const WA_NUMBER = "233540309637";

// ---- Mobile nav toggle ----
document.addEventListener("DOMContentLoaded", () => {
  const toggle = document.querySelector(".nav-toggle");
  const links = document.querySelector(".nav-links");
  if (toggle && links) {
    toggle.addEventListener("click", () => {
      links.classList.toggle("open");
      const expanded = links.classList.contains("open");
      toggle.setAttribute("aria-expanded", expanded);
    });
  }

  // ---- FAQ accordion ----
  document.querySelectorAll(".faq-item").forEach((item) => {
    const q = item.querySelector(".faq-q");
    if (!q) return;
    q.addEventListener("click", () => {
      const isOpen = item.classList.contains("open");
      document.querySelectorAll(".faq-item.open").forEach((el) => {
        if (el !== item) el.classList.remove("open");
      });
      item.classList.toggle("open", !isOpen);
    });
  });

  // ---- Request form ----
  const form = document.getElementById("request-form");
  if (form) {
    form.addEventListener("submit", handleRequestSubmit);
  }
});

/**
 * Builds a prefilled WhatsApp message from the request form and
 * opens it in a new tab. Also attempts to save the lead to Supabase
 * if SUPABASE_URL / SUPABASE_ANON_KEY have been configured below —
 * see the comment block for setup instructions.
 */
async function handleRequestSubmit(e) {
  e.preventDefault();

  const form = e.target;
  const fields = form.elements;
  const statusEl = document.getElementById("form-status");
  const submitBtn = form.querySelector('button[type="submit"]');

  const data = {
    name: fields.name.value.trim(),
    phone: fields.phone.value.trim(),
    location: fields.location.value.trim(),
    category: fields.category.value,
    request_details: fields.request_details.value.trim(),
    reference_url: fields.reference_url.value.trim(),
    budget_range: fields.budget_range.value.trim(),
  };

  if (!data.name || !data.phone || !data.request_details) {
    showStatus(statusEl, "error", "Please fill in your name, phone number, and what you'd like imported.");
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = "SENDING...";

  // Save to Supabase (see SUPABASE SETUP comment in supabase-client.js).
  // If Supabase isn't configured yet, this step is skipped silently and
  // the lead still reaches the client via WhatsApp below.
  try {
    if (window.saveRequestToSupabase) {
      await window.saveRequestToSupabase(data);
    }
  } catch (err) {
    console.error("Supabase save failed (WhatsApp will still open):", err);
  }

  // Build the WhatsApp message
  const lines = [
    `Hi Mwinbarka Imports, I'd like to request an import:`,
    `Name: ${data.name}`,
    `Phone: ${data.phone}`,
    data.location ? `Location: ${data.location}` : null,
    data.category ? `Category: ${data.category}` : null,
    `Details: ${data.request_details}`,
    data.budget_range ? `Budget: GH₵${data.budget_range}` : null,
    data.reference_url ? `Reference: ${data.reference_url}` : null,
  ].filter(Boolean);

  const message = encodeURIComponent(lines.join("\n"));
  const waUrl = `https://wa.me/${WA_NUMBER}?text=${message}`;

  showStatus(
    statusEl,
    "success",
    "Request received — opening WhatsApp to send it to Mwinbarka Imports...",
    waUrl
  );
  form.reset();
  submitBtn.disabled = false;
  submitBtn.textContent = "SEND REQUEST";

  // The Supabase save above means this runs outside the original click,
  // so a blocked popup would silently swallow the lead. Fall back to a
  // same-tab redirect, and the status message keeps a manual link too.
  const opened = window.open(waUrl, "_blank");
  if (!opened) {
    window.location.href = waUrl;
  }
}

function showStatus(el, type, msg, waUrl) {
  if (!el) return;
  el.className = `form-status ${type}`;
  el.textContent = msg;
  if (waUrl) {
    const link = document.createElement("a");
    link.href = waUrl;
    link.target = "_blank";
    link.rel = "noopener";
    link.textContent = "Didn't open? Tap here to send it on WhatsApp.";
    el.appendChild(document.createElement("br"));
    el.appendChild(link);
  }
}
