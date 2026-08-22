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
    setupPhotoPreview(form);
  }

  applyPublicSite();
  mountAnnounceBar();
  mountSiteSearch();
  mountFeatureNav();
  enhanceSearch();
  mountMobileChrome();
  renderPopularSourcing();
  renderQuoteListPage();
  setupShippingAdvisor();
  bindQuoteButtons();
  renderItemPage();
  restoreSearchPhoto();
});

/**
 * Category tiles on /categories link here with ?category=..., so the
 * matching option is already selected when someone arrives from the gallery.
 */
function prefillCategoryFromQuery(form) {
  const params = new URLSearchParams(window.location.search);
  const category = params.get("category");
  if (category) {
    const select = form.elements.category;
    if (select) {
      const match = Array.from(select.options).find((opt) => opt.value === category);
      if (match) select.value = category;
    }
  }
  const q = (params.get("q") || "").trim();
  const qty = (params.get("qty") || "").trim();
  const origin = (params.get("origin") || "").trim();
  const ship = (params.get("ship") || "").trim();
  const kg = (params.get("kg") || "").trim();

  if (qty && form.elements.quantity) form.elements.quantity.value = qty;
  if (origin && form.elements.origin) form.elements.origin.value = origin;
  if (ship && form.elements.shipping_method) form.elements.shipping_method.value = ship;

  if (params.get("from") === "list") {
    const items = getQuoteList();
    if (items.length && form.elements.request_details && !form.elements.request_details.value) {
      form.elements.request_details.value = items
        .map((item) => `${item.qty || 1}× ${item.name}`)
        .join("\n");
    }
  }

  if (kg && form.elements.request_details && !form.elements.request_details.value) {
    const method = ship || "sea or air";
    form.elements.request_details.value = `Please quote ${method} shipping to Ghana for about ${kg} kg.`;
  }

  if (!q) return;

  if (looksLikeUrl(q) && form.elements.reference_url && !form.elements.reference_url.value) {
    form.elements.reference_url.value = q.startsWith("http") ? q : `https://${q}`;
    if (form.elements.request_details && !form.elements.request_details.value) {
      form.elements.request_details.value = "Please quote this item from the link I pasted.";
    }
    return;
  }

  if (form.elements.request_details && !form.elements.request_details.value) {
    form.elements.request_details.value = q;
  }
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
    quantity: fields.quantity ? fields.quantity.value.trim() : "",
    origin: fields.origin ? fields.origin.value : "",
    shipping_method: fields.shipping_method ? fields.shipping_method.value : "",
    photo_url: "",
  };

  if (!data.name || !data.phone || !data.request_details) {
    showStatus(statusEl, "error", "Please fill in your name, phone number, and what you'd like imported.");
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = "SENDING...";

  const photoInput = form.querySelector("#photo");
  let photoFile = photoInput && photoInput.files && photoInput.files[0];
  if (!photoFile && sessionStorage.getItem("mwinbarka_search_photo")) {
    try {
      photoFile = await dataUrlToFile(sessionStorage.getItem("mwinbarka_search_photo"));
    } catch (err) {
      console.error("Could not read the search photo:", err);
    }
  }
  if (photoFile) {
    try {
      data.photo_url = await uploadRequestPhoto(photoFile);
      sessionStorage.removeItem("mwinbarka_search_photo");
    } catch (err) {
      console.error("Photo upload failed:", err);
      showStatus(statusEl, "error", "Couldn't upload the photo. You can still send the request — attach the picture on WhatsApp.");
    }
  }

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
    data.quantity ? `Quantity: ${data.quantity}` : null,
    data.origin ? `Source: ${data.origin}` : null,
    data.shipping_method ? `Shipping: ${data.shipping_method}` : null,
    `Details: ${data.request_details}`,
    data.budget_range ? `Budget: GH₵${data.budget_range}` : null,
    data.reference_url ? `Reference: ${data.reference_url}` : null,
    data.photo_url ? `Photo: ${data.photo_url}` : null,
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
  if (new URLSearchParams(window.location.search).get("from") === "list") saveQuoteList([]);
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

function mountAnnounceBar() {
  if (document.body && document.body.id === "admin-page") return;
  if (document.querySelector(".announce-bar")) return;
  const bar = document.createElement("div");
  bar.className = "announce-bar";
  bar.textContent = "Quotes in GH₵ · Typical WhatsApp reply within 24 hours · China & Turkey → Ghana";
  const header = document.querySelector(".site-header");
  if (header) header.insertBefore(bar, header.firstChild);
  else document.body.insertBefore(bar, document.body.firstChild);
}

function looksLikeUrl(value) {
  return /^(https?:\/\/|www\.)/i.test(String(value || "").trim());
}

function mountSiteSearch() {
  if (document.body && document.body.id === "admin-page") return;
  if (document.querySelector(".site-search")) return;
  const header = document.querySelector(".site-header");
  const nav = header && header.querySelector(".nav");
  const logo = header && header.querySelector(".nav-logo");
  if (!header || !nav || !logo) return;

  const main = document.createElement("div");
  main.className = "header-main container";

  const form = document.createElement("form");
  form.className = "site-search";
  form.action = "request.html";
  form.method = "get";
  form.setAttribute("role", "search");
  form.innerHTML = `
    <input type="search" name="q" placeholder="Describe an item or paste a 1688 / Alibaba link" aria-label="Search what to import">
    <button type="submit" class="btn btn-gold">Search</button>
  `;

  const cta = header.querySelector(".nav-cta");
  const toggle = header.querySelector(".nav-toggle");
  main.appendChild(logo);
  main.appendChild(form);
  if (cta) main.appendChild(cta);
  if (toggle) main.appendChild(toggle);
  header.insertBefore(main, nav);
}

const QUOTE_KEY = "mwinbarka_quote_list";

const POPULAR_SOURCING = [
  { id: "pop-fufu", name: "Fufu / cassava pounding machine", category: "Home & Kitchen", from: "450", itemNo: "MW-HK-01", material: "Stainless steel bowl, copper motor", origin: "China", notes: "Tell us capacity and 220V if it is for a chop bar." },
  { id: "pop-sneakers", name: "Men's sneakers (wholesale pairs)", category: "Shoes & Bags", from: "180", itemNo: "MW-SH-02", material: "PU / mesh (varies by style)", origin: "China", notes: "Send a photo or 1688 link for the exact model and sizes." },
  { id: "pop-phones", name: "Phone accessories carton", category: "Electronics", from: "120", itemNo: "MW-EL-03", material: "Mixed — cables, cases, earbuds", origin: "China", notes: "Good for market stall restock. Say how many pieces." },
  { id: "pop-dryer", name: "Salon hair dryer", category: "Beauty & Cosmetics", from: "260", itemNo: "MW-BE-04", material: "ABS housing, AC motor", origin: "China", notes: "Professional salon dryers. Confirm plug type for Ghana." },
  { id: "pop-fashion", name: "Women's fashion lot (mixed styles)", category: "Clothing & Fashion", from: "150", itemNo: "MW-CL-05", material: "Varies by lot", origin: "China or Turkey", notes: "Share sizes, colours, and whether you want Turkey or China." },
  { id: "pop-blender", name: "Heavy-duty kitchen mill / blender", category: "Home & Kitchen", from: "320", itemNo: "MW-HK-06", material: "Stainless mill, copper motor", origin: "China", notes: "Popular for pepper, tom brown, and fufu shops." },
  { id: "pop-solar", name: "Solar street / compound lights", category: "Electronics", from: "200", itemNo: "MW-EL-07", material: "ABS + polycrystalline panel", origin: "China", notes: "Tell us wattage and whether you need a pole." },
  { id: "pop-kids", name: "Kids toys mixed carton", category: "Other", from: "90", itemNo: "MW-OT-08", material: "Plastic / mixed", origin: "China", notes: "Wholesale mixed carton. Age range helps us pick safer lots." },
];

function getQuoteList() {
  try {
    const parsed = JSON.parse(localStorage.getItem(QUOTE_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveQuoteList(items) {
  localStorage.setItem(QUOTE_KEY, JSON.stringify(items));
  updateQuoteBadge();
}

function addToQuoteList(item) {
  const items = getQuoteList();
  const existing = items.find((row) => row.id === item.id);
  if (existing) existing.qty = (Number(existing.qty) || 1) + (Number(item.qty) || 1);
  else items.push({ id: item.id, name: item.name, category: item.category || "", from: item.from || "", qty: Number(item.qty) || 1 });
  saveQuoteList(items);
  showToast("Added to your quote list");
}

function updateQuoteBadge() {
  const count = getQuoteList().reduce((sum, item) => sum + (Number(item.qty) || 1), 0);
  document.querySelectorAll("[data-quote-count]").forEach((el) => {
    el.textContent = String(count);
  });
}

function showToast(msg) {
  let el = document.getElementById("mw-toast");
  if (!el) {
    el = document.createElement("div");
    el.id = "mw-toast";
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => el.classList.remove("show"), 2200);
}

function mountFeatureNav() {
  if (document.body && document.body.id === "admin-page") return;

  const links = document.querySelector(".nav-links");
  if (links && !links.querySelector('a[href="shipping.html"]')) {
    const li = document.createElement("li");
    const here = (location.pathname.split("/").pop() || "") === "shipping.html";
    li.innerHTML = `<a href="shipping.html"${here ? ' class="active"' : ""}>Shipping Rates</a>`;
    const cats = [...links.querySelectorAll("a")].find((a) => a.getAttribute("href") === "categories.html");
    if (cats && cats.parentElement) cats.parentElement.after(li);
    else links.appendChild(li);
  }

  if (!document.querySelector(".quote-link")) {
    const cta = document.querySelector(".header-main .nav-cta") || document.querySelector(".nav-cta");
    const link = document.createElement("a");
    link.href = "quote-list.html";
    link.className = "quote-link";
    link.innerHTML = `Quote list <span class="quote-count" data-quote-count>0</span>`;
    if (cta && cta.parentNode) cta.parentNode.insertBefore(link, cta);
    else if (document.querySelector(".header-main")) document.querySelector(".header-main").appendChild(link);
  }

  document.querySelectorAll(".footer-grid ul").forEach((ul) => {
    const hasHow = [...ul.querySelectorAll("a")].some((a) => a.getAttribute("href") === "how-it-works.html");
    if (hasHow && !ul.querySelector('a[href="shipping.html"]')) {
      const li = document.createElement("li");
      li.innerHTML = `<a href="shipping.html">Shipping Rates</a>`;
      ul.appendChild(li);
    }
  });

  updateQuoteBadge();
}

function tileDataUri(label) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400">
    <rect width="400" height="400" fill="#0A1F44"/>
    <circle cx="200" cy="155" r="54" fill="none" stroke="#C9A227" stroke-width="5"/>
    <path d="M160 155 L200 115 L240 155" fill="none" stroke="#C9A227" stroke-width="5"/>
    <text x="200" y="300" text-anchor="middle" fill="#E8C766" font-family="Arial, sans-serif" font-size="20">${escapeHtml(label)}</text>
  </svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function productCardHtml(p, opts = {}) {
  const id = p.id || p.name;
  const priceRaw = p.price || "";
  const price = priceRaw
    ? (String(priceRaw).includes("GH") ? priceRaw : `GH₵${priceRaw}`)
    : (p.from ? `from GH₵${p.from}` : "");
  const img = p.image_url
    ? `<img src="${escapeAttr(p.image_url)}" alt="${escapeAttr(p.name)}">`
    : `<img src="${tileDataUri((p.category || "MW").split(" ")[0])}" alt="">`;
  const href = `item.html?id=${encodeURIComponent(id)}`;
  return `
    <a class="product-card" href="${href}">
      ${img}
      <div class="product-body">
        <span class="code">${escapeHtml(p.category || "Product")}</span>
        <h3>${escapeHtml(p.name)}</h3>
        ${price ? `<div class="product-price">${escapeHtml(price)}${opts.indicative ? " <small>indicative</small>" : ""}</div>` : ""}
      </div>
    </a>
  `;
}

function renderPopularSourcing() {
  const grid = document.getElementById("popular-grid");
  if (!grid) return;
  grid.innerHTML = POPULAR_SOURCING.map((p) => productCardHtml(p, { indicative: true })).join("");
}

function bindQuoteButtons() {
  document.addEventListener("click", (e) => {
    const btn = e.target.closest(".add-quote");
    if (!btn) return;
    const card = btn.closest("[data-quote-item]");
    if (!card) return;
    addToQuoteList({
      id: card.dataset.id,
      name: card.dataset.name,
      category: card.dataset.category,
      from: card.dataset.from,
      qty: 1,
    });
  });
}

function renderQuoteListPage() {
  const wrap = document.getElementById("quote-list-body");
  if (!wrap) return;
  const items = getQuoteList();
  if (!items.length) {
    wrap.innerHTML = `<p class="empty-note">Your quote list is empty. Add items from Home, then send them all in one WhatsApp request.</p>
      <a class="btn btn-gold" href="index.html">Browse popular sourcing</a>`;
    return;
  }

  wrap.innerHTML = `
    <ul class="quote-rows">
      ${items.map((item, i) => `
        <li data-id="${escapeAttr(item.id)}">
          <div>
            <strong>${escapeHtml(item.name)}</strong>
            <span>${escapeHtml(item.category || "")}</span>
          </div>
          <div class="qty-controls">
            <button type="button" data-qty="${i}" data-dir="-1">−</button>
            <span>${escapeHtml(item.qty || 1)}</span>
            <button type="button" data-qty="${i}" data-dir="1">+</button>
            <button type="button" class="linkish" data-remove="${i}">Remove</button>
          </div>
        </li>
      `).join("")}
    </ul>
    <div class="hero-actions" style="margin-top: 1.5rem;">
      <a class="btn btn-gold" href="request.html?from=list">Send all on WhatsApp</a>
      <button type="button" class="btn btn-outline-dark" id="clear-quote-list">Clear list</button>
    </div>
  `;

  wrap.querySelectorAll("[data-qty]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const list = getQuoteList();
      const idx = Number(btn.dataset.qty);
      const dir = Number(btn.dataset.dir);
      if (!list[idx]) return;
      list[idx].qty = Math.max(1, (Number(list[idx].qty) || 1) + dir);
      saveQuoteList(list);
      renderQuoteListPage();
    });
  });
  wrap.querySelectorAll("[data-remove]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const list = getQuoteList();
      list.splice(Number(btn.dataset.remove), 1);
      saveQuoteList(list);
      renderQuoteListPage();
    });
  });
  const clearBtn = document.getElementById("clear-quote-list");
  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      saveQuoteList([]);
      renderQuoteListPage();
    });
  }
}

function setupShippingAdvisor() {
  const form = document.getElementById("shipping-advisor");
  if (!form) return;
  const out = document.getElementById("shipping-advice");
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const kg = Number(form.elements.kg.value);
    const speed = form.elements.speed.value;
    const city = (form.elements.city.value || "Ghana").trim();
    if (!kg || kg <= 0) {
      out.hidden = false;
      out.textContent = "Enter an estimated weight so we can recommend sea or air.";
      return;
    }
    const method = speed === "urgent" || kg <= 8 ? "air" : "sea";
    const wait = method === "air" ? "about 5–12 days after the supplier ships" : "about 4–8 weeks after the supplier ships";
    out.hidden = false;
    out.innerHTML = `<p>For <strong>${kg} kg</strong> to <strong>${escapeHtml(city)}</strong>, <strong>${method} freight</strong> is usually the better fit (${wait}).</p>
      <p>We don't publish a live GH₵/kg table because fuel and season change the number. Send this through and we'll quote today's landed cost on WhatsApp.</p>
      <a class="btn btn-gold" href="request.html?ship=${encodeURIComponent(method)}&kg=${encodeURIComponent(String(kg))}&q=${encodeURIComponent(kg + " kg " + method + " freight to " + city)}">Get a GH₵ shipping quote</a>`;
  });
}

function setupPhotoPreview(form) {
  const input = form.querySelector("#photo");
  const preview = form.querySelector("#photo-preview");
  if (!input || !preview) return;
  input.addEventListener("change", () => {
    preview.innerHTML = "";
    const file = input.files && input.files[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      showToast("Please choose a photo under 5 MB");
      input.value = "";
      return;
    }
    const img = document.createElement("img");
    img.src = URL.createObjectURL(file);
    img.alt = "Photo preview";
    preview.appendChild(img);
  });
}

async function uploadRequestPhoto(file) {
  const client = window.getSupabaseClient && window.getSupabaseClient();
  if (!client) return "";
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  const path = `requests/${(crypto.randomUUID && crypto.randomUUID()) || Date.now()}.${ext}`;
  const { error } = await client.storage.from("media").upload(path, file, {
    contentType: file.type || "image/jpeg",
    upsert: false,
  });
  if (error) throw error;
  const { data } = client.storage.from("media").getPublicUrl(path);
  return data.publicUrl || "";
}

function pageFile() {
  return (location.pathname.split("/").pop() || "index.html") || "index.html";
}

function enhanceSearch() {
  if (document.body && document.body.id === "admin-page") return;
  document.querySelectorAll(".site-search").forEach((form) => {
    if (form.querySelector(".search-cam")) return;
    const label = document.createElement("label");
    label.className = "search-cam";
    label.title = "Search by photo";
    label.innerHTML = `<input type="file" accept="image/*" capture="environment" aria-label="Search by photo"><span aria-hidden="true">📷</span>`;
    form.insertBefore(label, form.firstElementChild);
    const input = label.querySelector("input");
    input.addEventListener("change", async () => {
      const file = input.files && input.files[0];
      if (!file) return;
      try {
        const dataUrl = await compressToDataUrl(file);
        sessionStorage.setItem("mwinbarka_search_photo", dataUrl);
        window.location.href = "request.html?from=photo";
      } catch (err) {
        console.error(err);
        showToast("Couldn't read that photo. Try a smaller image.");
      }
    });
  });
}

function mountMobileChrome() {
  if (document.body && document.body.id === "admin-page") return;
  document.body.classList.add("has-tabbar");

  if (!document.querySelector(".header-phone")) {
    const main = document.querySelector(".header-main");
    const phone = document.createElement("a");
    phone.className = "header-phone";
    phone.href = `https://wa.me/${WA_NUMBER}`;
    phone.target = "_blank";
    phone.rel = "noopener";
    phone.setAttribute("aria-label", "Call or chat on WhatsApp");
    phone.textContent = "☎";
    const toggle = main && main.querySelector(".nav-toggle");
    if (toggle) main.insertBefore(phone, toggle);
    else if (main) main.appendChild(phone);
  }

  if (document.querySelector(".tabbar")) return;
  const here = pageFile();
  const tab = (href, label, extra) => {
    const file = href.split("/").pop();
    const on = here === file || (file === "index.html" && (here === "" || here === "/"));
    return `<a href="${href}" class="${on ? "active" : ""}">${label}${extra || ""}</a>`;
  };
  const nav = document.createElement("nav");
  nav.className = "tabbar";
  nav.setAttribute("aria-label", "Primary");
  nav.innerHTML = `
    ${tab("index.html", "Home")}
    ${tab("categories.html", "Categories")}
    ${tab("quote-list.html", "Quote", ` <span data-quote-count>0</span>`)}
    ${tab("request.html", "Request")}
  `;
  document.body.appendChild(nav);
  updateQuoteBadge();
}

async function compressToDataUrl(file) {
  const blobUrl = URL.createObjectURL(file);
  const img = await new Promise((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = reject;
    el.src = blobUrl;
  });
  const max = 1280;
  let w = img.width;
  let h = img.height;
  if (w > max) {
    h = Math.round((h * max) / w);
    w = max;
  }
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  canvas.getContext("2d").drawImage(img, 0, 0, w, h);
  URL.revokeObjectURL(blobUrl);
  return canvas.toDataURL("image/jpeg", 0.72);
}

async function dataUrlToFile(dataUrl) {
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  return new File([blob], "search.jpg", { type: blob.type || "image/jpeg" });
}

function restoreSearchPhoto() {
  const preview = document.getElementById("photo-preview");
  const stored = sessionStorage.getItem("mwinbarka_search_photo");
  if (!preview || !stored) return;
  preview.innerHTML = "";
  const img = document.createElement("img");
  img.src = stored;
  img.alt = "Photo from search";
  preview.appendChild(img);
  const details = document.getElementById("request_details");
  if (details && !details.value) details.value = "Please quote this item from the photo I uploaded.";
}

async function renderItemPage(client) {
  const root = document.getElementById("item-root");
  if (!root) return;
  const id = new URLSearchParams(location.search).get("id");
  if (!id) {
    root.innerHTML = `<p class="empty-note">No item selected.</p><a class="btn btn-gold" href="index.html">Back to home</a>`;
    return;
  }

  let item = POPULAR_SOURCING.find((row) => row.id === id);
  const db = client || (window.getSupabaseClient && window.getSupabaseClient());
  if (!item && db) {
    const { data } = await db.from("products").select("*").eq("id", id).maybeSingle();
    if (data) {
      item = {
        id: data.id,
        name: data.name,
        category: data.category,
        from: data.price,
        price: data.price,
        image_url: data.image_url,
        notes: data.description,
        origin: "China or Turkey",
        itemNo: String(data.id).slice(0, 8),
        material: "See description",
      };
    }
  }
  if (!item) {
    root.innerHTML = `<p class="empty-note">We couldn't find that item. Describe it on the request form instead.</p>
      <a class="btn btn-gold" href="request.html">Request an Import</a>`;
    return;
  }

  const price = item.price
    ? (String(item.price).includes("GH") ? item.price : `GH₵${item.price}`)
    : (item.from ? `from GH₵${item.from}` : "");
  const img = item.image_url
    ? `<img src="${escapeAttr(item.image_url)}" alt="${escapeAttr(item.name)}">`
    : `<img src="${tileDataUri((item.category || "MW").split(" ")[0])}" alt="">`;
  const requestHref = `request.html?q=${encodeURIComponent(item.name)}${item.category ? `&category=${encodeURIComponent(item.category)}` : ""}`;
  const wa = `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent("Hi Mwinbarka Imports, I'd like a GH₵ quote for: " + item.name)}`;

  document.title = `${item.name} — Mwinbarka Imports`;
  const titleEl = document.getElementById("item-header-title");
  if (titleEl) titleEl.textContent = item.name;

  root.innerHTML = `
    <div class="item-hero">${img}</div>
    <div class="item-info">
      <h1>${escapeHtml(item.name)}</h1>
      ${price ? `<div class="product-price">${escapeHtml(price)} <small>indicative landed start — WhatsApp quote is final</small></div>` : ""}
    </div>
    <section class="item-block">
      <h2>How to request this</h2>
      <ol class="process-list">
        <li>Send a request — or add it to your quote list.</li>
        <li>We quote the goods in GH₵ (supplier price + China pickup).</li>
        <li>You choose sea or air. See the <a href="shipping.html">freight estimate</a>, then we ship to Ghana.</li>
      </ol>
      <p class="muted">Packages can be consolidated. Chat on WhatsApp if you already have other items waiting.</p>
    </section>
    <section class="item-block">
      <h2>Sourcing agent</h2>
      <p><strong>Mwinbarka Imports</strong> — Accra, Ghana</p>
      <p class="muted">Direct source from China and Turkey. Quotes and payment terms stay on WhatsApp.</p>
      <a class="btn btn-outline-dark" href="https://wa.me/${WA_NUMBER}" target="_blank" rel="noopener">Chat on WhatsApp</a>
    </section>
    <section class="item-block">
      <h2>Product attributes</h2>
      <dl class="attr-list">
        <div><dt>Item no.</dt><dd>${escapeHtml(item.itemNo || "—")}</dd></div>
        <div><dt>Category</dt><dd>${escapeHtml(item.category || "—")}</dd></div>
        <div><dt>Material</dt><dd>${escapeHtml(item.material || "—")}</dd></div>
        <div><dt>Origin</dt><dd>${escapeHtml(item.origin || "China or Turkey")}</dd></div>
      </dl>
      ${item.notes ? `<p class="muted">${escapeHtml(item.notes)}</p>` : ""}
    </section>
  `;

  const bar = document.getElementById("item-sticky");
  if (bar) {
    bar.hidden = false;
    bar.dataset.id = item.id;
    bar.dataset.name = item.name;
    bar.dataset.category = item.category || "";
    bar.dataset.from = item.from || item.price || "";
    const chat = bar.querySelector("[data-chat]");
    const request = bar.querySelector("[data-request]");
    if (chat) chat.href = wa;
    if (request) request.href = requestHref;
  }
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

async function applyPublicSite() {
  const client = window.getSupabaseClient && window.getSupabaseClient();
  if (!client) return;

  const { data } = await client
    .from("site_settings")
    .select("*")
    .eq("id", 1)
    .maybeSingle();

  if (data) {
    applyChannelButton(data);
    applySocialLinks(data);
    showAdvertGate(data);
  }

  await renderPublicProducts(client);
  await renderItemPage(client);
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

  const html = data.map((p) => productCardHtml(p)).join("");

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
