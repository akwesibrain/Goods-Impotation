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
    links.querySelectorAll("a").forEach((link) => {
      link.addEventListener("click", () => {
        links.classList.remove("open");
        toggle.setAttribute("aria-expanded", "false");
      });
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
    prefillCategoryFromQuery(form);
  }

  applyPublicSite();
});

/**
 * Category tiles on /categories link here with ?category=..., so the
 * matching option is already selected when someone arrives from the gallery.
 */
function prefillCategoryFromQuery(form) {
  const params = new URLSearchParams(window.location.search);
  const category = params.get("category");
  if (!category) return;
  const select = form.elements.category;
  if (!select) return;
  const match = Array.from(select.options).find((opt) => opt.value === category);
  if (match) select.value = category;
}

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

async function applyPublicSite() {
  if (document.body && document.body.id === "admin-page") return;
  const client = window.getSupabaseClient && window.getSupabaseClient();
  if (!client) return;

  const { data: settings } = await client.from("site_settings").select("*").eq("id", 1).maybeSingle();
  if (settings) {
    applyChannelButton(settings);
    applySocialLinks(settings);
    showAdvertGate(settings);
  }

  await renderPublicProducts(client);
}

function applyChannelButton(settings) {
  const btn = document.querySelector(".wa-float");
  if (!btn) return;
  const channel = (settings.whatsapp_channel_url || "").trim();
  if (!channel) return;
  btn.href = channel;
  btn.setAttribute("aria-label", "Join our WhatsApp channel");
  btn.title = "Join our WhatsApp channel";
}

function applySocialLinks(settings) {
  const items = [
    ["Facebook", settings.facebook_url],
    ["Instagram", settings.instagram_url],
    ["WhatsApp", settings.whatsapp_url || settings.whatsapp_channel_url],
    ["TikTok", settings.tiktok_url],
  ].filter(([, url]) => url && String(url).trim());

  if (!items.length) return;

  document.querySelectorAll(".footer-grid").forEach((grid) => {
    let box = grid.querySelector(".social-links-box");
    if (!box) {
      box = document.createElement("div");
      box.className = "social-links-box";
      box.innerHTML = "<h4>Follow</h4><ul></ul>";
      grid.appendChild(box);
    }
    const list = box.querySelector("ul");
    list.innerHTML = items
      .map(([label, url]) => `<li><a href="${escapeAttr(url)}" target="_blank" rel="noopener">${escapeHtml(label)}</a></li>`)
      .join("");
  });
}

function showAdvertGate(settings) {
  const videoUrl = (settings.advert_video_url || "").trim();
  if (!videoUrl) return;
  if (sessionStorage.getItem("mwinbarka_advert_seen") === "1") return;
  if (document.getElementById("advert-gate")) return;

  const onRequestPage = Boolean(document.getElementById("request-form"));
  const overlay = document.createElement("div");
  overlay.id = "advert-gate";
  overlay.innerHTML = `
    <div class="advert-card">
      <span class="eyebrow">MW · Advert</span>
      <h2>Watch this first.</h2>
      <p>Then continue to request an import.</p>
      <video id="advert-video" src="${escapeAttr(videoUrl)}" controls playsinline></video>
      <a class="btn btn-gold" id="advert-continue" href="request.html">Continue to request an import</a>
    </div>
  `;
  document.body.appendChild(overlay);

  overlay.querySelector("#advert-continue").addEventListener("click", (e) => {
    sessionStorage.setItem("mwinbarka_advert_seen", "1");
    if (onRequestPage) {
      e.preventDefault();
      overlay.remove();
    }
  });
}

async function renderPublicProducts(client) {
  const grids = document.querySelectorAll("#product-grid");
  if (!grids.length) return;

  const { data, error } = await client
    .from("products")
    .select("*")
    .order("created_at", { ascending: false });

  if (error || !data || !data.length) {
    document.querySelectorAll("#products-section").forEach((section) => { section.hidden = true; });
    return;
  }

  const html = data.map((p) => `
    <article class="product-card">
      ${p.image_url ? `<img src="${escapeAttr(p.image_url)}" alt="${escapeAttr(p.name)}">` : `<div class="product-placeholder"></div>`}
      <div class="product-body">
        <span class="code">${escapeHtml(p.category || "Product")}</span>
        <h3>${escapeHtml(p.name)}</h3>
        ${p.description ? `<p>${escapeHtml(p.description)}</p>` : ""}
        ${p.price ? `<div class="product-price">GH₵${escapeHtml(p.price)}</div>` : ""}
        <a class="btn btn-gold" href="request.html">Request this</a>
      </div>
    </article>
  `).join("");

  grids.forEach((grid) => { grid.innerHTML = html; });
  document.querySelectorAll("#products-section").forEach((section) => { section.hidden = false; });
}

function escapeHtml(value) {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function escapeAttr(value) {
  return escapeHtml(value);
}
