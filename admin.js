// ============================================================
// MWINBARKA IMPORTS — admin request desk
// ============================================================
// Reads and updates the "requests" table. Access is enforced by
// Supabase row level security (see supabase/schema.sql): the anon
// key can only INSERT, so hiding these panels is convenience —
// the database is what actually keeps the data private.
// ============================================================

const STATUSES = ["New", "Contacted", "Quoted", "Confirmed", "Closed"];

let activeFilter = "All";
let allRequests = [];

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
    loginSection.style.display = "none";
    dashboard.style.display = "block";
    signOutBtn.style.display = "inline-flex";
    await loadRequests(client);
    await loadProducts(client);
    await loadSettings(client);
  };

  const showSignedOut = () => {
    loginSection.style.display = "block";
    dashboard.style.display = "none";
    signOutBtn.style.display = "none";
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

  document.getElementById("admin-tabs").addEventListener("click", (e) => {
    const chip = e.target.closest("[data-tab]");
    if (!chip) return;
    document.querySelectorAll("#admin-tabs .chip").forEach((c) => c.classList.remove("active"));
    chip.classList.add("active");
    document.querySelectorAll(".admin-panel").forEach((panel) => {
      panel.hidden = panel.id !== "tab-" + chip.dataset.tab;
    });
  });

  document.getElementById("product-form").addEventListener("submit", (e) => handleProductSubmit(e, client));
  document.getElementById("settings-form").addEventListener("submit", (e) => handleSettingsSubmit(e, client));
});

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
}

function renderRequests(client) {
  const body = document.getElementById("requests-body");
  const note = document.getElementById("admin-note");
  const rows = activeFilter === "All"
    ? allRequests
    : allRequests.filter((r) => (r.status || "New") === activeFilter);

  if (!rows.length) {
    body.innerHTML = `<tr><td colspan="7"><div class="admin-empty">
      <span class="code">MW · NO ENTRIES</span>
      ${activeFilter === "All" ? "No requests yet. They'll appear here the moment someone submits the form." : `No requests with status "${escapeHtml(activeFilter)}".`}
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
