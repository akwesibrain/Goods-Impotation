// ============================================================
// MWINBARKA IMPORTS — admin panel
// ============================================================
// Reads and updates requests, products, reviews, and settings.
// Access is enforced by Supabase row level security
// (see supabase/schema.sql). Hiding these panels is convenience —
// the database is what actually keeps the data private.
// ============================================================

const STATUSES = ["New", "Contacted", "Quoted", "Confirmed", "Closed"];
const TAB_TITLES = {
  overview: ["MW · Desk", "Overview"],
  requests: ["MW · Leads", "Requests"],
  customers: ["MW · Accounts", "Customers"],
  products: ["MW · Catalog", "Products"],
  reviews: ["MW · Reviews", "Reviews"],
  settings: ["MW · Site", "Settings"],
};

let activeFilter = "All";
let searchQuery = "";
let allRequests = [];
let allProducts = [];
let allReviews = [];
let allCustomers = [];

document.addEventListener("DOMContentLoaded", () => {
  const client = window.getSupabaseClient && window.getSupabaseClient();

  const unconfigured = document.getElementById("admin-unconfigured");
  const loginSection = document.getElementById("admin-login");
  const dashboard = document.getElementById("admin-dashboard");
  const signOutBtn = document.getElementById("signout-btn");

  if (!client) {
    unconfigured.style.display = "block";
    return;
  }

  const showSignedIn = async () => {
    const staff = window.isStaffSession ? await window.isStaffSession() : false;
    if (!staff) {
      const statusEl = document.getElementById("login-status");
      if (statusEl) {
        statusEl.className = "form-status error";
        statusEl.textContent = "This desk is for staff only. Customer accounts use Login / Sign Up on the site.";
      }
      await client.auth.signOut();
      showSignedOut();
      return;
    }
    loginSection.style.display = "none";
    dashboard.style.display = "flex";
    if (signOutBtn) signOutBtn.style.display = "inline-flex";
    const profile = window.getMyProfile ? await window.getMyProfile() : null;
    const staffLine = document.getElementById("admin-staff-email");
    if (staffLine && profile) {
      staffLine.textContent = profile.email || profile.full_name || "Staff";
    }
    await Promise.all([
      loadRequests(client),
      loadProducts(client),
      loadReviews(client),
      loadCustomers(client),
      loadSettings(client),
    ]);
    showTab(tabFromHash());
  };

  const showSignedOut = () => {
    loginSection.style.display = "flex";
    dashboard.style.display = "none";
    if (signOutBtn) signOutBtn.style.display = "none";
  };

  client.auth.getSession().then(({ data }) => {
    if (data.session) showSignedIn();
    else showSignedOut();
  });

  document.getElementById("login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const statusEl = document.getElementById("login-status");
    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true;

    const { error } = await client.auth.signInWithPassword({
      email: e.target.elements.email.value.trim(),
      password: e.target.elements.password.value,
    });

    btn.disabled = false;

    if (error) {
      statusEl.className = "form-status error";
      statusEl.textContent = error.message;
      return;
    }
    statusEl.className = "form-status";
    statusEl.textContent = "";
    showSignedIn();
  });

  signOutBtn.addEventListener("click", async () => {
    await client.auth.signOut();
    showSignedOut();
  });

  document.getElementById("refresh-btn").addEventListener("click", () => loadRequests(client));

  document.getElementById("status-filters").addEventListener("click", (e) => {
    const chip = e.target.closest(".chip");
    if (!chip || !chip.dataset.status) return;
    document.querySelectorAll("#status-filters .chip").forEach((c) => c.classList.remove("active"));
    chip.classList.add("active");
    activeFilter = chip.dataset.status;
    renderRequests(client);
  });

  const search = document.getElementById("request-search");
  if (search) {
    search.addEventListener("input", () => {
      searchQuery = search.value.trim().toLowerCase();
      renderRequests(client);
    });
  }

  document.getElementById("admin-tabs").addEventListener("click", (e) => {
    const chip = e.target.closest("[data-tab]");
    if (!chip) return;
    showTab(chip.dataset.tab);
    closeAdminMenu();
  });

  window.addEventListener("hashchange", () => showTab(tabFromHash()));

  const menuToggle = document.getElementById("admin-menu-toggle");
  if (menuToggle) {
    menuToggle.addEventListener("click", () => {
      document.getElementById("admin-dashboard").classList.toggle("nav-open");
    });
  }

  document.getElementById("product-form").addEventListener("submit", (e) => handleProductSubmit(e, client));
  document.getElementById("review-admin-form").addEventListener("submit", (e) => handleReviewAdminSubmit(e, client));
  document.getElementById("settings-form").addEventListener("submit", (e) => handleSettingsSubmit(e, client));
});

function tabFromHash() {
  const name = (location.hash || "#overview").replace("#", "");
  return TAB_TITLES[name] ? name : "overview";
}

function showTab(name) {
  const tab = TAB_TITLES[name] ? name : "overview";
  document.querySelectorAll("#admin-tabs [data-tab]").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tab === tab);
  });
  document.querySelectorAll(".admin-panel").forEach((panel) => {
    panel.hidden = panel.id !== "tab-" + tab;
  });
  const titles = TAB_TITLES[tab];
  const kicker = document.getElementById("admin-page-kicker");
  const title = document.getElementById("admin-page-title");
  if (kicker) kicker.textContent = titles[0];
  if (title) title.textContent = titles[1];
  if (location.hash.replace("#", "") !== tab) {
    history.replaceState(null, "", "#" + tab);
  }
}

function closeAdminMenu() {
  const shell = document.getElementById("admin-dashboard");
  if (shell) shell.classList.remove("nav-open");
}

function countByStatus(status) {
  return allRequests.filter((r) => (r.status || "New") === status).length;
}

function renderOverview() {
  const stats = document.getElementById("overview-stats");
  const recentBody = document.getElementById("overview-requests");
  const reviewBox = document.getElementById("overview-reviews");
  if (!stats || !recentBody || !reviewBox) return;

  const pendingReviews = allReviews.filter((r) => !r.published).length;
  stats.innerHTML = [
    ["New requests", countByStatus("New")],
    ["In progress", countByStatus("Contacted") + countByStatus("Quoted")],
    ["Confirmed", countByStatus("Confirmed")],
    ["Products", allProducts.length],
    ["Pending reviews", pendingReviews],
    ["Customers", allCustomers.length],
  ].map(([label, value]) => `<article class="admin-stat">
      <strong>${value}</strong>
      <span>${escapeHtml(label)}</span>
    </article>`).join("");

  const recent = allRequests.slice(0, 6);
  if (!recent.length) {
    recentBody.innerHTML = `<tr><td colspan="4"><div class="admin-empty">No requests yet.</div></td></tr>`;
  } else {
    recentBody.innerHTML = recent.map((r) => {
      const status = r.status || "New";
      return `<tr>
        <td class="cell-when">${formatDate(r.created_at)}</td>
        <td><strong>${escapeHtml(r.name)}</strong><br><span class="cell-when">${escapeHtml(r.phone || "")}</span></td>
        <td class="cell-details">${escapeHtml(r.request_details)}</td>
        <td><span class="status-pill ${status.toLowerCase()}">${escapeHtml(status)}</span></td>
      </tr>`;
    }).join("");
  }

  const pending = allReviews.filter((r) => !r.published).slice(0, 5);
  if (!pending.length) {
    reviewBox.innerHTML = `<div class="admin-empty">No reviews waiting to be published.</div>`;
    return;
  }
  reviewBox.innerHTML = pending.map((r) => `<article class="admin-review-preview">
      <strong>${escapeHtml(r.author_name)}</strong>
      <span>${escapeHtml(String(r.rating || 5))} / 5</span>
      <p>${escapeHtml(r.quote)}</p>
    </article>`).join("");
}

async function loadRequests(client) {
  const body = document.getElementById("requests-body");
  body.innerHTML = `<tr><td colspan="7" class="admin-empty">Loading requests...</td></tr>`;

  const { data, error } = await client
    .from("requests")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    body.innerHTML = `<tr><td colspan="7" class="admin-empty">Couldn't load requests: ${escapeHtml(error.message)}</td></tr>`;
    return;
  }

  allRequests = data || [];
  renderRequests(client);
  renderOverview();
}

function matchesSearch(r) {
  if (!searchQuery) return true;
  const hay = [
    r.name, r.phone, r.email, r.location, r.request_details,
    r.category, r.quantity, r.status,
  ].join(" ").toLowerCase();
  return hay.includes(searchQuery);
}

function renderRequests(client) {
  const body = document.getElementById("requests-body");
  const note = document.getElementById("admin-note");
  const rows = allRequests.filter((r) => {
    const statusOk = activeFilter === "All" || (r.status || "New") === activeFilter;
    return statusOk && matchesSearch(r);
  });

  if (!rows.length) {
    body.innerHTML = `<tr><td colspan="7"><div class="admin-empty">
      <span class="code">MW · NO ENTRIES</span>
      ${activeFilter === "All" && !searchQuery ? "No requests yet. They'll appear here the moment someone submits the form." : "No requests match this filter."}
    </div></td></tr>`;
    note.textContent = "";
    return;
  }

  body.innerHTML = rows.map(rowHtml).join("");
  note.textContent = `Showing ${rows.length} of ${allRequests.length} request${allRequests.length === 1 ? "" : "s"}.`;

  body.querySelectorAll("select[data-id]").forEach((select) => {
    select.addEventListener("change", async () => {
      const id = select.dataset.id;
      const previous = select.dataset.current;
      select.disabled = true;

      const { error } = await client.from("requests").update({ status: select.value }).eq("id", id);

      select.disabled = false;

      if (error) {
        select.value = previous;
        alert(`Couldn't update status: ${error.message}`);
        return;
      }
      select.dataset.current = select.value;
      const record = allRequests.find((r) => r.id === id);
      if (record) record.status = select.value;
      const pill = select.closest("td").querySelector(".status-pill");
      if (pill) {
        pill.className = `status-pill ${select.value.toLowerCase()}`;
        pill.textContent = select.value;
      }
      renderOverview();
    });
  });
}

function rowHtml(r) {
  const status = r.status || "New";
  const waLink = whatsappLink(r.phone, r.name);
  const options = STATUSES.map(
    (s) => `<option${s === status ? " selected" : ""}>${s}</option>`
  ).join("");

  return `<tr>
    <td class="cell-when">${formatDate(r.created_at)}</td>
    <td>
      <strong>${escapeHtml(r.name)}</strong><br>
      <span class="cell-when">${escapeHtml(r.phone || "")}</span>
      ${r.email ? `<br><span class="cell-when">${escapeHtml(r.email)}</span>` : ""}
    </td>
    <td>${escapeHtml(r.location) || '<span class="muted">—</span>'}</td>
    <td class="cell-details">
      ${escapeHtml(r.category) ? `<span class="status-pill">${escapeHtml(r.category)}</span><br>` : ""}
      ${escapeHtml(r.request_details)}
      ${r.photo_url ? `<br><a href="${escapeAttr(r.photo_url)}" target="_blank" rel="noopener">Photo</a>` : ""}
      ${referenceHtml(r.reference_url)}
    </td>
    <td>${r.quantity ? escapeHtml(r.quantity) : (r.budget_range ? "GH₵" + escapeHtml(r.budget_range) : '<span class="muted">—</span>')}</td>
    <td>
      <span class="status-pill ${status.toLowerCase()}">${escapeHtml(status)}</span>
      <select data-id="${escapeAttr(r.id)}" data-current="${escapeAttr(status)}">${options}</select>
    </td>
    <td>
      <div class="row-actions">
        ${waLink ? `<a href="${escapeAttr(waLink)}" target="_blank" rel="noopener">Reply on WhatsApp</a>` : '<span class="muted">No number</span>'}
      </div>
    </td>
  </tr>`;
}

/**
 * Customers paste whatever they have into the reference field, so
 * only render it as a clickable link when it's a real http(s) URL.
 */
function referenceHtml(value) {
  if (!value) return "";
  const raw = String(value).trim();
  let url;
  try {
    url = new URL(raw);
  } catch {
    return `<br><span class="muted">Reference: ${escapeHtml(raw)}</span>`;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return `<br><span class="muted">Reference: ${escapeHtml(raw)}</span>`;
  }
  return `<br><a href="${escapeAttr(url.href)}" target="_blank" rel="noopener noreferrer">Reference link</a>`;
}

/**
 * Ghanaian numbers get typed as 0XX XXX XXXX locally; wa.me needs
 * them in international form (233XXXXXXXXX) with no punctuation.
 */
function whatsappLink(phone, name) {
  if (!phone) return null;
  let digits = String(phone).replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("0")) digits = "233" + digits.slice(1);
  else if (!digits.startsWith("233") && digits.length === 9) digits = "233" + digits;
  if (digits.length < 11) return null;

  const greeting = `Hello ${name || "there"}, this is Mwinbarka Imports following up on your import request.`;
  return `https://wa.me/${digits}?text=${encodeURIComponent(greeting)}`;
}

function formatDate(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
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

async function uploadMedia(client, file, folder) {
  const safeName = file.name.replace(/[^\w.\-]+/g, "-");
  const path = `${folder}/${Date.now()}-${safeName}`;
  const { error } = await client.storage.from("media").upload(path, file, {
    contentType: file.type || undefined,
    upsert: false,
  });
  if (error) throw error;
  const { data } = client.storage.from("media").getPublicUrl(path);
  return data.publicUrl;
}

async function loadCustomers(client) {
  const body = document.getElementById("customers-body");
  const note = document.getElementById("customers-note");
  if (!body) return;
  body.innerHTML = `<tr><td colspan="4" class="admin-empty">Loading customers...</td></tr>`;

  const { data, error } = await client
    .from("profiles")
    .select("id, full_name, phone, is_staff, created_at")
    .eq("is_staff", false)
    .order("created_at", { ascending: false });

  if (error) {
    body.innerHTML = `<tr><td colspan="4" class="admin-empty">Couldn't load customers: ${escapeHtml(error.message)}</td></tr>`;
    return;
  }

  allCustomers = data || [];
  if (!allCustomers.length) {
    body.innerHTML = `<tr><td colspan="4"><div class="admin-empty"><span class="code">MW · NO CUSTOMERS</span>No customer accounts yet. Guests can still send orders without signing up.</div></td></tr>`;
    if (note) note.textContent = "";
    renderOverview();
    return;
  }

  const counts = {};
  allRequests.forEach((r) => {
    if (r.user_id) counts[r.user_id] = (counts[r.user_id] || 0) + 1;
  });

  body.innerHTML = allCustomers.map((c) => `<tr>
    <td class="cell-when">${formatDate(c.created_at)}</td>
    <td><strong>${escapeHtml(c.full_name) || '<span class="muted">—</span>'}</strong></td>
    <td>${escapeHtml(c.phone) || '<span class="muted">—</span>'}</td>
    <td>${counts[c.id] || 0}</td>
  </tr>`).join("");
  if (note) note.textContent = `${allCustomers.length} customer account${allCustomers.length === 1 ? "" : "s"}.`;
  renderOverview();
}

async function loadProducts(client) {
  const body = document.getElementById("products-body");
  body.innerHTML = `<tr><td colspan="5" class="admin-empty">Loading products...</td></tr>`;

  const { data, error } = await client
    .from("products")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    body.innerHTML = `<tr><td colspan="5" class="admin-empty">Couldn't load products: ${escapeHtml(error.message)}</td></tr>`;
    return;
  }

  allProducts = data || [];
  renderOverview();

  if (!data.length) {
    body.innerHTML = `<tr><td colspan="5"><div class="admin-empty"><span class="code">MW · NO PRODUCTS</span>No products yet. Add one above.</div></td></tr>`;
    return;
  }

  body.innerHTML = data.map((p) => `<tr>
    <td>${p.image_url ? `<img src="${escapeAttr(p.image_url)}" alt="" class="admin-thumb">` : '<span class="muted">—</span>'}</td>
    <td>
      <strong>${escapeHtml(p.name)}</strong>
      ${p.description ? `<br><span class="muted">${escapeHtml(p.description)}</span>` : ""}
    </td>
    <td>${escapeHtml(p.category) || '<span class="muted">—</span>'}</td>
    <td>${p.price ? "GH₵" + escapeHtml(p.price) : '<span class="muted">—</span>'}</td>
    <td>
      <div class="row-actions">
        <button type="button" class="chip" data-delete-product="${escapeAttr(p.id)}">Delete</button>
      </div>
    </td>
  </tr>`).join("");

  body.querySelectorAll("[data-delete-product]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!confirm("Delete this product?")) return;
      const { error } = await client.from("products").delete().eq("id", btn.dataset.deleteProduct);
      if (error) {
        alert(`Couldn't delete: ${error.message}`);
        return;
      }
      await loadProducts(client);
    });
  });
}

async function handleProductSubmit(e, client) {
  e.preventDefault();
  const form = e.target;
  const statusEl = document.getElementById("product-status");
  const btn = form.querySelector('button[type="submit"]');
  const name = form.elements.name.value.trim();
  const category = form.elements.category.value.trim();
  if (!name) {
    statusEl.className = "form-status error";
    statusEl.textContent = "Give the product a name.";
    return;
  }
  if (!category) {
    statusEl.className = "form-status error";
    statusEl.textContent = "Pick a category so it can show on the homepage.";
    return;
  }

  btn.disabled = true;
  try {
    let imageUrl = null;
    const file = form.elements.image.files[0];
    if (file) imageUrl = await uploadMedia(client, file, "products");

    const { error } = await client.from("products").insert([{
      name,
      description: form.elements.description.value.trim() || null,
      price: form.elements.price.value.trim() || null,
      category,
      image_url: imageUrl,
    }]);
    if (error) throw error;

    form.reset();
    statusEl.className = "form-status success";
    statusEl.textContent = "Product saved.";
    await loadProducts(client);
  } catch (err) {
    statusEl.className = "form-status error";
    statusEl.textContent = err.message || "Couldn't save the product.";
  }
  btn.disabled = false;
}

async function loadReviews(client) {
  const body = document.getElementById("reviews-body");
  if (!body) return;
  body.innerHTML = `<tr><td colspan="5" class="admin-empty">Loading reviews...</td></tr>`;

  const { data, error } = await client
    .from("reviews")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    body.innerHTML = `<tr><td colspan="5" class="admin-empty">Couldn't load reviews: ${escapeHtml(error.message)}</td></tr>`;
    return;
  }

  allReviews = data || [];
  renderOverview();

  if (!data.length) {
    body.innerHTML = `<tr><td colspan="5"><div class="admin-empty"><span class="code">MW · NO REVIEWS</span>No reviews yet.</div></td></tr>`;
    return;
  }

  body.innerHTML = data.map((r) => `<tr>
    <td>
      <strong>${escapeHtml(r.author_name)}</strong>
      ${r.location ? `<br><span class="muted">${escapeHtml(r.location)}</span>` : ""}
    </td>
    <td>${escapeHtml(String(r.rating || 5))} / 5</td>
    <td class="cell-details">${escapeHtml(r.quote)}</td>
    <td>${r.published ? '<span class="status-pill confirmed">Published</span>' : '<span class="status-pill new">Pending</span>'}</td>
    <td>
      <div class="row-actions">
        ${r.published
          ? `<button type="button" class="chip" data-hide-review="${escapeAttr(r.id)}">Hide</button>`
          : `<button type="button" class="chip" data-publish-review="${escapeAttr(r.id)}">Publish</button>`}
        <button type="button" class="chip" data-delete-review="${escapeAttr(r.id)}">Delete</button>
      </div>
    </td>
  </tr>`).join("");

  body.querySelectorAll("[data-publish-review]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const { error: err } = await client.from("reviews").update({ published: true }).eq("id", btn.dataset.publishReview);
      if (err) { alert(err.message); return; }
      await loadReviews(client);
    });
  });
  body.querySelectorAll("[data-hide-review]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const { error: err } = await client.from("reviews").update({ published: false }).eq("id", btn.dataset.hideReview);
      if (err) { alert(err.message); return; }
      await loadReviews(client);
    });
  });
  body.querySelectorAll("[data-delete-review]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!confirm("Delete this review?")) return;
      const { error: err } = await client.from("reviews").delete().eq("id", btn.dataset.deleteReview);
      if (err) { alert(err.message); return; }
      await loadReviews(client);
    });
  });
}

async function handleReviewAdminSubmit(e, client) {
  e.preventDefault();
  const form = e.target;
  const statusEl = document.getElementById("review-admin-status");
  const btn = form.querySelector('button[type="submit"]');
  const author_name = form.elements.author_name.value.trim();
  const quote = form.elements.quote.value.trim();
  const rating = Number(form.elements.rating.value) || 5;
  if (!author_name || !quote) {
    statusEl.className = "form-status error";
    statusEl.textContent = "Name and review are required.";
    return;
  }
  btn.disabled = true;
  try {
    const { error } = await client.from("reviews").insert([{
      author_name,
      location: form.elements.location.value.trim() || null,
      rating,
      quote,
      published: true,
    }]);
    if (error) throw error;
    form.reset();
    statusEl.className = "form-status success";
    statusEl.textContent = "Review published.";
    await loadReviews(client);
  } catch (err) {
    statusEl.className = "form-status error";
    statusEl.textContent = err.message || "Couldn't save the review.";
  }
  btn.disabled = false;
}

async function loadSettings(client) {
  const { data, error } = await client.from("site_settings").select("*").eq("id", 1).maybeSingle();
  if (error || !data) return;
  const form = document.getElementById("settings-form");
  ["whatsapp_channel_url", "whatsapp_url", "facebook_url", "instagram_url", "tiktok_url", "advert_video_url"].forEach((key) => {
    if (form.elements[key]) form.elements[key].value = data[key] || "";
  });
}

async function handleSettingsSubmit(e, client) {
  e.preventDefault();
  const form = e.target;
  const statusEl = document.getElementById("settings-status");
  const btn = form.querySelector('button[type="submit"]');
  btn.disabled = true;

  try {
    let videoUrl = form.elements.advert_video_url.value.trim() || null;
    const file = form.elements.advert_video_file.files[0];
    if (file) videoUrl = await uploadMedia(client, file, "adverts");

    const { error } = await client.from("site_settings").update({
      whatsapp_channel_url: form.elements.whatsapp_channel_url.value.trim() || null,
      whatsapp_url: form.elements.whatsapp_url.value.trim() || null,
      facebook_url: form.elements.facebook_url.value.trim() || null,
      instagram_url: form.elements.instagram_url.value.trim() || null,
      tiktok_url: form.elements.tiktok_url.value.trim() || null,
      advert_video_url: videoUrl,
      updated_at: new Date().toISOString(),
    }).eq("id", 1);
    if (error) throw error;

    if (videoUrl) form.elements.advert_video_url.value = videoUrl;
    form.elements.advert_video_file.value = "";
    statusEl.className = "form-status success";
    statusEl.textContent = "Settings saved. The website will use these links and this video.";
  } catch (err) {
    statusEl.className = "form-status error";
    statusEl.textContent = err.message || "Couldn't save settings.";
  }
  btn.disabled = false;
}
