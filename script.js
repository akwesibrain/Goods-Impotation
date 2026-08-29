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
    if (!document.querySelector(".nav-scrim")) {
      const scrim = document.createElement("div");
      scrim.className = "nav-scrim";
      scrim.addEventListener("click", () => {
        links.classList.remove("open");
        toggle.setAttribute("aria-expanded", "false");
        document.body.classList.remove("nav-open");
      });
      document.body.appendChild(scrim);
    }
    const closeNav = () => {
      links.classList.remove("open");
      toggle.setAttribute("aria-expanded", "false");
      document.body.classList.remove("nav-open");
    };
    toggle.addEventListener("click", () => {
      const expanded = !links.classList.contains("open");
      links.classList.toggle("open", expanded);
      toggle.setAttribute("aria-expanded", expanded);
      document.body.classList.toggle("nav-open", expanded);
    });
    links.querySelectorAll("a").forEach((link) => {
      link.addEventListener("click", closeNav);
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeNav();
    });
  }

  // ---- FAQ accordion ----
  document.querySelectorAll(".faq-item").forEach((item, index) => {
    const q = item.querySelector(".faq-q");
    if (!q) return;
    q.setAttribute("type", "button");
    q.setAttribute("aria-expanded", item.classList.contains("open") ? "true" : "false");
    if (!q.id) q.id = "faq-q-" + (index + 1);
    const panel = item.querySelector(".faq-a");
    if (panel) {
      panel.id = panel.id || "faq-a-" + (index + 1);
      q.setAttribute("aria-controls", panel.id);
    }
    q.addEventListener("click", () => {
      const isOpen = item.classList.contains("open");
      document.querySelectorAll(".faq-item.open").forEach((el) => {
        if (el !== item) {
          el.classList.remove("open");
          const other = el.querySelector(".faq-q");
          if (other) other.setAttribute("aria-expanded", "false");
        }
      });
      item.classList.toggle("open", !isOpen);
      q.setAttribute("aria-expanded", String(!isOpen));
    });
  });

  // ---- Request form ----
  const form = document.getElementById("request-form");
  if (form) {
    form.addEventListener("submit", handleRequestSubmit);
    bindRequestLiveValidation(form);
    fillCategorySelects();
    prefillCategoryFromQuery(form);
    setupPhotoPreview(form);
  } else {
    fillCategorySelects();
  }

  applyPublicSite().then(() => observeReveals(document));
  mountAnnounceBar();
  mountSiteSearch();
  mountFeatureNav();
  enhanceSearch();
  mountMobileChrome();
  mountAccountChrome();
  mountReviewsLinks();
  renderPopularSourcing();
  renderQuoteListPage();
  bindQuoteButtons();
  renderItemPage();
  restoreSearchPhoto();
  prefillRequestFromAccount();
  mountAccountPage();
  mountCatalogSearch();
  polishPublicChrome();
  unstickPublicHeader();
  mountMotion();
  mountDeskSlider();
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
    productField.value = `Please quote sea shipping to Ghana for about ${kg} kg.`;
  }

  if (q) {
    if (looksLikeUrl(q)) {
      const url = q.startsWith("http") ? q : `https://${q}`;
      if (form.elements.reference_url && !form.elements.reference_url.value) {
        form.elements.reference_url.value = url;
      }
      if (productField && !productField.value) {
        productField.value = "Please quote this listing.";
      }
    } else if (productField && !productField.value) {
      productField.value = q;
    }
  }
}

function fieldWrap(form, name) {
  const el = form.elements[name];
  return el && el.closest ? el.closest(".field") : null;
}

function setFieldError(form, name, message) {
  const wrap = fieldWrap(form, name);
  const input = form.elements[name];
  const err = document.getElementById(name + "-error") || (wrap && wrap.querySelector(".field-error"));
  if (wrap) wrap.classList.toggle("is-invalid", !!message);
  if (input) {
    input.setAttribute("aria-invalid", message ? "true" : "false");
    if (err && err.id) input.setAttribute("aria-describedby", err.id);
  }
  if (err) {
    err.hidden = !message;
    err.textContent = message || "";
  }
}

function clearFieldErrors(form) {
  ["name", "phone", "email", "product", "category", "location", "quantity", "reference_url", "origin"].forEach((name) => {
    setFieldError(form, name, "");
  });
}

function readRequestForm(form) {
  const fields = form.elements;
  const product = (fields.product || fields.request_details);
  const notes = fields.notes && fields.notes.value ? String(fields.notes.value).trim() : "";
  let details = product ? product.value : "";
  if (notes) details = (details + "\n\nAdditional requirements: " + notes).slice(0, 2000);
  return {
    name: fields.name.value,
    phone: fields.phone.value,
    email: fields.email ? fields.email.value : "",
    location: fields.location ? fields.location.value : "",
    category: fields.category ? fields.category.value : "",
    request_details: details,
    product: details,
    quantity: fields.quantity ? fields.quantity.value : "",
    reference_url: fields.reference_url ? fields.reference_url.value : "",
    origin: fields.origin ? fields.origin.value : "",
  };
}

function bindRequestLiveValidation(form) {
  const names = ["name", "phone", "email", "product", "category", "quantity", "location", "reference_url", "origin"];
  names.forEach((name) => {
    const el = form.elements[name];
    if (!el) return;
    const run = () => {
      const parsed = window.MwinbarkaForms.parseImportRequest(readRequestForm(form));
      setFieldError(form, name, parsed.errors[name] || "");
    };
    el.addEventListener("blur", run);
    el.addEventListener("change", run);
  });
}

function requestRefLabel(id) {
  if (!id) return "";
  return "MW-" + String(id).replace(/-/g, "").slice(0, 8).toUpperCase();
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
  const statusEl = document.getElementById("form-status");
  const submitBtn = form.querySelector('button[type="submit"]');
  const stickyBtn = document.querySelector('.request-sticky button[type="submit"]');

  clearFieldErrors(form);

  const parsed = window.MwinbarkaForms.parseImportRequest(readRequestForm(form));
  Object.entries(parsed.errors).forEach(([name, message]) => setFieldError(form, name, message));
  if (!parsed.ok) {
    const firstName = Object.keys(parsed.errors)[0];
    const firstInvalid = form.elements[firstName];
    showStatus(statusEl, "error", window.MwinbarkaForms.firstError(parsed.errors));
    if (firstInvalid && firstInvalid.focus) firstInvalid.focus();
    return;
  }
  const data = Object.assign({ photo_url: "" }, parsed.data);

  const originalLabel = submitBtn ? submitBtn.textContent : "";
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.classList.add("is-loading");
    submitBtn.textContent = "Sending…";
  }
  if (stickyBtn) {
    stickyBtn.disabled = true;
    stickyBtn.classList.add("is-loading");
    stickyBtn.textContent = "Sending…";
  }
  showStatus(statusEl, "loading", "Saving your request…");

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

  let requestId = "";
  try {
    if (window.saveRequestToSupabase) {
      requestId = (await window.saveRequestToSupabase(data)) || "";
    }
  } catch (err) {
    console.error("Supabase save failed (official chat will still open):", err);
  }

  const ref = requestRefLabel(requestId);
  const lines = [
    `Hi Mwinbarka Imports, I'd like to place an order:`,
    ref ? `Reference: ${ref}` : null,
    `Name: ${data.name}`,
    `Phone: ${data.phone}`,
    data.email ? `Email: ${data.email}` : null,
    `Product: ${data.request_details}`,
    data.category ? `Category: ${data.category}` : null,
    data.origin ? `Origin: ${data.origin}` : null,
    data.reference_url ? `Listing: ${data.reference_url}` : null,
    data.location ? `Location: ${data.location}` : null,
    data.quantity ? `Quantity: ${data.quantity}` : null,
    data.photo_url ? `Photo: ${data.photo_url}` : null,
  ].filter(Boolean);

  const message = encodeURIComponent(lines.join("\n"));
  const waUrl = `https://wa.me/${WA_NUMBER}?text=${message}`;

  form.reset();
  clearFieldErrors(form);
  const preview = form.querySelector("#photo-preview");
  if (preview) preview.innerHTML = "";
  if (new URLSearchParams(window.location.search).get("from") === "list") saveQuoteList([]);
  if (submitBtn) {
    submitBtn.disabled = false;
    submitBtn.classList.remove("is-loading");
    submitBtn.textContent = originalLabel || "Start Your Order";
  }
  if (stickyBtn) {
    stickyBtn.disabled = false;
    stickyBtn.classList.remove("is-loading");
    stickyBtn.textContent = originalLabel || "Start Your Order";
  }
  if (statusEl) statusEl.className = "form-status";

  showOrderReceived(waUrl);
}

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function motionMs(ms) {
  return prefersReducedMotion() ? 0 : ms;
}

function mountDeskSlider() {
  const root = document.querySelector("[data-desk-slider]");
  if (!root) return;
  const slides = Array.from(root.querySelectorAll(".desk-slide"));
  const dots = Array.from(root.querySelectorAll(".desk-dot"));
  if (slides.length < 2) return;

  let index = Math.max(0, slides.findIndex((slide) => slide.classList.contains("is-on")));
  let timer = 0;

  const show = (next) => {
    index = (next + slides.length) % slides.length;
    slides.forEach((slide, i) => slide.classList.toggle("is-on", i === index));
    dots.forEach((dot, i) => {
      const on = i === index;
      dot.classList.toggle("is-on", on);
      dot.setAttribute("aria-selected", on ? "true" : "false");
    });
  };

  const stop = () => {
    if (timer) {
      window.clearInterval(timer);
      timer = 0;
    }
  };

  const start = () => {
    stop();
    if (prefersReducedMotion()) return;
    timer = window.setInterval(() => show(index + 1), 6500);
  };

  dots.forEach((dot, i) => {
    dot.addEventListener("click", () => {
      show(i);
      start();
    });
  });

  root.addEventListener("mouseenter", stop);
  root.addEventListener("mouseleave", start);
  root.addEventListener("focusin", stop);
  root.addEventListener("focusout", (event) => {
    if (!root.contains(event.relatedTarget)) start();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stop();
    else start();
  });

  show(index);
  start();
}

let revealObserver = null;

function mountMotion() {
  if (document.body && document.body.id === "admin-page") return;
  if (prefersReducedMotion()) {
    document.querySelectorAll(".reveal").forEach((el) => el.classList.add("is-in"));
    return;
  }
  if (!revealObserver) {
    revealObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-in");
        revealObserver.unobserve(entry.target);
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.1 });
  }
  observeReveals(document);
}

function observeReveals(root) {
  if (document.body && document.body.id === "admin-page") return;
  if (prefersReducedMotion()) return;
  if (!revealObserver) {
    revealObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-in");
        revealObserver.unobserve(entry.target);
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.1 });
  }
  const scope = root && root.querySelectorAll ? root : document;
  const nodes = scope.querySelectorAll([
    ".section-head",
    ".stamp-grid article",
    ".why-card",
    ".faq-item",
    ".form-card",
    ".review-card",
    ".category-card",
    ".ticket",
    ".product-card",
    ".cta-band",
    ".trust-plate",
    ".loc-grid > *",
    ".catalog-lane",
    ".item-info",
    ".item-block",
    ".quote-rows li",
    ".process-list li",
    ".split > *",
    ".udash-hero",
    ".panel",
    ".home-faq .faq-item",
    ".trust-strip-row div",
    ".step-cards article",
  ].join(","));
  const fold = window.innerHeight * 0.92;
  nodes.forEach((el) => {
    if (el.closest(".tf-hero, .desk-stage, .page-hero, .site-header, .tabbar")) return;
    if (el.classList.contains("skeleton-card")) return;
    if (el.closest("[hidden]")) return;
    if (el.classList.contains("is-in")) return;
    if (el.classList.contains("reveal")) {
      revealObserver.observe(el);
      return;
    }
    const top = el.getBoundingClientRect().top;
    if (top < fold && top > -40) {
      el.classList.add("is-in");
      return;
    }
    el.classList.add("reveal");
    const parent = el.parentElement;
    const idx = parent ? Math.max(0, [...parent.children].indexOf(el)) : 0;
    el.style.setProperty("--stagger", `${Math.min(idx, 6) * 50}ms`);
    revealObserver.observe(el);
  });
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
  requestAnimationFrame(() => {
    requestAnimationFrame(() => modal.classList.add("is-open"));
  });
  const openWhatsApp = () => {
    modal.classList.remove("is-open");
    const finish = () => {
      modal.hidden = true;
      document.body.classList.remove("order-modal-open");
      const opened = window.open(waUrl, "_blank");
      if (!opened) window.location.href = waUrl;
    };
    setTimeout(finish, motionMs(200));
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

function mountCatalogSearch() {
  const input = document.getElementById("catalog-search");
  const root = document.getElementById("catalog-root");
  if (!input || !root) return;
  input.addEventListener("input", () => {
    const q = input.value.trim().toLowerCase();
    root.querySelectorAll(".product-card").forEach((card) => {
      const text = (card.textContent || "").toLowerCase();
      card.hidden = Boolean(q) && !text.includes(q);
    });
    root.querySelectorAll(".catalog-lane").forEach((lane) => {
      const cards = [...lane.querySelectorAll(".product-card")];
      const visible = cards.some((card) => !card.hidden);
      lane.hidden = Boolean(q) && cards.length > 0 && !visible;
    });
  });
}

function polishPublicChrome() {
  document.querySelectorAll(".wa-float").forEach((el) => {
    if (el.getAttribute("aria-label") === "Join our channel") {
      el.setAttribute("aria-label", "Chat with the desk");
    }
  });
}

function unstickPublicHeader() {
  const header = document.querySelector("header.site-header");
  if (!header) return;
  const parts = [header, ...header.querySelectorAll(":scope > *, .tf-top, .tf-nav, .desk-nav, .announce-bar, .header-main, .tf-nav-row")];
  parts.forEach((el) => {
    if (el.classList.contains("nav-links")) return;
    const pos = window.getComputedStyle(el).position;
    if (pos === "sticky" || pos === "fixed") {
      el.style.setProperty("position", "relative", "important");
      el.style.setProperty("top", "auto", "important");
      el.style.setProperty("left", "auto", "important");
      el.style.setProperty("right", "auto", "important");
      el.style.setProperty("bottom", "auto", "important");
    }
  });
}

function mountFeatureNav() {
  if (document.body && document.body.id === "admin-page") return;

  if (!document.querySelector(".quote-link")) {
    const cta = document.querySelector(".header-main .nav-cta") || document.querySelector(".nav-cta");
    const link = document.createElement("a");
    link.href = "quote-list.html";
    link.className = "quote-link";
    link.innerHTML = `Quote list <span class="quote-count" data-quote-count>0</span>`;
    if (cta && cta.parentNode) cta.parentNode.insertBefore(link, cta);
    else if (document.querySelector(".header-main")) document.querySelector(".header-main").appendChild(link);
  }

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
    ? `<img src="${escapeAttr(p.image_url)}" alt="${escapeAttr(p.name)}" width="400" height="400" loading="lazy" decoding="async">`
    : `<img src="${tileDataUri((p.category || "MW").split(" ")[0])}" alt="" width="400" height="400" loading="lazy" decoding="async">`;
  const blurb = p.notes || p.description || "";
  const href = `item.html?id=${encodeURIComponent(id)}`;
  return `
    <a class="product-card" href="${href}">
      ${img}
      <div class="product-body">
        <span class="code">${escapeHtml(p.category || "Product")}</span>
        <h3>${escapeHtml(p.name)}</h3>
        ${blurb ? `<p class="product-tagline">${escapeHtml(blurb)}</p>` : ""}
        <span class="product-status">Available to source</span>
        ${price ? `<div class="product-price">${escapeHtml(price)}${opts.indicative ? " <small>indicative</small>" : ""}</div>` : `<div class="product-price"><small>Request quote</small></div>`}
        <span class="product-order">Request quote</span>
      </div>
    </a>
  `;
}

function renderPopularSourcing() {
  const grid = document.getElementById("popular-grid");
  if (!grid) return;
  grid.innerHTML = POPULAR_SOURCING.map((p) => productCardHtml(p, { indicative: true })).join("");
  observeReveals(grid);
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
  observeReveals(wrap);
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
    ? `<img src="${escapeAttr(item.image_url)}" alt="${escapeAttr(item.name)}" width="800" height="800" fetchpriority="high" decoding="async">`
    : `<img src="${tileDataUri((item.category || "MW").split(" ")[0])}" alt="" width="800" height="800" decoding="async">`;
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
        <li>We ship by sea to Ghana. Typical transit is 4–8 weeks after the supplier ships.</li>
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
  observeReveals(root);
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

async function applyPublicSite() {
  const client = window.getSupabaseClient && window.getSupabaseClient();
  if (!client) {
    await renderPublicProducts(null);
    await renderReviews(null);
    bindReviewForm(null);
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
  }

  await renderPublicProducts(client);
  await renderItemPage(client);
  await renderReviews(client);
  bindReviewForm(client);
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

function reviewInitials(name) {
  return String(name || "M")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0))
    .join("")
    .toUpperCase() || "M";
}

function reviewCardHtml(review) {
  const name = review.author_name || "Customer";
  return `<article class="review-card">
    <div class="review-stars" aria-label="${escapeAttr(String(review.rating || 5))} out of 5">${starText(review.rating)}</div>
    <p>${escapeHtml(review.quote)}</p>
    <footer>
      <span class="review-avatar" aria-hidden="true">${escapeHtml(reviewInitials(name))}</span>
      <div>
        <strong>${escapeHtml(name)}</strong>
        <span>${escapeHtml(review.location || "Ghana")}</span>
      </div>
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
  observeReveals(document);
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
    const parsed = window.MwinbarkaForms.parseReview({
      author_name: form.elements.author_name.value,
      quote: form.elements.quote.value,
      location: form.elements.location.value,
      rating: form.elements.rating.value,
    });
    ["author_name", "location", "quote", "rating"].forEach((name) => {
      setFieldError(form, name, parsed.errors[name] || "");
    });
    if (!parsed.ok) {
      showStatus(statusEl, "error", window.MwinbarkaForms.firstError(parsed.errors));
      return;
    }
    const { author_name, quote, location, rating } = parsed.data;
    if (!client) {
      showStatus(statusEl, "error", "Reviews are not connected yet. Write the desk on the official line.");
      return;
    }
    btn.disabled = true;
    btn.classList.add("is-loading");
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
    btn.classList.remove("is-loading");
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
      catalog.innerHTML = products.length
        ? ""
        : `<p class="empty-note">No live products on the floor yet. Popular sourcing examples are below — or describe what you want.</p>
           <a class="btn btn-gold" href="request.html">Start an Import Request</a>`;
    } else catalog.innerHTML = names.map((name) => {
      const rows = groups.get(name) || [];
      const cards = rows.length
        ? `<div class="product-grid">${rows.map((p) => productCardHtml(p)).join("")}</div>`
        : `<p class="empty-note">No products in this category yet. Describe what you want and we’ll source it.</p>
           <a class="btn btn-gold" href="request.html?category=${encodeURIComponent(name)}">Start an Import Request</a>`;
      return `<section class="catalog-lane">
        <div class="section-head rail-head">
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
  observeReveals(document);
}

function openAccountDrawer() {
  const drawer = document.getElementById("account-drawer");
  const backdrop = document.querySelector(".account-backdrop");
  if (!drawer || !backdrop) {
    window.location.href = "account.html";
    return;
  }
  clearTimeout(openAccountDrawer._hide);
  drawer.hidden = false;
  backdrop.hidden = false;
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      document.body.classList.add("account-drawer-open");
    });
  });
}

function closeAccountDrawer() {
  const drawer = document.getElementById("account-drawer");
  const backdrop = document.querySelector(".account-backdrop");
  document.body.classList.remove("account-drawer-open");
  clearTimeout(openAccountDrawer._hide);
  openAccountDrawer._hide = setTimeout(() => {
    if (drawer) drawer.hidden = true;
    if (backdrop) backdrop.hidden = true;
  }, motionMs(320));
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
  if (form.elements.phone && !form.elements.phone.value && (profile.whatsapp || profile.phone)) {
    form.elements.phone.value = profile.whatsapp || profile.phone;
  }
  if (form.elements.email && !form.elements.email.value && profile.email) {
    form.elements.email.value = profile.email;
  }
  if (form.elements.location && !form.elements.location.value) {
    const place = [profile.city, profile.region].filter(Boolean).join(", ");
    if (place) form.elements.location.value = place;
  }
}

const ACCOUNT_SHIPMENT = {
  sourcing: "Sourcing",
  warehouse: "Warehouse",
  vessel: "On the vessel",
  tema: "Tema",
  ready: "Ready for pickup",
};
const ACCOUNT_STATUS_LABEL = {
  New: "Pending",
  Contacted: "Reviewing",
  Quoted: "Quoted",
  Confirmed: "Confirmed",
  Closed: "Closed",
};
const ACCOUNT_STATUS_CLASS = {
  New: "is-pending",
  Contacted: "is-review",
  Quoted: "is-quoted",
  Confirmed: "is-ok",
  Closed: "is-closed",
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
  const status = row.status || "New";
  const label = ACCOUNT_STATUS_LABEL[status] || status;
  const badgeClass = ACCOUNT_STATUS_CLASS[status] || "is-pending";
  return `<article class="account-order">
    <div>
      <strong>${escapeHtml(row.request_details || "Import request")}</strong>
      <span>${escapeHtml(bits)}</span>
    </div>
    <span class="status-badge ${badgeClass}">${escapeHtml(label)}${ship ? " · " + escapeHtml(ship) : ""}</span>
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

function formatAccountDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function fillProfileForms(profile, orderCount) {
  const hello = document.getElementById("account-hello");
  const email = document.getElementById("account-email");
  const heroAvatar = document.getElementById("profile-hero-avatar");
  const member = document.getElementById("profile-member-since");
  const orderEl = document.getElementById("profile-order-count");
  const lastSeen = document.getElementById("settings-last-signin");
  const currentEmail = document.getElementById("settings-current-email");
  if (hello) hello.textContent = profile.full_name || "Signed in";
  if (email) email.textContent = profile.email || "";
  if (heroAvatar) heroAvatar.textContent = accountInitials(profile.full_name) || "MW";
  if (member) member.textContent = profile.created_at ? `Member since ${formatAccountDate(profile.created_at)}` : "Member";
  if (orderEl) orderEl.textContent = `${orderCount} order${orderCount === 1 ? "" : "s"}`;
  if (lastSeen) {
    lastSeen.textContent = profile.last_sign_in_at
      ? `Last sign-in ${formatAccountDate(profile.last_sign_in_at)}`
      : "Signed in on this device";
  }
  if (currentEmail) currentEmail.value = profile.email || "";

  const form = document.getElementById("account-profile-form");
  if (form) {
    const setVal = (name, value) => {
      if (form.elements[name]) form.elements[name].value = value || "";
    };
    setVal("full_name", profile.full_name);
    setVal("company_name", profile.company_name);
    setVal("phone", profile.phone);
    setVal("whatsapp", profile.whatsapp);
    setVal("region", profile.region);
    setVal("city", profile.city);
    setVal("address", profile.address);
    setVal("landmark", profile.landmark);
    const same = document.getElementById("profile-whatsapp-same");
    if (same) same.checked = !profile.whatsapp || profile.whatsapp === profile.phone;
  }

  const notify = document.getElementById("account-notify-form");
  if (notify) {
    if (notify.elements.notify_sms) notify.elements.notify_sms.checked = profile.notify_sms !== false;
    if (notify.elements.notify_whatsapp) notify.elements.notify_whatsapp.checked = profile.notify_whatsapp !== false;
    if (notify.elements.notify_email) notify.elements.notify_email.checked = profile.notify_email !== false;
  }
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
    if (roleEl) roleEl.textContent = profile.company_name || "Mwinbarka customer";
    if (avatar) avatar.textContent = accountInitials(displayName) || "MW";

    accountRows = window.fetchMyOrders ? await window.fetchMyOrders() : [];
    fillProfileForms(profile, accountRows.length);
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
      btn.classList.add("is-loading");
      try {
        if (!window.signInCustomer) throw new Error("Account service is not connected yet.");
        const parsed = window.MwinbarkaForms.parseLogin({
          email: loginForm.elements.email.value,
          password: loginForm.elements.password.value,
        });
        if (!parsed.ok) throw new Error(window.MwinbarkaForms.firstError(parsed.errors));
        await window.signInCustomer({
          email: parsed.data.email,
          password: parsed.data.password,
        });
        await refreshAccountChrome();
        await paint();
      } catch (err) {
        showStatus(status, "error", err.message || "Could not log in.");
      } finally {
        btn.disabled = false;
        btn.classList.remove("is-loading");
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
      btn.classList.add("is-loading");
      try {
        if (!window.signUpCustomer) throw new Error("Account service is not connected yet.");
        const parsed = window.MwinbarkaForms.parseSignup({
          fullName: signupForm.elements.full_name.value,
          phone: signupForm.elements.phone.value,
          email: signupForm.elements.email.value,
          password: signupForm.elements.password.value,
        });
        if (!parsed.ok) throw new Error(window.MwinbarkaForms.firstError(parsed.errors));
        const result = await window.signUpCustomer({
          fullName: parsed.data.fullName,
          phone: parsed.data.phone,
          email: parsed.data.email,
          password: parsed.data.password,
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
        btn.classList.remove("is-loading");
      }
    });
  }

  const whatsappSame = document.getElementById("profile-whatsapp-same");
  const phoneInput = document.getElementById("profile-phone");
  const whatsappInput = document.getElementById("profile-whatsapp");
  if (whatsappSame && phoneInput && whatsappInput) {
    const syncWhatsapp = () => {
      if (whatsappSame.checked) whatsappInput.value = phoneInput.value;
    };
    whatsappSame.addEventListener("change", syncWhatsapp);
    phoneInput.addEventListener("input", syncWhatsapp);
  }

  const profileForm = document.getElementById("account-profile-form");
  if (profileForm) {
    profileForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const status = document.getElementById("profile-status");
      try {
        if (!window.updateMyProfile) throw new Error("Account service is not connected yet.");
        const whatsappRaw = whatsappSame && whatsappSame.checked
          ? profileForm.elements.phone.value
          : profileForm.elements.whatsapp.value;
        const parsed = window.MwinbarkaForms.parseProfile({
          full_name: profileForm.elements.full_name.value,
          company_name: profileForm.elements.company_name.value,
          phone: profileForm.elements.phone.value,
          whatsapp: whatsappRaw,
          region: profileForm.elements.region.value,
          city: profileForm.elements.city.value,
          address: profileForm.elements.address.value,
          landmark: profileForm.elements.landmark.value,
        });
        if (!parsed.ok) throw new Error(window.MwinbarkaForms.firstError(parsed.errors));
        await window.updateMyProfile(parsed.data);
        showStatus(status, "success", "Profile saved. The desk will use this on the next quote.");
        await refreshAccountChrome();
        await paint();
      } catch (err) {
        showStatus(status, "error", err.message || "Could not save details.");
      }
    });
  }

  const emailForm = document.getElementById("account-email-form");
  if (emailForm) {
    emailForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const status = document.getElementById("account-email-status");
      const next = emailForm.elements.new_email.value.trim();
      const confirm = emailForm.elements.confirm_email.value.trim();
      const parsed = window.MwinbarkaForms.parseNewEmail({ email: next });
      if (!parsed.ok) {
        showStatus(status, "error", window.MwinbarkaForms.firstError(parsed.errors));
        return;
      }
      if (parsed.data.email !== window.MwinbarkaForms.sanitizeEmail(confirm)) {
        showStatus(status, "error", "The two new email addresses do not match.");
        return;
      }
      try {
        if (!window.updateMyEmail) throw new Error("Account service is not connected yet.");
        await window.updateMyEmail({
          currentPassword: emailForm.elements.current_password.value,
          newEmail: next,
          emailRedirectTo: window.location.origin + "/account.html",
        });
        emailForm.elements.new_email.value = "";
        emailForm.elements.confirm_email.value = "";
        emailForm.elements.current_password.value = "";
        showStatus(status, "success", "Confirm link sent. Open the new inbox, tap the link, then sign in with the new email.");
      } catch (err) {
        showStatus(status, "error", err.message || "Could not change the email.");
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
        const next = passwordForm.elements.new_password.value;
        const confirm = passwordForm.elements.confirm_password.value;
        if (next.length < 6) throw new Error("The new password must be at least 6 characters.");
        if (next !== confirm) throw new Error("The two new passwords do not match.");
        await window.updateMyPassword({
          currentPassword: passwordForm.elements.current_password.value,
          newPassword: next,
        });
        passwordForm.reset();
        showStatus(status, "success", "Password saved. Use it the next time you sign in.");
      } catch (err) {
        showStatus(status, "error", err.message || "Could not save the password.");
      }
    });
  }

  const notifyForm = document.getElementById("account-notify-form");
  if (notifyForm) {
    notifyForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const status = document.getElementById("account-notify-status");
      try {
        if (!window.updateMyAlerts) throw new Error("Account service is not connected yet.");
        await window.updateMyAlerts({
          notify_sms: notifyForm.elements.notify_sms.checked,
          notify_whatsapp: notifyForm.elements.notify_whatsapp.checked,
          notify_email: notifyForm.elements.notify_email.checked,
        });
        showStatus(status, "success", "Alert preferences saved.");
      } catch (err) {
        showStatus(status, "error", err.message || "Could not save alerts.");
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
  const signOutAll = document.getElementById("account-signout-all");
  if (signOutAll) {
    signOutAll.addEventListener("click", async () => {
      if (!window.confirm("Sign out of every device using this account?")) return;
      if (window.signOutCustomer) await window.signOutCustomer(true);
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
