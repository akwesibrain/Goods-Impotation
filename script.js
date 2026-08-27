// ============================================================
// MWINBARKA IMPORTS — shared site behavior
// ============================================================

// WhatsApp business number in international format (no + or spaces)
const WA_NUMBER = "233540309637";

const PRODUCT_CATEGORIES = [
  "Kitchen & Home",
  "Clothing & Fashion",
  "Electronics",
  "Shoes & Bags",
  "Beauty & Cosmetics",
  "Auto Parts",
  "Baby & Kids",
  "Other",
];
window.PRODUCT_CATEGORIES = PRODUCT_CATEGORIES;

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
    fillCategorySelects();
    prefillCategoryFromQuery(form);
    setupPhotoPreview(form);
  } else {
    fillCategorySelects();
  }

  applyPublicSite();
  mountAnnounceBar();
  mountSiteSearch();
  mountFeatureNav();
  enhanceSearch();
  mountMobileChrome();
  mountAccountChrome();
  mountReviewsLinks();
  renderPopularSourcing();
  renderQuoteListPage();
  setupShippingAdvisor();
  bindQuoteButtons();
  renderItemPage();
  restoreSearchPhoto();
  prefillRequestFromAccount();
  mountAccountPage();
  guardAdvertClicks();
});

function fillCategorySelects() {
  document.querySelectorAll("select[name='category'], #category, #product-category").forEach((select) => {
    if (!select || select.dataset.filled === "1") return;
    const current = select.value;
    const keepFirst = select.querySelector("option[value='']");
    const placeholder = keepFirst ? keepFirst.outerHTML : '<option value="">Select a category</option>';
    select.innerHTML = placeholder + PRODUCT_CATEGORIES
      .map((name) => `<option value="${escapeAttr(name)}">${escapeHtml(name)}</option>`)
      .join("");
    if (current) select.value = current;
    select.dataset.filled = "1";
  });
}

/**
 * Category tiles on /categories link here with ?category=..., so the
 * matching option is already selected when someone arrives from the gallery.
 */
function prefillCategoryFromQuery(form) {
  const params = new URLSearchParams(window.location.search);
  const category = params.get("category");
  if (category) {
    const select = form.elements.category;
    const resolved = resolveCategory(category);
    if (select && resolved) select.value = resolved;
  }
  const q = (params.get("q") || "").trim();
  const qty = (params.get("qty") || "").trim();
  const kg = (params.get("kg") || "").trim();

  if (qty && form.elements.quantity) form.elements.quantity.value = qty;

  const productField = form.elements.product || form.elements.request_details;

  if (params.get("from") === "list") {
    const items = getQuoteList();
    if (items.length && productField && !productField.value) {
      productField.value = items
        .map((item) => `${item.qty || 1}× ${item.name}`)
        .join("\n");
    }
  }

  if (kg && productField && !productField.value) {
    productField.value = `Please quote sea freight to Ghana for about ${kg} kg.`;
  }

  if (!q) return;

  if (productField && !productField.value) {
    productField.value = looksLikeUrl(q) && !q.startsWith("http") ? `https://${q}` : q;
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

  const product = (fields.product || fields.request_details).value.trim();
  const data = {
    name: fields.name.value.trim(),
    phone: fields.phone.value.trim(),
    email: fields.email ? fields.email.value.trim() : "",
    location: fields.location.value.trim(),
    category: fields.category.value,
    request_details: product,
    quantity: fields.quantity ? fields.quantity.value.trim() : "",
    photo_url: "",
  };

  if (!data.name || !data.phone || !data.email || !data.request_details || !data.location || !data.quantity || !data.category) {
    showStatus(statusEl, "error", "Please fill in name, phone number, email, product, category, location, and quantity.");
    return;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
    showStatus(statusEl, "error", "Please enter a valid email address.");
    return;
  }

  if (cachedAdvertUrl && !hasWatchedAdvert()) {
    showStatus(statusEl, "error", "Watch the full advert first — then place your order.");
    showAdvertGate({ advert_video_url: cachedAdvertUrl });
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
      showStatus(statusEl, "error", "Couldn't upload the photo. You can still order — attach the picture when we reply.");
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
    `Hi Mwinbarka Imports, I'd like to place an order:`,
    `Name: ${data.name}`,
    `Phone: ${data.phone}`,
    data.email ? `Email: ${data.email}` : null,
    `Product: ${data.request_details}`,
    data.category ? `Category: ${data.category}` : null,
    data.location ? `Location: ${data.location}` : null,
    data.quantity ? `Quantity: ${data.quantity}` : null,
    data.photo_url ? `Photo: ${data.photo_url}` : null,
  ].filter(Boolean);

  const message = encodeURIComponent(lines.join("\n"));
  const waUrl = `https://wa.me/${WA_NUMBER}?text=${message}`;

  form.reset();
  const preview = form.querySelector("#photo-preview");
  if (preview) preview.innerHTML = "";
  if (new URLSearchParams(window.location.search).get("from") === "list") saveQuoteList([]);
  submitBtn.disabled = false;
  submitBtn.textContent = "ORDER NOW";

  showOrderReceived(waUrl);
}

function showOrderReceived(waUrl) {
  const modal = document.getElementById("order-received");
  const go = document.getElementById("order-received-continue");
  if (!modal || !go) {
    window.location.href = waUrl;
    return;
  }
  modal.hidden = false;
  document.body.classList.add("order-modal-open");
  const openWhatsApp = () => {
    modal.hidden = true;
    document.body.classList.remove("order-modal-open");
    const opened = window.open(waUrl, "_blank");
    if (!opened) window.location.href = waUrl;
  };
  go.onclick = openWhatsApp;
  go.focus();
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
    link.textContent = "Didn't open? Tap here to send the message.";
    el.appendChild(document.createElement("br"));
    el.appendChild(link);
  }
}

function mountAnnounceBar() {
  if (document.body && document.body.id === "admin-page") return;
  if (document.querySelector(".announce-bar")) return;
  const bar = document.createElement("div");
  bar.className = "announce-bar";
  bar.textContent = "Quotes in GH₵ · Typical reply within 24 hours · China & Turkey → Ghana";
  const header = document.querySelector(".site-header");
  if (header) header.insertBefore(bar, header.firstChild);
  else document.body.insertBefore(bar, document.body.firstChild);
}

function looksLikeUrl(value) {
  return /^(https?:\/\/|www\.)/i.test(String(value || "").trim());
}

function mountSiteSearch() {
  if (document.body && document.body.id === "admin-page") return;
  if (document.querySelector(".site-search") || document.querySelector(".tf-head")) return;
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
    <input type="search" name="q" placeholder="What do you want imported?" aria-label="Search what to import">
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
  { id: "pop-fufu", name: "Fufu / cassava pounding machine", category: "Kitchen & Home", from: "450", itemNo: "MW-HK-01", material: "Stainless steel bowl, copper motor", origin: "China", notes: "Tell us capacity and 220V if it is for a chop bar." },
  { id: "pop-sneakers", name: "Men's sneakers (wholesale pairs)", category: "Shoes & Bags", from: "180", itemNo: "MW-SH-02", material: "PU / mesh (varies by style)", origin: "China", notes: "Send a photo or wholesale link for the exact model and sizes." },
  { id: "pop-phones", name: "Phone accessories carton", category: "Electronics", from: "120", itemNo: "MW-EL-03", material: "Mixed — cables, cases, earbuds", origin: "China", notes: "Good for market stall restock. Say how many pieces." },
  { id: "pop-dryer", name: "Salon hair dryer", category: "Beauty & Cosmetics", from: "260", itemNo: "MW-BE-04", material: "ABS housing, AC motor", origin: "China", notes: "Professional salon dryers. Confirm plug type for Ghana." },
  { id: "pop-fashion", name: "Women's fashion lot (mixed styles)", category: "Clothing & Fashion", from: "150", itemNo: "MW-CL-05", material: "Varies by lot", origin: "China or Turkey", notes: "Share sizes, colours, and whether you want Turkey or China." },
  { id: "pop-blender", name: "Heavy-duty kitchen mill / blender", category: "Kitchen & Home", from: "320", itemNo: "MW-HK-06", material: "Stainless mill, copper motor", origin: "China", notes: "Popular for pepper, tom brown, and fufu shops." },
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
        <span class="product-order">Order Now</span>
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
    wrap.innerHTML = `<p class="empty-note">Your quote list is empty. Add items from Home, then send them all in one request.</p>
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
      <a class="btn btn-gold" href="request.html?from=list">Send all as one order</a>
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
    const city = (form.elements.city.value || "Ghana").trim();
    if (!kg || kg <= 0) {
      out.hidden = false;
      out.textContent = "Enter an estimated weight so we can quote sea freight.";
      return;
    }
    out.hidden = false;
    out.innerHTML = `<p>For <strong>${kg} kg</strong> to <strong>${escapeHtml(city)}</strong>, we ship by <strong>sea freight</strong> (typically 4–8 weeks after the supplier ships).</p>
      <p>We don't publish a live GH₵/kg table because fuel and season change the number. Order now and we'll quote today's landed cost on the official line.</p>
      <a class="btn btn-gold" href="request.html?kg=${encodeURIComponent(String(kg))}&q=${encodeURIComponent(kg + " kg sea freight to " + city)}">Order Now</a>`;
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
  if (document.body && document.body.classList.contains("account-page")) return;
  document.body.classList.add("has-tabbar");

  if (!document.querySelector(".header-phone")) {
    const main = document.querySelector(".header-main");
    const phone = document.createElement("a");
    phone.className = "header-phone";
    phone.href = `https://wa.me/${WA_NUMBER}`;
    phone.target = "_blank";
    phone.rel = "noopener";
    phone.setAttribute("aria-label", "Call or chat with the desk");
    phone.textContent = "☎";
    const toggle = main && main.querySelector(".nav-toggle");
    if (toggle) main.insertBefore(phone, toggle);
    else if (main) main.appendChild(phone);
  }

  if (document.querySelector(".tabbar")) return;
  const here = pageFile();
  const tab = (href, label, extra) => {
    const file = href.split("/").pop();
    const on = here === file || (file === "index.html" && (!here || here === "index.html" || here === "item.html"));
    return `<a href="${href}" class="${on ? "active" : ""}">${label}${extra || ""}</a>`;
  };
  const nav = document.createElement("nav");
  nav.className = "tabbar";
  nav.setAttribute("aria-label", "Primary");
  nav.innerHTML = `
    ${tab("index.html", "Home")}
    ${tab("categories.html", "Categories")}
    ${tab("quote-list.html", "Quote", ` <span data-quote-count>0</span>`)}
    ${tab("request.html", "Order")}
    <button type="button" class="tab-account${here === "account.html" ? " active" : ""}" data-open-account>Account</button>
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
      <a class="btn btn-gold" href="request.html">Order Now</a>`;
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
      ${price ? `<div class="product-price">${escapeHtml(price)} <small>indicative landed start — official quote is final</small></div>` : ""}
    </div>
    <section class="item-block">
      <h2>How to request this</h2>
      <ol class="process-list">
        <li>Order now — or add it to your quote list.</li>
        <li>We quote the goods in GH₵ (supplier price + China pickup).</li>
        <li>We ship by sea to Ghana. See the <a href="shipping.html">freight estimate</a> if you want a weight quote first.</li>
      </ol>
      <p class="muted">Packages can be consolidated. Write the desk if you already have other items waiting.</p>
    </section>
    <section class="item-block">
      <h2>Sourcing agent</h2>
      <p><strong>Mwinbarka Imports</strong> — Accra, Ghana</p>
      <p class="muted">Direct source from China and Turkey. Quotes and payment terms stay on the official line.</p>
      <a class="btn btn-outline-dark" href="https://wa.me/${WA_NUMBER}" target="_blank" rel="noopener">Open official chat</a>
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
  btn.setAttribute("aria-label", "Join our channel");
  btn.title = "Join our channel";
}

function applySocialLinks(settings) {
  const items = [
    ["Facebook", settings.facebook_url],
    ["Instagram", settings.instagram_url],
    ["Chat", settings.whatsapp_url || settings.whatsapp_channel_url],
    ["TikTok", settings.tiktok_url],
  ].filter(([, url]) => url && String(url).trim());

  if (!items.length) return;

  document.querySelectorAll(".tf-socials").forEach((box) => {
    box.innerHTML = items
      .map(([label, url]) => `<a href="${escapeAttr(url)}" target="_blank" rel="noopener">${escapeHtml(label)}</a>`)
      .join("");
  });

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

let cachedAdvertUrl = "";

// GitHack / GitHub raw cannot serve this MP4 (403 or octet-stream).
// Always play from public HTTPS hosts that return video/mp4.
const HOSTED_ADVERT_MP4 =
  "https://kajtwabmwbncfgvehqmm.supabase.co/storage/v1/object/public/media/adverts/advert.mp4?v=phone1";
const FALLBACK_ADVERT_MP4 =
  "https://cdn.jsdelivr.net/gh/akwesibrain/Goods-Impotation@cursor/mwinbarka-imports-site-5d47/assets/advert.mp4";
const ADVERT_SESSION_KEY = "mwinbarka_advert_session_v3";
const ADVERT_ACCOUNT_KEY = "mwinbarka_advert_account_v1";

let pendingAdvertHref = "";

function markAdvertSkippedForAccount() {
  try { localStorage.setItem(ADVERT_ACCOUNT_KEY, "1"); } catch (e) { /* private mode */ }
  try { sessionStorage.setItem(ADVERT_SESSION_KEY, "1"); } catch (e) { /* private mode */ }
  const stale = document.getElementById("advert-gate");
  if (stale) {
    stale.remove();
    document.body.classList.remove("advert-locked");
  }
}

function shouldSkipAdvertForAccount() {
  try {
    if (localStorage.getItem(ADVERT_ACCOUNT_KEY) === "1") return true;
  } catch (e) { /* private mode */ }
  return false;
}

function hasWatchedAdvert() {
  if (shouldSkipAdvertForAccount()) return true;
  try {
    return sessionStorage.getItem(ADVERT_SESSION_KEY) === "1";
  } catch (e) {
    return false;
  }
}

function markAdvertWatched() {
  try { sessionStorage.setItem(ADVERT_SESSION_KEY, "1"); } catch (e) { /* private mode */ }
}

window.markAdvertSkippedForAccount = markAdvertSkippedForAccount;

function youtubeIdFromUrl(url) {
  try {
    const u = new URL(url);
    if (u.hostname.includes("youtu.be")) return u.pathname.replace(/^\//, "").split("/")[0] || null;
    if (u.searchParams.get("v")) return u.searchParams.get("v");
    const parts = u.pathname.split("/").filter(Boolean);
    const idx = parts.findIndex((p) => p === "embed" || p === "shorts");
    if (idx >= 0 && parts[idx + 1]) return parts[idx + 1];
  } catch {
    return null;
  }
  return null;
}

function tiktokIdFromUrl(url) {
  const text = String(url || "");
  const match = text.match(/\/(?:video|photo|v)\/(\d{10,})/) || text.match(/\/player\/v1\/(\d{10,})/) || text.match(/data-video-id="(\d{10,})"/);
  return match ? match[1] : null;
}

async function resolveTikTokId(url) {
  const direct = tiktokIdFromUrl(url);
  if (direct) return direct;
  if (!/tiktok\.com/i.test(url)) return null;
  try {
    const res = await fetch("https://www.tiktok.com/oembed?url=" + encodeURIComponent(url));
    if (!res.ok) return null;
    const json = await res.json();
    return tiktokIdFromUrl(json.html) || tiktokIdFromUrl(json.cite) || null;
  } catch {
    return null;
  }
}

function isDirectVideoUrl(url) {
  return /\.(mp4|webm|ogg|mov|m4v)(\?|$)/i.test(url) || /\/storage\/v1\/object\/public\//i.test(url);
}

function isPlayableHostedUrl(url) {
  return (
    /^https?:\/\//i.test(url) &&
    isDirectVideoUrl(url) &&
    !/raw\.githack|githubusercontent\.com/i.test(url)
  );
}

function advertCandidates(remote) {
  const urls = [];
  const value = String(remote || "").trim();
  if (isPlayableHostedUrl(value)) urls.push(value);
  urls.push(HOSTED_ADVERT_MP4, FALLBACK_ADVERT_MP4);
  return [...new Set(urls)];
}

function advertPlayerHtml(kind, src) {
  if (kind === "file") {
    return `
      <video id="advert-video" playsinline webkit-playsinline preload="auto" controls controlslist="nodownload noplaybackrate noremoteplayback" disablepictureinpicture>
        <source type="video/mp4">
      </video>
      <button type="button" class="advert-play" id="advert-play" aria-label="Play advert">▶</button>
      <button type="button" class="advert-unmute" id="advert-unmute" hidden>Unmute</button>
    `;
  }
  if (kind === "youtube") {
    return `<div id="advert-yt"></div>`;
  }
  return `<iframe id="advert-tiktok" title="Mwinbarka Imports advert" allow="autoplay; fullscreen; encrypted-media" allowfullscreen src="${escapeAttr(src)}"></iframe>`;
}

function removeAdvertGate() {
  const stale = document.getElementById("advert-gate");
  if (stale) stale.remove();
  document.body.classList.remove("advert-locked");
}

function followPendingAdvertLink() {
  const href = pendingAdvertHref;
  pendingAdvertHref = "";
  if (href && href !== location.href) window.location.href = href;
}

async function showAdvertGate(settings) {
  if (document.body && document.body.id === "admin-page") return;
  const remote = ((settings && settings.advert_video_url) || "").trim();
  const sources = advertCandidates(remote);
  const videoUrl = sources[0];
  cachedAdvertUrl = videoUrl;

  const user = window.getSessionUser ? await window.getSessionUser() : null;
  if (user) {
    markAdvertSkippedForAccount();
    return;
  }
  if (hasWatchedAdvert()) {
    removeAdvertGate();
    followPendingAdvertLink();
    return;
  }

  let overlay = document.getElementById("advert-gate");
  if (overlay && overlay.dataset.mounted === "1") return;

  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "advert-gate";
    overlay.innerHTML = `
    <div class="advert-stage">
      <div class="advert-player" id="advert-player"></div>
      <div class="advert-hud">
        <div class="advert-progress" id="advert-progress">Tap Play to watch the advert.</div>
        <button type="button" class="btn btn-gold" id="advert-continue" disabled>Watch the full video to continue</button>
      </div>
    </div>
  `;
    document.body.appendChild(overlay);
  }
  overlay.dataset.mounted = "1";
  document.body.classList.add("advert-locked");

  const playerBox = overlay.querySelector("#advert-player");
  const continueBtn = overlay.querySelector("#advert-continue");
  const progressEl = overlay.querySelector("#advert-progress");
  let unlocked = false;
  let maxSeen = 0;

  const unlock = () => {
    if (unlocked) return;
    unlocked = true;
    markAdvertWatched();
    if (continueBtn) {
      continueBtn.disabled = false;
      continueBtn.textContent = "Continue";
    }
    if (progressEl) progressEl.textContent = "Advert complete.";
  };

  const updateProgress = (current, duration) => {
    if (!duration || duration <= 0) return;
    if (current > maxSeen) maxSeen = current;
    const pct = Math.min(100, Math.floor((maxSeen / duration) * 100));
    progressEl.textContent = `Keep watching… ${pct}%`;
    if (maxSeen / duration >= 0.92) unlock();
  };

  if (continueBtn) {
    continueBtn.addEventListener("click", () => {
      if (!unlocked) return;
      removeAdvertGate();
      followPendingAdvertLink();
    });
  }

  playerBox.innerHTML = advertPlayerHtml("file");
  const video = overlay.querySelector("video");
  mountFileAdvert(video, sources, unlock, updateProgress, progressEl);
}

function addPlayOverlay(box, onPlay) {
  let btn = box.querySelector("#advert-play") || box.querySelector(".advert-play");
  if (!btn) {
    btn = document.createElement("button");
    btn.type = "button";
    btn.className = "advert-play";
    btn.id = "advert-play";
    btn.textContent = "▶";
    box.appendChild(btn);
  }
  btn.hidden = false;
  btn.onclick = () => onPlay();
}

function loadAdvertSources(video, sources, progressEl) {
  let index = 0;
  const sourceEl = video.querySelector("source");

  const apply = (url) => {
    video.dataset.activeSrc = url;
    if (sourceEl) {
      sourceEl.src = url;
      sourceEl.type = "video/mp4";
    }
    video.src = url;
    video.load();
  };

  video.onerror = () => {
    index += 1;
    if (index < sources.length) {
      if (progressEl) progressEl.textContent = "Trying another video host…";
      apply(sources[index]);
      video.play().catch(() => {});
      return;
    }
    if (progressEl) {
      progressEl.textContent = "Video could not load. Check your connection, then tap Play.";
    }
  };

  apply(sources[0]);
}

function mountFileAdvert(video, sources, unlock, updateProgress, progressEl) {
  let maxTime = 0;
  const box = video.parentElement;
  const playBtn = box.querySelector("#advert-play");
  const unmuteBtn = box.querySelector("#advert-unmute");

  const tryPlay = (withSound) => {
    video.muted = !withSound;
    const start = video.play();
    if (start && typeof start.catch === "function") {
      start.catch(() => {
        video.muted = true;
        video.play().catch(() => {
          if (progressEl) progressEl.textContent = "Tap Play to watch the advert.";
          if (playBtn) playBtn.hidden = false;
        });
      });
    }
  };

  video.setAttribute("playsinline", "");
  video.setAttribute("webkit-playsinline", "");
  video.removeAttribute("autoplay");
  loadAdvertSources(video, sources, progressEl);
  if (playBtn) playBtn.hidden = false;
  if (progressEl) progressEl.textContent = "Tap Play to watch the advert.";

  addPlayOverlay(box, () => tryPlay(true));
  video.addEventListener("click", () => {
    if (video.paused) tryPlay(true);
  });

  if (unmuteBtn) {
    unmuteBtn.hidden = false;
    unmuteBtn.addEventListener("click", () => {
      video.muted = false;
      unmuteBtn.hidden = true;
      tryPlay(true);
    });
  }

  video.addEventListener("playing", () => {
    if (playBtn) playBtn.hidden = true;
    if (progressEl && !progressEl.textContent.includes("%") && !progressEl.textContent.includes("complete")) {
      progressEl.textContent = "Keep watching…";
    }
  });
  video.addEventListener("pause", () => {
    if (!video.ended && playBtn) playBtn.hidden = false;
  });
  video.addEventListener("volumechange", () => {
    if (unmuteBtn) unmuteBtn.hidden = !video.muted;
  });
  video.addEventListener("timeupdate", () => {
    if (video.currentTime > maxTime + 0.35 && video.seeking) return;
    if (video.currentTime > maxTime) maxTime = video.currentTime;
    updateProgress(maxTime, video.duration);
  });
  video.addEventListener("seeking", () => {
    if (video.currentTime > maxTime + 0.4) video.currentTime = maxTime;
  });
  video.addEventListener("ended", unlock);
}

function mountTikTokAdvert(iframe, unlock, updateProgress, progressEl) {
  addPlayOverlay(iframe.parentElement, () => {
    const ping = () => iframe.contentWindow.postMessage({ type: "play", "x-tiktok-player": true }, "*");
    ping();
    setTimeout(ping, 350);
    setTimeout(ping, 900);
  });
  window.addEventListener("message", (event) => {
    if (!document.getElementById("advert-gate")) return;
    const data = event.data;
    if (!data || !data["x-tiktok-player"]) return;
    if (data.type === "onStateChange" && Number(data.value) === 0) unlock();
    if (data.type === "onCurrentTime") {
      const value = data.value;
      const current = value && typeof value === "object" ? Number(value.currentTime) : Number(value);
      const duration = value && typeof value === "object" ? Number(value.duration) : Number(data.duration);
      if (current >= 0 && duration > 0) updateProgress(current, duration);
    }
    if (data.type === "onPlayerReady") {
      progressEl.textContent = "Press play, then watch to the end.";
    }
  });
}

function mountYouTubeAdvert(id, unlock, updateProgress, progressEl) {
  const start = () => {
    const player = new window.YT.Player("advert-yt", {
      videoId: id,
      playerVars: {
        controls: 0,
        rel: 0,
        modestbranding: 1,
        disablekb: 1,
        fs: 0,
        playsinline: 1,
        origin: location.origin,
      },
      events: {
        onReady(event) {
          const box = document.getElementById("advert-player");
          addPlayOverlay(box, () => event.target.playVideo());
          progressEl.textContent = "Press play, then watch to the end.";
        },
        onStateChange(event) {
          if (event.data === window.YT.PlayerState.ENDED) unlock();
        },
      },
    });
    const tick = () => {
      if (!document.getElementById("advert-gate") || hasWatchedAdvert()) return;
      try {
        if (player && typeof player.getCurrentTime === "function") {
          updateProgress(player.getCurrentTime(), player.getDuration());
        }
      } catch {
        /* player not ready */
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };

  if (window.YT && window.YT.Player) {
    start();
    return;
  }
  const existing = document.querySelector("script[src*='youtube.com/iframe_api']");
  const prev = window.onYouTubeIframeAPIReady;
  window.onYouTubeIframeAPIReady = () => {
    if (typeof prev === "function") prev();
    start();
  };
  if (!existing) {
    const tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(tag);
  }
}

function isInternalSiteLink(link) {
  const href = link.getAttribute("href") || "";
  if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) return false;
  if (/^https?:\/\//i.test(href)) {
    try {
      return new URL(href, location.href).origin === location.origin;
    } catch {
      return false;
    }
  }
  return !href.startsWith("javascript:");
}

function guardAdvertClicks() {
  document.addEventListener(
    "click",
    (e) => {
      if (hasWatchedAdvert()) return;
      if (document.getElementById("advert-gate")) return;
      const link = e.target.closest("a[href]");
      if (!link || !isInternalSiteLink(link)) return;
      if (link.target === "_blank") return;
      const dest = link.getAttribute("href") || "";
      if (/account\.html|admin\.html/.test(dest)) return;
      e.preventDefault();
      pendingAdvertHref = link.href;
      showAdvertGate({ advert_video_url: cachedAdvertUrl || HOSTED_ADVERT_MP4 });
    },
    true
  );
}

async function applyPublicSite() {
  const client = window.getSupabaseClient && window.getSupabaseClient();
  cachedAdvertUrl = cachedAdvertUrl || HOSTED_ADVERT_MP4;
  if (!client) {
    await renderPublicProducts(null);
    await renderReviews(null);
    bindReviewForm(null);
    maybeShowLandingAdvert();
    return;
  }

  const { data } = await client
    .from("site_settings")
    .select("*")
    .eq("id", 1)
    .maybeSingle();

  if (data) {
    applyChannelButton(data);
    applySocialLinks(data);
    cachedAdvertUrl = advertCandidates(data.advert_video_url)[0];
  }
  const user = window.getSessionUser ? await window.getSessionUser() : null;
  if (user) markAdvertSkippedForAccount();
  maybeShowLandingAdvert();

  await renderPublicProducts(client);
  await renderItemPage(client);
  await renderReviews(client);
  bindReviewForm(client);
}

function maybeShowLandingAdvert() {
  const file = pageFile();
  if (file !== "request.html" && file !== "quote-list.html") return;
  if (hasWatchedAdvert()) return;
  showAdvertGate({ advert_video_url: cachedAdvertUrl || HOSTED_ADVERT_MP4 });
}

const FALLBACK_REVIEWS = [
  { author_name: "Ama", location: "Accra", rating: 5, quote: "Very good service. My things came exactly as I ordered. Will definitely order again." },
  { author_name: "Kofi", location: "Kumasi", rating: 5, quote: "I was a bit worried at first but everything went well. My items arrived safely." },
  { author_name: "Efua", location: "Takoradi", rating: 5, quote: "The communication was good and they kept me updated. Delivery was also smooth." },
  { author_name: "Yakubu", location: "Tamale", rating: 5, quote: "I got exactly what I ordered. The price was also reasonable." },
  { author_name: "Adwoa", location: "Accra", rating: 5, quote: "Second time ordering from them and so far so good. No complaints." },
];

function starText(rating) {
  const n = Math.min(5, Math.max(1, Number(rating) || 5));
  return "★".repeat(n) + "☆".repeat(5 - n);
}

function reviewCardHtml(review) {
  return `<article class="review-card">
    <div class="review-stars" aria-label="${escapeAttr(String(review.rating || 5))} out of 5">${starText(review.rating)}</div>
    <p>${escapeHtml(review.quote)}</p>
    <footer>
      <strong>${escapeHtml(review.author_name)}</strong>
      <span>${escapeHtml(review.location || "Ghana")}</span>
    </footer>
  </article>`;
}

function mountReviewsLinks() {
  if (document.body && document.body.id === "admin-page") return;
  document.querySelectorAll(".nav-links").forEach((ul) => {
    if (ul.querySelector("a[href='reviews.html']")) return;
    const li = document.createElement("li");
    const here = pageFile();
    li.innerHTML = `<a href="reviews.html"${here === "reviews.html" ? ' class="active"' : ""}>Reviews</a>`;
    const faq = [...ul.querySelectorAll("a")].find((a) => a.getAttribute("href") === "faq.html");
    if (faq && faq.parentElement) ul.insertBefore(li, faq.parentElement);
    else {
      const req = ul.querySelector(".nav-request");
      if (req) ul.insertBefore(li, req);
      else ul.appendChild(li);
    }
  });
  document.querySelectorAll(".footer-grid ul").forEach((ul) => {
    if (ul.querySelector("a[href='reviews.html']")) return;
    const hrefs = [...ul.querySelectorAll("a")].map((a) => a.getAttribute("href") || "").join(" ");
    if (!/about\.html|faq\.html|how-it-works\.html/.test(hrefs)) return;
    const li = document.createElement("li");
    li.innerHTML = `<a href="reviews.html">Reviews</a>`;
    const faq = [...ul.querySelectorAll("a")].find((a) => a.getAttribute("href") === "faq.html");
    if (faq && faq.parentElement) ul.insertBefore(li, faq.parentElement);
    else ul.appendChild(li);
  });
}

async function renderReviews(client) {
  const grids = document.querySelectorAll("#reviews-grid");
  if (!grids.length) return;
  let rows = FALLBACK_REVIEWS;
  if (client) {
    const { data, error } = await client
      .from("reviews")
      .select("author_name, location, rating, quote, created_at")
      .eq("published", true)
      .order("created_at", { ascending: false });
    if (!error && data && data.length) rows = data;
  }
  const onHome = (pageFile() === "index.html" || pageFile() === "");
  const shown = onHome ? rows.slice(0, 4) : rows;
  const html = shown.map(reviewCardHtml).join("");
  grids.forEach((grid) => { grid.innerHTML = html; });
}

async function bindReviewForm(client) {
  const form = document.getElementById("review-form");
  if (!form) return;
  if (window.getMyProfile) {
    const profile = await window.getMyProfile();
    if (profile) {
      if (form.elements.author_name && !form.elements.author_name.value && profile.full_name) {
        form.elements.author_name.value = profile.full_name;
      }
    }
  }
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const statusEl = document.getElementById("review-status");
    const btn = form.querySelector('button[type="submit"]');
    const author_name = form.elements.author_name.value.trim();
    const quote = form.elements.quote.value.trim();
    const location = form.elements.location.value.trim();
    const rating = Number(form.elements.rating.value) || 5;
    if (!author_name || !quote || !location) {
      showStatus(statusEl, "error", "Please fill in name, location, and your review.");
      return;
    }
    if (!client) {
      showStatus(statusEl, "error", "Reviews are not connected yet. Write the desk on the official line.");
      return;
    }
    btn.disabled = true;
    try {
      const user = window.getSessionUser ? await window.getSessionUser() : null;
      const { error } = await client.from("reviews").insert([{
        author_name,
        location,
        rating,
        quote,
        published: false,
        user_id: user ? user.id : null,
      }]);
      if (error) throw error;
      form.reset();
      if (form.elements.rating) form.elements.rating.value = "5";
      showStatus(statusEl, "success", "Thank you. The desk will publish your review after a check.");
    } catch (err) {
      showStatus(statusEl, "error", err.message || "Couldn't send the review.");
    }
    btn.disabled = false;
  });
}

function categorySlug(name) {
  return String(name || "").toLowerCase();
}

function resolveCategory(name) {
  const slug = categorySlug(name);
  if (slug === "home & kitchen") return "Kitchen & Home";
  return PRODUCT_CATEGORIES.find((row) => categorySlug(row) === slug) || "";
}

function requestedCatalogCategory() {
  const params = new URLSearchParams(window.location.search);
  const raw = (params.get("cat") || params.get("category") || "").trim();
  return resolveCategory(raw) || raw;
}

function renderCategoryChips(active) {
  const host = document.getElementById("category-chips");
  if (!host) return;
  host.innerHTML = PRODUCT_CATEGORIES.map((name) => {
    const on = categorySlug(active) === categorySlug(name);
    return `<a class="chip${on ? " active" : ""}" href="categories.html?cat=${encodeURIComponent(name)}">${escapeHtml(name)}</a>`;
  }).join("");
}

function groupProductsByCategory(products) {
  const groups = new Map(PRODUCT_CATEGORIES.map((name) => [name, []]));
  (products || []).forEach((p) => {
    const cat = resolveCategory(p.category) || "Other";
    if (!groups.has(cat)) groups.set(cat, []);
    groups.get(cat).push(p);
  });
  return groups;
}

async function renderPublicProducts(client) {
  let products = [];
  if (client) {
    const { data, error } = await client
      .from("products")
      .select("*")
      .order("created_at", { ascending: false });
    if (!error && data) products = data;
  }
  const filter = requestedCatalogCategory();
  renderCategoryChips(filter);

  const catalog = document.getElementById("catalog-root");
  if (catalog) {
    const groups = groupProductsByCategory(products);
    const onCategoriesPage = (location.pathname.split("/").pop() || "") === "categories.html";
    let names = PRODUCT_CATEGORIES;
    if (filter) names = PRODUCT_CATEGORIES.filter((name) => categorySlug(name) === categorySlug(filter));
    else if (!onCategoriesPage) names = PRODUCT_CATEGORIES.filter((name) => (groups.get(name) || []).length);
    if (!names.length && !onCategoriesPage) {
      catalog.innerHTML = "";
    } else catalog.innerHTML = names.map((name) => {
      const rows = groups.get(name) || [];
      const cards = rows.length
        ? `<div class="product-grid">${rows.map((p) => productCardHtml(p)).join("")}</div>`
        : `<p class="empty-note">No products in this category yet. Describe what you want and we’ll source it.</p>
           <a class="btn btn-gold" href="request.html?category=${encodeURIComponent(name)}">Order Now</a>`;
      return `<section class="catalog-lane">
        <div class="section-head rail-head">
          <span class="eyebrow">${escapeHtml(name)}</span>
          <h2>${escapeHtml(name)}</h2>
          <a class="more-link" href="categories.html?cat=${encodeURIComponent(name)}">See all →</a>
        </div>
        ${cards}
      </section>`;
    }).join("");
  }

  const grids = document.querySelectorAll("#product-grid");
  if (grids.length) {
    const visible = filter
      ? products.filter((p) => categorySlug(p.category) === categorySlug(filter))
      : products;
    if (!visible.length) {
      document.querySelectorAll("#products-section").forEach((section) => { section.hidden = true; });
    } else {
      const html = visible.map((p) => productCardHtml(p)).join("");
      grids.forEach((grid) => { grid.innerHTML = html; });
      document.querySelectorAll("#products-section").forEach((section) => { section.hidden = false; });
    }
  }

  const popular = document.getElementById("popular-section");
  if (popular && products.length) popular.hidden = true;
}

function openAccountDrawer() {
  const drawer = document.getElementById("account-drawer");
  const backdrop = document.querySelector(".account-backdrop");
  if (!drawer || !backdrop) {
    window.location.href = "account.html";
    return;
  }
  drawer.hidden = false;
  backdrop.hidden = false;
  document.body.classList.add("account-drawer-open");
}

function closeAccountDrawer() {
  const drawer = document.getElementById("account-drawer");
  const backdrop = document.querySelector(".account-backdrop");
  if (drawer) drawer.hidden = true;
  if (backdrop) backdrop.hidden = true;
  document.body.classList.remove("account-drawer-open");
}

function mountAccountChrome() {
  if (document.body && document.body.id === "admin-page") return;

  document.querySelectorAll(".nav-links").forEach((ul) => {
    if (ul.querySelector("[data-account-nav], a[href='account.html']")) return;
    const li = document.createElement("li");
    const here = pageFile();
    li.innerHTML = `<a href="account.html" data-account-nav${here === "account.html" ? ' class="active"' : ""}>Account</a>`;
    const req = ul.querySelector(".nav-request");
    if (req) ul.insertBefore(li, req);
    else ul.appendChild(li);
  });

  const main = document.querySelector(".header-main") || document.querySelector(".tf-top .header-main");
  if (main && !main.querySelector(".header-account")) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "header-account";
    btn.setAttribute("aria-label", "Account");
    btn.setAttribute("data-open-account", "");
    btn.textContent = "👤";
    const toggle = main.querySelector(".nav-toggle");
    if (toggle) main.insertBefore(btn, toggle);
    else main.appendChild(btn);
  }

  if (!document.getElementById("account-drawer")) {
    const backdrop = document.createElement("div");
    backdrop.className = "account-backdrop";
    backdrop.hidden = true;
    backdrop.addEventListener("click", closeAccountDrawer);

    const drawer = document.createElement("aside");
    drawer.id = "account-drawer";
    drawer.className = "account-drawer";
    drawer.hidden = true;
    drawer.innerHTML = `
      <a class="account-drawer-head" href="account.html">
        <span class="account-avatar" aria-hidden="true">👤</span>
        <span class="account-head-copy">
          <strong data-account-head-title>Login / Sign Up</strong>
          <small data-account-head-sub>Keep orders on one account</small>
        </span>
        <span aria-hidden="true">›</span>
      </a>
      <nav class="account-drawer-nav">
        <a href="account.html#orders"><span aria-hidden="true">☰</span> My Orders</a>
        <a href="account.html#transit"><span aria-hidden="true">🚂</span> My Transit</a>
        <a href="request.html"><span aria-hidden="true">💬</span> My Inquiry</a>
        <a href="account.html"><span aria-hidden="true">👤</span> My Account</a>
      </nav>
      <button type="button" class="account-drawer-signout" id="drawer-signout" hidden>Sign out</button>
      <div class="account-drawer-foot"><span aria-hidden="true">🌐</span> English</div>
    `;

    document.body.appendChild(backdrop);
    document.body.appendChild(drawer);
  }

  document.addEventListener("click", (e) => {
    const openBtn = e.target.closest("[data-open-account]");
    if (openBtn) {
      e.preventDefault();
      openAccountDrawer();
    }
  });

  const signOutBtn = document.getElementById("drawer-signout");
  if (signOutBtn) {
    signOutBtn.addEventListener("click", async () => {
      if (window.signOutCustomer) await window.signOutCustomer();
      closeAccountDrawer();
      window.location.reload();
    });
  }

  refreshAccountChrome();
}

async function refreshAccountChrome() {
  const profile = window.getMyProfile ? await window.getMyProfile() : null;
  const title = document.querySelector("[data-account-head-title]");
  const sub = document.querySelector("[data-account-head-sub]");
  const signOutBtn = document.getElementById("drawer-signout");
  if (profile) {
    markAdvertSkippedForAccount();
    if (title) title.textContent = profile.full_name || "My Account";
    if (sub) sub.textContent = profile.email || "Signed in";
    if (signOutBtn) signOutBtn.hidden = false;
  } else {
    if (title) title.textContent = "Login / Sign Up";
    if (sub) sub.textContent = "Keep orders on one account";
    if (signOutBtn) signOutBtn.hidden = true;
  }
}

async function prefillRequestFromAccount() {
  const form = document.getElementById("request-form");
  if (!form || !window.getMyProfile) return;
  const profile = await window.getMyProfile();
  if (!profile) return;
  if (form.elements.name && !form.elements.name.value && profile.full_name) {
    form.elements.name.value = profile.full_name;
  }
  if (form.elements.phone && !form.elements.phone.value && profile.phone) {
    form.elements.phone.value = profile.phone;
  }
  if (form.elements.email && !form.elements.email.value && profile.email) {
    form.elements.email.value = profile.email;
  }
}

const ACCOUNT_SHIPMENT = {
  sourcing: "Sourcing",
  warehouse: "Warehouse",
  vessel: "On the vessel",
  tema: "Tema",
  ready: "Ready for pickup",
};
const ACCOUNT_PANEL_ALIASES = { orders: "stats", transit: "notification", signup: "home", login: "home" };

function showAccountTab(name) {
  const login = document.getElementById("account-login-form");
  const signup = document.getElementById("account-signup-form");
  if (!login || !signup) return;
  login.hidden = name !== "login";
  signup.hidden = name !== "signup";
  document.querySelectorAll("[data-account-tab]").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.accountTab === name);
  });
}

function accountPanelFromHash() {
  const raw = (location.hash || "").replace("#", "");
  if (raw === "signup" || raw === "login") return "home";
  return ACCOUNT_PANEL_ALIASES[raw] || raw || "home";
}

function setAccountMenuOpen(open) {
  const shell = document.getElementById("account-shell");
  const scrim = document.getElementById("udash-scrim");
  if (shell) shell.classList.toggle("is-open", !!open);
  if (scrim) scrim.hidden = !open;
}

function showAccountPanel(name) {
  const panel = ACCOUNT_PANEL_ALIASES[name] || name || "home";
  document.querySelectorAll("[data-udash-panel]").forEach((el) => {
    el.hidden = el.dataset.udashPanel !== panel;
  });
  document.querySelectorAll("[data-udash]").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.udash === panel);
  });
  setAccountMenuOpen(false);
}

function orderCardHtml(row) {
  const when = row.created_at ? new Date(row.created_at).toLocaleDateString() : "";
  const ship = ACCOUNT_SHIPMENT[row.shipment_status] || "";
  const bits = [row.category, row.quantity, row.location].filter(Boolean).join(" · ");
  return `<article class="account-order">
    <div>
      <strong>${escapeHtml(row.request_details || "Import request")}</strong>
      <span>${escapeHtml(bits)}</span>
    </div>
    <em>${escapeHtml(row.status || "New")}${ship ? " · " + ship : ""}</em>
    <small>${escapeHtml(when)}</small>
  </article>`;
}

function accountInitials(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "";
  return ((parts[0][0] || "") + (parts[1]?.[0] || "")).toUpperCase();
}

function countByStatus(rows) {
  const counts = { New: 0, Contacted: 0, Quoted: 0, Confirmed: 0, Closed: 0 };
  rows.forEach((row) => {
    const status = row.status || "New";
    if (counts[status] != null) counts[status] += 1;
  });
  return counts;
}

function paintAccountDashboard(rows) {
  const total = rows.length;
  const active = rows.filter((row) => row.status !== "Closed").length;
  const transit = rows.filter((row) => row.shipment_status || ["Quoted", "Confirmed"].includes(row.status)).length;
  const counts = countByStatus(rows);
  const setText = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  };
  setText("stat-total", String(total));
  setText("stat-active", String(active));
  setText("stat-active-note", active ? "Open files" : "No open files");
  setText("stat-transit", String(transit));
  setText("stat-transit-note", transit ? "Moving to Ghana" : "Nothing moving yet");
  setText("pill-new", String(counts.New));
  setText("pill-quoted", String(counts.Quoted));
  setText("pill-confirmed", String(counts.Confirmed));

  const mix = [
    ["New", counts.New, "#8ec5ff"],
    ["Contacted", counts.Contacted, "#5aa6ff"],
    ["Quoted", counts.Quoted, "#3b82f6"],
    ["Confirmed", counts.Confirmed, "#1d4ed8"],
  ];
  document.querySelectorAll(".udash-ring").forEach((ring, i) => {
    const count = mix[i] ? mix[i][1] : 0;
    ring.style.setProperty("--p", total ? Math.round((count / total) * 100) : 0);
  });
  const legend = document.getElementById("udash-legend");
  if (legend) {
    legend.innerHTML = mix.map(([label, count, color]) =>
      `<li><i style="background:${color}"></i>${label} · ${count}</li>`
    ).join("");
  }

  const bars = document.getElementById("udash-bars");
  if (bars) {
    const now = new Date();
    const months = [];
    for (let i = 6; i >= 0; i -= 1) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({
        key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`,
        label: date.toLocaleString("en", { month: "short" }),
        count: 0,
      });
    }
    rows.forEach((row) => {
      if (!row.created_at) return;
      const key = String(row.created_at).slice(0, 7);
      const bucket = months.find((month) => month.key === key);
      if (bucket) bucket.count += 1;
    });
    const max = Math.max(1, ...months.map((month) => month.count));
    bars.innerHTML = months.map((month) => {
      const height = Math.max(8, Math.round((month.count / max) * 140));
      return `<div class="udash-bar" title="${month.count} order${month.count === 1 ? "" : "s"}"><i style="height:${height}px"></i><small>${escapeHtml(month.label)}</small></div>`;
    }).join("");
  }
}

function filterAccountOrders(rows, query) {
  const needle = String(query || "").trim().toLowerCase();
  if (!needle) return rows;
  return rows.filter((row) => {
    const hay = [row.request_details, row.category, row.status, row.location, ACCOUNT_SHIPMENT[row.shipment_status]]
      .join(" ")
      .toLowerCase();
    return hay.includes(needle);
  });
}

async function mountAccountPage() {
  const authBox = document.getElementById("account-auth");
  const signedBox = document.getElementById("account-signed");
  if (!authBox || !signedBox) return;

  const hash = (location.hash || "").replace("#", "");
  if (hash === "signup") showAccountTab("signup");

  document.querySelectorAll("[data-account-tab]").forEach((btn) => {
    btn.addEventListener("click", () => showAccountTab(btn.dataset.accountTab));
  });
  document.querySelectorAll("[data-udash]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const panel = btn.dataset.udash;
      if (signedBox.hidden && panel !== "home") {
        showAccountPanel("home");
        return;
      }
      showAccountPanel(panel);
      history.replaceState(null, "", "#" + panel);
    });
  });
  document.getElementById("udash-menu")?.addEventListener("click", () => {
    const shell = document.getElementById("account-shell");
    setAccountMenuOpen(!(shell && shell.classList.contains("is-open")));
  });
  document.getElementById("udash-scrim")?.addEventListener("click", () => setAccountMenuOpen(false));

  let accountRows = [];
  const renderLists = (query) => {
    const rows = filterAccountOrders(accountRows, query);
    const ordersEl = document.getElementById("account-orders");
    const transitEl = document.getElementById("account-transit");
    if (ordersEl) {
      ordersEl.innerHTML = rows.length
        ? rows.map(orderCardHtml).join("")
        : `<p class="empty-note">No orders on this account yet. <a href="request.html">Order Now</a></p>`;
    }
    const transit = rows.filter((row) => row.shipment_status || ["Quoted", "Confirmed"].includes(row.status));
    if (transitEl) {
      transitEl.innerHTML = transit.length
        ? transit.map(orderCardHtml).join("")
        : `<p class="empty-note">Nothing in transit yet. Quoted and confirmed files show here.</p>`;
    }
  };

  const searchForm = document.getElementById("udash-search");
  const searchInput = document.getElementById("udash-search-input");
  if (searchForm) {
    searchForm.addEventListener("submit", (e) => {
      e.preventDefault();
      renderLists(searchInput && searchInput.value);
      if (signedBox && !signedBox.hidden) showAccountPanel("stats");
    });
  }
  if (searchInput) {
    searchInput.addEventListener("input", () => renderLists(searchInput.value));
  }

  const paint = async () => {
    const profile = window.getMyProfile ? await window.getMyProfile() : null;
    const nameEl = document.getElementById("udash-name");
    const roleEl = document.getElementById("udash-role");
    const avatar = document.getElementById("udash-avatar");
    if (!profile) {
      authBox.hidden = false;
      signedBox.hidden = true;
      if (nameEl) nameEl.textContent = "Guest";
      if (roleEl) roleEl.textContent = "Log in to your desk file";
      if (avatar) {
        avatar.textContent = "";
        avatar.innerHTML = '<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="3.2"/><path d="M5.5 19.2c1.2-3.3 3.5-5 6.5-5s5.3 1.7 6.5 5"/></svg>';
      }
      showAccountPanel("home");
      return;
    }
    authBox.hidden = true;
    signedBox.hidden = false;
    const displayName = profile.full_name || "Customer";
    if (nameEl) nameEl.textContent = displayName;
    if (roleEl) roleEl.textContent = "Mwinbarka customer";
    if (avatar) avatar.textContent = accountInitials(displayName) || "MW";
    const hello = document.getElementById("account-hello");
    const email = document.getElementById("account-email");
    const name = document.getElementById("profile-name");
    const phone = document.getElementById("profile-phone");
    if (hello) hello.textContent = profile.full_name ? `Hello, ${profile.full_name}` : "Signed in";
    if (email) email.textContent = profile.email || "";
    if (name) name.value = profile.full_name || "";
    if (phone) phone.value = profile.phone || "";

    accountRows = window.fetchMyOrders ? await window.fetchMyOrders() : [];
    paintAccountDashboard(accountRows);
    renderLists(searchInput && searchInput.value);
    showAccountPanel(accountPanelFromHash());
  };

  const loginForm = document.getElementById("account-login-form");
  if (loginForm) {
    loginForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const status = document.getElementById("login-status");
      const btn = loginForm.querySelector('button[type="submit"]');
      btn.disabled = true;
      try {
        if (!window.signInCustomer) throw new Error("Account service is not connected yet.");
        await window.signInCustomer({
          email: loginForm.elements.email.value.trim(),
          password: loginForm.elements.password.value,
        });
        await refreshAccountChrome();
        await paint();
      } catch (err) {
        showStatus(status, "error", err.message || "Could not log in.");
      } finally {
        btn.disabled = false;
      }
    });
  }

  const signupForm = document.getElementById("account-signup-form");
  if (signupForm) {
    signupForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const status = document.getElementById("signup-status");
      const btn = signupForm.querySelector('button[type="submit"]');
      btn.disabled = true;
      try {
        if (!window.signUpCustomer) throw new Error("Account service is not connected yet.");
        const result = await window.signUpCustomer({
          fullName: signupForm.elements.full_name.value.trim(),
          phone: signupForm.elements.phone.value.trim(),
          email: signupForm.elements.email.value.trim(),
          password: signupForm.elements.password.value,
        });
        if (result && result.needsConfirm) {
          showStatus(status, "success", "Account created. Check your email to confirm, then log in.");
          showAccountTab("login");
        } else {
          await refreshAccountChrome();
          await paint();
        }
      } catch (err) {
        showStatus(status, "error", err.message || "Could not create the account.");
      } finally {
        btn.disabled = false;
      }
    });
  }

  const profileForm = document.getElementById("account-profile-form");
  if (profileForm) {
    profileForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const status = document.getElementById("profile-status");
      try {
        if (!window.updateMyProfile) throw new Error("Account service is not connected yet.");
        await window.updateMyProfile({
          full_name: profileForm.elements.full_name.value.trim(),
          phone: profileForm.elements.phone.value.trim(),
        });
        showStatus(status, "success", "Details saved.");
        await refreshAccountChrome();
        await paint();
      } catch (err) {
        showStatus(status, "error", err.message || "Could not save details.");
      }
    });
  }

  const passwordForm = document.getElementById("account-password-form");
  if (passwordForm) {
    passwordForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const status = document.getElementById("account-password-status");
      try {
        if (!window.updateMyPassword) throw new Error("Account service is not connected yet.");
        await window.updateMyPassword({
          currentPassword: passwordForm.elements.current_password.value,
          newPassword: passwordForm.elements.new_password.value,
        });
        passwordForm.reset();
        showStatus(status, "success", "Password saved. Use it the next time you sign in.");
      } catch (err) {
        showStatus(status, "error", err.message || "Could not save the password.");
      }
    });
  }

  const signOut = document.getElementById("account-signout");
  if (signOut) {
    signOut.addEventListener("click", async () => {
      if (window.signOutCustomer) await window.signOutCustomer();
      window.location.href = "account.html";
    });
  }

  await paint();
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
