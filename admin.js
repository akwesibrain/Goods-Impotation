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
  overview: ["Desk", "Dashboard"],
  requests: ["Leads", "Orders"],
  customers: ["Accounts", "Customers"],
  sms: ["SMS", "SMS"],
  products: ["Catalog", "Products"],
  reviews: ["Reviews", "Reviews"],
  settings: ["Site", "Settings"],
};

const SHIPMENT_STAGES = [
  { id: "", label: "Not started" },
  { id: "sourcing", label: "Sourcing" },
  { id: "warehouse", label: "Warehouse" },
  { id: "vessel", label: "On the vessel" },
  { id: "tema", label: "Tema" },
  { id: "ready", label: "Ready for pickup" },
];
const OFFICIAL_LINE = "054 030 9637";

let activeFilter = "All";
let searchQuery = "";
let allRequests = [];
let allProducts = [];
let allReviews = [];
let allCustomers = [];
let allSmsMessages = [];
let allTemplates = [];
let deskSettings = {};
let smsKeySaved = false;
let selectedRequestId = null;
let adminClient = null;

document.addEventListener("DOMContentLoaded", () => {
  const client = window.getSupabaseClient && window.getSupabaseClient();
  adminClient = client;

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
    dashboard.classList.add("is-ready");
    if (signOutBtn) signOutBtn.style.display = "";
    const profile = window.getMyProfile ? await window.getMyProfile() : null;
    const staffLine = document.getElementById("admin-staff-email");
    const staffName = document.getElementById("admin-user-name");
    const staffAvatar = document.getElementById("admin-user-avatar");
    if (staffLine && profile) staffLine.textContent = profile.email || "Staff";
    if (staffName && profile) staffName.textContent = profile.full_name || "Staff";
    if (staffAvatar && profile) staffAvatar.textContent = initials(profile.full_name || profile.email || "MW");
    fillStaffLogin(profile);
    await Promise.all([
      loadRequests(client),
      loadProducts(client),
      loadReviews(client),
      loadCustomers(client),
      loadSettings(client),
      loadSmsSettings(client),
      loadSmsMessages(client),
      loadSmsTemplates(client),
      loadDeskSettings(client),
    ]);
    fillSmsRecipients();
    if (sessionStorage.getItem("mwinbarka_staff_email_changed")) {
      sessionStorage.removeItem("mwinbarka_staff_email_changed");
      showTab("settings");
      const statusEl = document.getElementById("staff-email-status");
      if (statusEl) {
        statusEl.className = "form-status success";
        statusEl.textContent = "Login email confirmed. Use this new email the next time you sign in.";
      }
    } else {
      showTab(tabFromHash());
    }
  };

  const showSignedOut = () => {
    closeAdminMenu();
    loginSection.style.display = "flex";
    dashboard.style.display = "none";
    dashboard.classList.remove("is-ready");
    if (signOutBtn) signOutBtn.style.display = "none";
  };

  if (/type=email_change/.test(location.hash || "")) {
    sessionStorage.setItem("mwinbarka_staff_email_changed", "1");
  }

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
    closeAdminMenu();
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
      const shell = document.getElementById("admin-dashboard");
      setAdminMenuOpen(shell && !shell.classList.contains("nav-open"));
    });
  }
  document.getElementById("admin-nav-scrim")?.addEventListener("click", closeAdminMenu);

  document.getElementById("product-form").addEventListener("submit", (e) => handleProductSubmit(e, client));
  document.getElementById("review-admin-form").addEventListener("submit", (e) => handleReviewAdminSubmit(e, client));
  document.getElementById("settings-form").addEventListener("submit", (e) => handleSettingsSubmit(e, client));
  document.getElementById("staff-email-form")?.addEventListener("submit", (e) => handleStaffEmailSubmit(e, client));
  document.getElementById("staff-password-form")?.addEventListener("submit", (e) => handleStaffPasswordSubmit(e, client));
  document.getElementById("sms-settings-form").addEventListener("submit", (e) => handleSmsSettingsSubmit(e, client));
  document.getElementById("sms-send-form").addEventListener("submit", (e) => handleSmsSend(e, client));
  document.getElementById("sms-broadcast-form")?.addEventListener("submit", (e) => handleSmsBroadcast(e, client));
  document.getElementById("desk-settings-form")?.addEventListener("submit", (e) => handleDeskSettingsSubmit(e, client));
  document.getElementById("sms-template-form")?.addEventListener("submit", (e) => handleSmsTemplateSubmit(e, client));

  dashboard.addEventListener("click", (e) => {
    const closeBtn = e.target.closest("[data-close-detail]");
    if (closeBtn) {
      closeDetail();
      return;
    }
    const smsBtn = e.target.closest("[data-sms-phone]");
    if (smsBtn) {
      openSmsComposer(smsBtn.dataset.smsPhone, smsBtn.dataset.smsName || "");
      return;
    }
    const row = e.target.closest("[data-request-id]");
    if (row && adminClient) {
      showTab("requests");
      openDetail(row.dataset.requestId, adminClient);
    }
  });

  const provider = document.getElementById("sms-provider");
  if (provider) provider.addEventListener("change", updateSmsProviderLabels);

  const recipient = document.getElementById("sms-recipient");
  if (recipient) {
    recipient.addEventListener("change", () => {
      const option = recipient.selectedOptions[0];
      if (!option || !option.value) return;
      document.getElementById("sms-phone").value = option.value;
      document.getElementById("sms-name").value = option.dataset.name || "";
    });
  }

  document.getElementById("sms-templates")?.addEventListener("click", (e) => {
    const chip = e.target.closest("[data-sms-template]");
    if (!chip) return;
    const box = document.getElementById("sms-message");
    box.value = fillTemplate(chip.dataset.smsTemplate, {
      name: (document.getElementById("sms-name")?.value.trim()) || "there",
      business: "Mwinbarka Imports",
      line: OFFICIAL_LINE,
    });
    updateSmsCount();
    box.focus();
  });

  document.getElementById("sms-message")?.addEventListener("input", updateSmsCount);
  document.getElementById("sms-broadcast-message")?.addEventListener("input", updateBroadcastCount);

  document.getElementById("sms-broadcast-templates")?.addEventListener("click", (e) => {
    const chip = e.target.closest("[data-sms-broadcast]");
    if (!chip) return;
    const box = document.getElementById("sms-broadcast-message");
    box.value = chip.dataset.smsBroadcast;
    updateBroadcastCount();
    box.focus();
  });

  document.getElementById("sms-select-all")?.addEventListener("click", () => setAudienceChecked(true));
  document.getElementById("sms-clear-all")?.addEventListener("click", () => setAudienceChecked(false));
  document.getElementById("sms-audience")?.addEventListener("change", updateAudienceCount);
});

function tabFromHash() {
  const name = (location.hash || "#overview").replace("#", "");
  if (!name || name.includes("=") || name.includes("&")) return "overview";
  return TAB_TITLES[name] ? name : "overview";
}

function prefersReducedMotion() {
  return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function replayAdminAnim(el) {
  if (!el) return;
  el.classList.remove("is-animating");
  void el.offsetWidth;
  el.classList.add("is-animating");
}

function showTab(name) {
  const tab = TAB_TITLES[name] ? name : "overview";
  document.querySelectorAll("#admin-tabs [data-tab]").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tab === tab);
  });
  document.querySelectorAll(".admin-panel").forEach((panel) => {
    const on = panel.id === "tab-" + tab;
    panel.hidden = !on;
    if (on) replayAdminAnim(panel);
  });
  const titles = TAB_TITLES[tab];
  const title = document.getElementById("admin-page-title");
  if (title) {
    title.textContent = titles[1];
    replayAdminAnim(title);
  }
  if (location.hash.replace("#", "") !== tab) {
    history.replaceState(null, "", "#" + tab);
  }
  if (tab !== "requests") closeDetail();
}

function setAdminMenuOpen(open) {
  const shell = document.getElementById("admin-dashboard");
  const btn = document.getElementById("admin-menu-toggle");
  if (shell) shell.classList.toggle("nav-open", !!open);
  if (btn) {
    btn.setAttribute("aria-expanded", open ? "true" : "false");
    btn.setAttribute("aria-label", open ? "Close menu" : "Open menu");
  }
  document.body.classList.toggle("admin-nav-open", !!open);
}

function closeAdminMenu() {
  setAdminMenuOpen(false);
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
    ["SMS sent", allSmsMessages.filter((m) => m.status === "sent").length],
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
      return `<tr class="admin-order-row" data-request-id="${escapeAttr(r.id)}">
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
  } else {
    reviewBox.innerHTML = pending.map((r) => `<article class="admin-review-preview">
      <strong>${escapeHtml(r.author_name)}</strong>
      <span>${escapeHtml(String(r.rating || 5))} / 5</span>
      <p>${escapeHtml(r.quote)}</p>
    </article>`).join("");
  }
}

async function loadRequests(client) {
  const body = document.getElementById("requests-body");
  body.innerHTML = `<tr><td colspan="5" class="admin-empty">Loading orders...</td></tr>`;

  const { data, error } = await client
    .from("requests")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    body.innerHTML = `<tr><td colspan="5" class="admin-empty">Couldn't load orders: ${escapeHtml(error.message)}</td></tr>`;
    return;
  }

  allRequests = data || [];
  renderRequests(client);
  fillSmsRecipients();
  renderOverview();
}

function matchesSearch(r) {
  if (!searchQuery) return true;
  const hay = [
    r.name, r.phone, r.email, r.location, r.request_details,
    r.category, r.quantity, r.status, r.shipment_status,
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
    body.innerHTML = `<tr><td colspan="5"><div class="admin-empty">
      ${activeFilter === "All" && !searchQuery ? "No orders yet. They’ll appear here when someone submits the form." : "No orders match this filter."}
    </div></td></tr>`;
    note.textContent = "";
    return;
  }

  body.innerHTML = rows.map(rowHtml).join("");
  note.textContent = `${rows.length} of ${allRequests.length} order${allRequests.length === 1 ? "" : "s"}`;

  if (selectedRequestId) {
    const still = rows.find((r) => r.id === selectedRequestId);
    if (still) openDetail(selectedRequestId, client);
    else closeDetail();
  }
}

function rowHtml(r) {
  const status = r.status || "New";
  const selected = r.id === selectedRequestId ? " is-selected" : "";
  return `<tr class="admin-order-row${selected}" data-request-id="${escapeAttr(r.id)}">
    <td class="cell-when">#${escapeHtml(shortId(r.id))}</td>
    <td>
      <div class="admin-person">
        <span class="admin-avatar">${escapeHtml(initials(r.name))}</span>
        <span>
          <strong>${escapeHtml(r.name)}</strong>
          <small>${escapeHtml(r.phone || r.email || "")}</small>
        </span>
      </div>
    </td>
    <td><span class="status-pill ${status.toLowerCase()}">${escapeHtml(status)}</span></td>
    <td>${r.quantity ? escapeHtml(r.quantity) : (r.budget_range ? "GH₵" + escapeHtml(r.budget_range) : "—")}</td>
    <td class="cell-when">${formatShortDate(r.created_at)}</td>
  </tr>`;
}

function shortId(id) {
  return String(id || "").replace(/-/g, "").slice(0, 6).toUpperCase();
}

function initials(name) {
  const parts = String(name || "MW").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "MW";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

let detailLeaveTimer = null;

function closeDetail() {
  selectedRequestId = null;
  const panel = document.getElementById("admin-detail");
  document.querySelectorAll(".admin-order-row.is-selected").forEach((row) => row.classList.remove("is-selected"));
  if (!panel || panel.hidden) return;
  clearTimeout(detailLeaveTimer);
  if (prefersReducedMotion()) {
    panel.hidden = true;
    panel.classList.remove("is-leaving");
    return;
  }
  panel.classList.add("is-leaving");
  detailLeaveTimer = setTimeout(() => {
    panel.hidden = true;
    panel.classList.remove("is-leaving");
  }, 240);
}

function revealDetail(panel, inner) {
  clearTimeout(detailLeaveTimer);
  const wasHidden = panel.hidden;
  panel.classList.remove("is-leaving");
  panel.hidden = false;
  if (wasHidden) replayAdminAnim(panel);
  if (inner) {
    inner.classList.remove("is-swap");
    void inner.offsetWidth;
    inner.classList.add("is-swap");
  }
}

function openDetail(id, client) {
  const record = allRequests.find((r) => r.id === id);
  const panel = document.getElementById("admin-detail");
  const inner = document.getElementById("admin-detail-inner");
  if (!record || !panel || !inner) return;
  selectedRequestId = id;
  revealDetail(panel, inner);
  document.querySelectorAll(".admin-order-row").forEach((row) => {
    row.classList.toggle("is-selected", row.dataset.requestId === id);
  });
  inner.innerHTML = detailHtml(record);
  const statusSelect = inner.querySelector("[data-detail-status]");
  if (statusSelect) {
    statusSelect.addEventListener("change", async () => {
      const previous = record.status || "New";
      statusSelect.disabled = true;
      const { error } = await client.from("requests").update({ status: statusSelect.value }).eq("id", record.id);
      statusSelect.disabled = false;
      if (error) {
        statusSelect.value = previous;
        alert(`Couldn't update status: ${error.message}`);
        return;
      }
      record.status = statusSelect.value;
      renderRequests(client);
      renderOverview();
      await maybeAutoSms(client, record, "order:" + record.status);
      openDetail(record.id, client);
    });
  }
  const smsForm = inner.querySelector("[data-detail-sms]");
  if (smsForm) {
    smsForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const statusEl = inner.querySelector("[data-detail-sms-status]");
      const message = fillTemplate(smsForm.elements.message.value.trim(), templateVarsForOrder(record));
      if (!message || !record.phone) return;
      statusEl.className = "form-status";
      statusEl.textContent = "Sending…";
      const result = await sendSmsMessage(client, {
        phone: record.phone,
        name: record.name,
        message,
      });
      statusEl.className = `form-status ${result.ok ? "success" : "error"}`;
      statusEl.textContent = result.ok ? "SMS sent." : result.error;
      if (result.ok) smsForm.reset();
    });
  }
  const shipSelect = inner.querySelector("[data-detail-shipment]");
  if (shipSelect) {
    shipSelect.addEventListener("change", async () => {
      const previous = record.shipment_status || "";
      shipSelect.disabled = true;
      const { error } = await client.from("requests").update({ shipment_status: shipSelect.value }).eq("id", record.id);
      shipSelect.disabled = false;
      if (error) {
        shipSelect.value = previous;
        alert(`Couldn't update shipment: ${error.message}`);
        return;
      }
      record.shipment_status = shipSelect.value;
      if (shipSelect.value) await maybeAutoSms(client, record, "shipment:" + shipSelect.value);
    });
  }
}

function detailHtml(r) {
  const status = r.status || "New";
  const waLink = whatsappLink(r.phone, r.name);
  const tel = telLink(r.phone);
  const options = STATUSES.map(
    (s) => `<option${s === status ? " selected" : ""}>${s}</option>`
  ).join("");
  return `
    <div class="admin-detail-head">
      <div>
        <h2>#${escapeHtml(shortId(r.id))}</h2>
        <span class="status-pill ${status.toLowerCase()}">${escapeHtml(status)}</span>
      </div>
      <button type="button" class="admin-detail-close" data-close-detail aria-label="Close">×</button>
    </div>
    <div class="admin-detail-profile">
      <span class="admin-avatar">${escapeHtml(initials(r.name))}</span>
      <h3>${escapeHtml(r.name)}</h3>
      <p>${escapeHtml(r.location || "Ghana")}</p>
    </div>
    <div class="admin-contact-row">
      ${r.email ? `<a class="admin-contact-btn" href="mailto:${escapeAttr(r.email)}" title="Email">
        <svg viewBox="0 0 24 24"><path d="M4 6h16v12H4z"/><path d="m4 7 8 6 8-6"/></svg>
      </a>` : ""}
      ${tel ? `<a class="admin-contact-btn" href="${escapeAttr(tel)}" title="Call">
        <svg viewBox="0 0 24 24"><path d="M6.5 4h3l1.5 4-2 1.5a12 12 0 0 0 5 5L15.5 13l4 1.5v3A14 14 0 0 1 6.5 4Z"/></svg>
      </a>` : ""}
      ${r.phone ? `<button type="button" class="admin-contact-btn" data-sms-phone="${escapeAttr(r.phone)}" data-sms-name="${escapeAttr(r.name || "")}" title="SMS">
        <svg viewBox="0 0 24 24"><path d="M5 5h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H9l-4 3v-3H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z"/></svg>
      </button>` : ""}
    </div>
    <dl class="admin-detail-meta">
      <div>
        <dt>Request</dt>
        <dd>${escapeHtml(r.request_details)}</dd>
      </div>
      ${r.category ? `<div><dt>Category</dt><dd>${escapeHtml(r.category)}</dd></div>` : ""}
      ${r.quantity ? `<div><dt>Quantity</dt><dd>${escapeHtml(r.quantity)}</dd></div>` : ""}
      ${r.phone ? `<div><dt>Phone</dt><dd>${escapeHtml(r.phone)}</dd></div>` : ""}
      ${r.email ? `<div><dt>Email</dt><dd>${escapeHtml(r.email)}</dd></div>` : ""}
      <div>
        <dt>Received</dt>
        <dd>${formatDate(r.created_at)}</dd>
      </div>
      <div>
        <dt>Status</dt>
        <dd><select data-detail-status>${options}</select></dd>
      </div>
      <div>
        <dt>Shipment</dt>
        <dd><select data-detail-shipment>${SHIPMENT_STAGES.map((s) =>
          `<option value="${escapeAttr(s.id)}"${(r.shipment_status || "") === s.id ? " selected" : ""}>${escapeHtml(s.label)}</option>`
        ).join("")}</select></dd>
      </div>
    </dl>
    ${r.photo_url ? `<img class="admin-detail-photo" src="${escapeAttr(r.photo_url)}" alt="Order photo">` : ""}
    ${referenceHtml(r.reference_url)}
    ${r.phone ? `<form class="admin-detail-sms" data-detail-sms>
      <label for="detail-sms-message">Send SMS</label>
      <textarea id="detail-sms-message" name="message" maxlength="480" placeholder="Write a text to ${escapeAttr(r.name)}…"></textarea>
      <button type="submit" class="btn btn-gold" style="width:100%; justify-content:center; margin-top:0.6rem;">Send SMS</button>
      <div class="form-status" data-detail-sms-status></div>
    </form>` : ""}
    <div class="admin-detail-actions">
      ${waLink ? `<a class="btn btn-gold" href="${escapeAttr(waLink)}" target="_blank" rel="noopener">Chat</a>` : ""}
    </div>
  `;
}

function telLink(phone) {
  if (!phone) return null;
  let digits = String(phone).replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("0")) digits = "233" + digits.slice(1);
  else if (!digits.startsWith("233") && digits.length === 9) digits = "233" + digits;
  if (digits.length < 11) return null;
  return `tel:+${digits}`;
}

function formatShortDate(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
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
  body.innerHTML = `<tr><td colspan="5" class="admin-empty">Loading customers...</td></tr>`;

  const { data, error } = await client
    .from("profiles")
    .select("id, full_name, phone, is_staff, created_at")
    .eq("is_staff", false)
    .order("created_at", { ascending: false });

  if (error) {
    body.innerHTML = `<tr><td colspan="5" class="admin-empty">Couldn't load customers: ${escapeHtml(error.message)}</td></tr>`;
    return;
  }

  allCustomers = data || [];
  if (!allCustomers.length) {
    body.innerHTML = `<tr><td colspan="5"><div class="admin-empty"><span class="code">MW · NO CUSTOMERS</span>No customer accounts yet. Guests can still send orders without signing up.</div></td></tr>`;
    if (note) note.textContent = "";
    fillSmsRecipients();
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
    <td>
      <div class="row-actions">
        ${c.phone ? `<button type="button" class="chip" data-sms-phone="${escapeAttr(c.phone)}" data-sms-name="${escapeAttr(c.full_name || "")}">Send SMS</button>` : '<span class="muted">No number</span>'}
      </div>
    </td>
  </tr>`).join("");
  if (note) note.textContent = `${allCustomers.length} customer account${allCustomers.length === 1 ? "" : "s"}.`;
  fillSmsRecipients();
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

function fillStaffLogin(profile) {
  const emailEl = document.getElementById("staff-current-email");
  if (emailEl) emailEl.value = (profile && profile.email) || "";
}

function friendlyAuthError(err) {
  const raw = String((err && err.message) || err || "");
  const text = raw.toLowerCase();
  if (text.includes("invalid login") || text.includes("invalid credentials")) {
    return "Current password is wrong.";
  }
  if (text.includes("already registered") || text.includes("already been registered")) {
    return "That email is already in use.";
  }
  if (text.includes("rate") || text.includes("too many")) {
    return "Too many tries. Wait a minute, then try again.";
  }
  if (text.includes("should be different")) {
    return "Pick a password that is not the current one.";
  }
  return raw || "Couldn't update the login details.";
}

async function handleStaffEmailSubmit(e, client) {
  e.preventDefault();
  const form = e.target;
  const statusEl = document.getElementById("staff-email-status");
  const btn = form.querySelector('button[type="submit"]');
  const next = form.elements.new_email.value.trim().toLowerCase();
  const confirmEmail = form.elements.confirm_email.value.trim().toLowerCase();
  const password = form.elements.password.value;
  if (!next || !confirmEmail || !password) {
    statusEl.className = "form-status error";
    statusEl.textContent = "Fill the new email, confirm it, and enter the current password.";
    return;
  }
  if (next !== confirmEmail) {
    statusEl.className = "form-status error";
    statusEl.textContent = "The two new email addresses do not match.";
    return;
  }
  btn.disabled = true;
  statusEl.className = "form-status";
  statusEl.textContent = "Saving…";
  try {
    if (!window.updateMyEmail) throw new Error("Account service is not connected yet.");
    await window.updateMyEmail({
      currentPassword: password,
      newEmail: next,
      emailRedirectTo: window.location.origin + window.location.pathname,
    });
    form.elements.password.value = "";
    form.elements.new_email.value = "";
    form.elements.confirm_email.value = "";
    statusEl.className = "form-status success";
    statusEl.textContent = `A confirm link was sent to ${next}. Open that inbox, tap the link, then sign in with the new email.`;
  } catch (err) {
    statusEl.className = "form-status error";
    statusEl.textContent = friendlyAuthError(err);
  }
  btn.disabled = false;
}

async function handleStaffPasswordSubmit(e, client) {
  e.preventDefault();
  const form = e.target;
  const statusEl = document.getElementById("staff-password-status");
  const btn = form.querySelector('button[type="submit"]');
  const currentPassword = form.elements.current_password.value;
  const newPassword = form.elements.new_password.value;
  const confirmPassword = form.elements.confirm_password.value;
  if (!currentPassword || !newPassword || !confirmPassword) {
    statusEl.className = "form-status error";
    statusEl.textContent = "Fill the current password and the new password twice.";
    return;
  }
  if (newPassword.length < 6) {
    statusEl.className = "form-status error";
    statusEl.textContent = "The new password must be at least 6 characters.";
    return;
  }
  if (newPassword !== confirmPassword) {
    statusEl.className = "form-status error";
    statusEl.textContent = "The two new passwords do not match.";
    return;
  }
  if (newPassword === currentPassword) {
    statusEl.className = "form-status error";
    statusEl.textContent = "Pick a password that is not the current one.";
    return;
  }
  btn.disabled = true;
  statusEl.className = "form-status";
  statusEl.textContent = "Saving…";
  try {
    if (!window.updateMyPassword) throw new Error("Account service is not connected yet.");
    await window.updateMyPassword({ currentPassword, newPassword });
    form.reset();
    statusEl.className = "form-status success";
    statusEl.textContent = "Password saved. Use the new password the next time you sign in.";
  } catch (err) {
    statusEl.className = "form-status error";
    statusEl.textContent = friendlyAuthError(err);
  }
  btn.disabled = false;
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

function updateSmsCount() {
  const box = document.getElementById("sms-message");
  const count = document.getElementById("sms-count");
  if (count && box) count.textContent = String(box.value.length);
}

function updateSmsProviderLabels() {
  const provider = document.getElementById("sms-provider")?.value || "txtconnect";
  const sidField = document.getElementById("sms-sid-field");
  const keyLabel = document.getElementById("sms-api-key-label");
  const keyHint = document.getElementById("sms-key-hint");
  const senderLabel = document.getElementById("sms-sender-label");
  const senderHint = document.getElementById("sms-sender-hint");
  const isTwilio = provider === "twilio";
  const isTxtConnect = provider === "txtconnect";
  if (sidField) sidField.hidden = !isTwilio;
  if (keyLabel) {
    keyLabel.textContent = isTwilio
      ? "Twilio Auth Token"
      : isTxtConnect
        ? "TxtConnect API key"
        : "Arkesel API key";
  }
  if (keyHint) {
    keyHint.textContent = isTwilio
      ? "Paste the Auth Token from Twilio. Leave blank to keep a saved token."
      : isTxtConnect
        ? "Copy the API key from TxtConnect (Campaigns → SMS API), then paste it here. Leave blank to keep the saved key."
        : "Get a key from Arkesel, then paste it here. Leave blank to keep the saved key.";
  }
  if (senderLabel) senderLabel.textContent = isTwilio ? "From number" : "Sender ID";
  if (senderHint) {
    senderHint.textContent = isTwilio
      ? "The Twilio number that will send the text, e.g. +233..."
      : isTxtConnect
        ? "Up to 11 letters. Request this name in TxtConnect first, then type the approved sender ID here."
        : "Up to 11 letters. Arkesel must approve this name before it will show on the customer’s phone.";
  }
}

function openSmsComposer(phone, name) {
  showTab("sms");
  closeAdminMenu();
  const phoneEl = document.getElementById("sms-phone");
  const nameEl = document.getElementById("sms-name");
  const recipient = document.getElementById("sms-recipient");
  if (phoneEl) phoneEl.value = phone || "";
  if (nameEl) nameEl.value = name || "";
  if (recipient) {
    const match = [...recipient.options].find((opt) => opt.value === phone);
    recipient.value = match ? phone : "";
  }
  document.getElementById("sms-message")?.focus();
}

function fillSmsRecipients() {
  const select = document.getElementById("sms-recipient");
  const audience = smsAudienceList();
  if (select) {
    const current = select.value;
    select.innerHTML = `<option value="">Choose a customer, or type a number below</option>` +
      audience.map(({ phone, name }) =>
        `<option value="${escapeAttr(phone)}" data-name="${escapeAttr(name)}">${escapeHtml(name)} · ${escapeHtml(phone)}</option>`
      ).join("");
    if (current && audience.some((item) => item.phone === current)) select.value = current;
  }
  fillSmsAudience(audience);
}

function smsPhoneKey(phone) {
  let digits = String(phone || "").replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("0")) digits = "233" + digits.slice(1);
  else if (!digits.startsWith("233") && digits.length === 9) digits = "233" + digits;
  return digits;
}

function smsAudienceList() {
  const seen = new Map();
  allCustomers.forEach((c) => {
    const key = smsPhoneKey(c.phone);
    if (key.length >= 12 && !seen.has(key)) {
      seen.set(key, { phone: c.phone, name: c.full_name || "Customer" });
    }
  });
  allRequests.forEach((r) => {
    const key = smsPhoneKey(r.phone);
    if (key.length >= 12 && !seen.has(key)) {
      seen.set(key, { phone: r.phone, name: r.name || "Customer" });
    }
  });
  return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
}

function fillSmsAudience(audience) {
  const box = document.getElementById("sms-audience");
  if (!box) return;
  const previously = new Set(
    [...box.querySelectorAll("input[type='checkbox']:checked")].map((el) => el.value)
  );
  if (!audience.length) {
    box.innerHTML = `<p class="sms-audience-empty">No customer phone numbers yet. They appear here after someone signs up or sends an order.</p>`;
    updateAudienceCount();
    return;
  }
  box.innerHTML = audience.map(({ phone, name }) => `<label class="sms-audience-row">
    <input type="checkbox" name="audience" value="${escapeAttr(phone)}" data-name="${escapeAttr(name)}"${previously.has(phone) ? " checked" : ""}>
    <span>
      <strong>${escapeHtml(name)}</strong>
      <small>${escapeHtml(phone)}</small>
    </span>
  </label>`).join("");
  updateAudienceCount();
}

function setAudienceChecked(checked) {
  document.querySelectorAll("#sms-audience input[type='checkbox']").forEach((el) => {
    el.checked = checked;
  });
  updateAudienceCount();
}

function selectedAudience() {
  return [...document.querySelectorAll("#sms-audience input[type='checkbox']:checked")].map((el) => ({
    phone: el.value,
    name: el.dataset.name || "Customer",
  }));
}

function updateAudienceCount() {
  const el = document.getElementById("sms-audience-count");
  if (!el) return;
  const total = document.querySelectorAll("#sms-audience input[type='checkbox']").length;
  const selected = selectedAudience().length;
  el.textContent = total
    ? `${selected} of ${total} selected`
    : "0 selected";
}

function updateBroadcastCount() {
  const box = document.getElementById("sms-broadcast-message");
  const count = document.getElementById("sms-broadcast-count");
  if (count && box) count.textContent = String(box.value.length);
}

async function handleSmsBroadcast(e, client) {
  e.preventDefault();
  const statusEl = document.getElementById("sms-broadcast-status");
  const btn = document.getElementById("sms-broadcast-submit");
  const message = document.getElementById("sms-broadcast-message")?.value.trim() || "";
  const people = selectedAudience();
  if (!people.length) {
    statusEl.className = "form-status error";
    statusEl.textContent = "Select at least one customer, or tap Select all.";
    return;
  }
  if (!message) {
    statusEl.className = "form-status error";
    statusEl.textContent = "Write the SMS first.";
    return;
  }
  const ok = window.confirm(
    `Send this SMS to ${people.length} customer${people.length === 1 ? "" : "s"}? This uses TxtConnect credit for each person.`
  );
  if (!ok) return;

  btn.disabled = true;
  document.getElementById("sms-select-all").disabled = true;
  document.getElementById("sms-clear-all").disabled = true;
  let sent = 0;
  const failed = [];
  for (let i = 0; i < people.length; i += 1) {
    const person = people[i];
    statusEl.className = "form-status";
    statusEl.textContent = `Sending ${i + 1} of ${people.length}…`;
    const result = await sendSmsMessage(client, {
      phone: person.phone,
      name: person.name,
      message,
      skipLogRefresh: true,
    });
    if (result.ok) sent += 1;
    else failed.push(`${person.name} (${person.phone}): ${result.error}`);
  }
  await loadSmsMessages(client);
  const box = document.getElementById("sms-broadcast-message");
  if (sent && failed.length === 0 && box) {
    box.value = "";
    updateBroadcastCount();
  }
  if (failed.length === 0) {
    statusEl.className = "form-status success";
    statusEl.textContent = `Sent to ${sent} customer${sent === 1 ? "" : "s"}.`;
  } else {
    statusEl.className = "form-status error";
    statusEl.textContent = `Sent ${sent} of ${people.length}. Failed: ${failed.slice(0, 3).join(" · ")}${failed.length > 3 ? ` · +${failed.length - 3} more` : ""}`;
  }
  btn.disabled = false;
  document.getElementById("sms-select-all").disabled = false;
  document.getElementById("sms-clear-all").disabled = false;
}

async function loadSmsSettings(client) {
  const form = document.getElementById("sms-settings-form");
  if (!form) return;
  const { data, error } = await client.from("sms_settings").select("*").eq("id", 1).maybeSingle();
  if (error || !data) return;
  form.elements.provider.value = data.provider || "txtconnect";
  form.elements.account_sid.value = data.account_sid || "";
  form.elements.sender_id.value = data.sender_id || "";
  smsKeySaved = !!(data.api_key && data.api_key.length);
  form.elements.api_key.value = "";
  form.elements.api_key.placeholder = smsKeySaved ? "Key saved — leave blank to keep it" : "Paste your API key";
  updateSmsProviderLabels();
}

async function handleSmsSettingsSubmit(e, client) {
  e.preventDefault();
  const form = e.target;
  const statusEl = document.getElementById("sms-settings-status");
  const btn = form.querySelector('button[type="submit"]');
  btn.disabled = true;
  try {
    const patch = {
      provider: form.elements.provider.value || "txtconnect",
      account_sid: form.elements.account_sid.value.trim() || null,
      sender_id: form.elements.sender_id.value.trim() || null,
      updated_at: new Date().toISOString(),
    };
    const apiKey = form.elements.api_key.value.trim();
    if (apiKey) patch.api_key = apiKey;
    const { error } = await client.from("sms_settings").update(patch).eq("id", 1);
    if (error) throw error;
    form.elements.api_key.value = "";
    smsKeySaved = smsKeySaved || !!apiKey;
    form.elements.api_key.placeholder = smsKeySaved ? "Key saved — leave blank to keep it" : "Paste your API key";
    statusEl.className = "form-status success";
    statusEl.textContent = "SMS account saved. You can send texts from this tab.";
  } catch (err) {
    statusEl.className = "form-status error";
    statusEl.textContent = err.message || "Couldn't save the SMS account.";
  }
  btn.disabled = false;
}

async function loadSmsMessages(client) {
  const body = document.getElementById("sms-body");
  if (!body) return;
  body.innerHTML = `<tr><td colspan="4" class="admin-empty">Loading SMS…</td></tr>`;
  const { data, error } = await client
    .from("sms_messages")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) {
    body.innerHTML = `<tr><td colspan="4" class="admin-empty">Couldn't load SMS: ${escapeHtml(error.message)}</td></tr>`;
    return;
  }
  allSmsMessages = data || [];
  renderOverview();
  if (!allSmsMessages.length) {
    body.innerHTML = `<tr><td colspan="4"><div class="admin-empty"><span class="code">MW · NO SMS</span>Sent texts will appear here.</div></td></tr>`;
    return;
  }
  body.innerHTML = allSmsMessages.map((m) => `<tr>
    <td class="cell-when">${formatDate(m.created_at)}</td>
    <td>
      <strong>${escapeHtml(m.customer_name) || "Customer"}</strong><br>
      <span class="cell-when">${escapeHtml(m.phone)}</span>
    </td>
    <td class="cell-details">${escapeHtml(m.body)}${m.error ? `<br><span class="muted">${escapeHtml(m.error)}</span>` : ""}</td>
    <td>${m.status === "sent"
      ? '<span class="status-pill confirmed">Sent</span>'
      : '<span class="status-pill new">Failed</span>'}</td>
  </tr>`).join("");
}

async function sendSmsMessage(client, { phone, name, message, skipLogRefresh }) {
  try {
    const { data, error } = await client.functions.invoke("send-sms", {
      body: { phone, name, message },
    });
    if (error) {
      let detail = error.message || "Couldn't send the SMS.";
      try {
        const extra = await error.context.json();
        if (extra && extra.error) detail = extra.error;
      } catch {
        /* keep detail */
      }
      throw new Error(detail);
    }
    if (data && data.error) throw new Error(data.error);
    if (!skipLogRefresh) await loadSmsMessages(client);
    return { ok: true, phone: data && data.phone ? data.phone : phone };
  } catch (err) {
    if (!skipLogRefresh) await loadSmsMessages(client);
    return { ok: false, error: err.message || "Couldn't send the SMS." };
  }
}

async function handleSmsSend(e, client) {
  e.preventDefault();
  const form = e.target;
  const statusEl = document.getElementById("sms-send-status");
  const btn = form.querySelector('button[type="submit"]');
  const phone = form.elements.phone.value.trim();
  const name = form.elements.name.value.trim();
  const message = fillTemplate(form.elements.message.value.trim(), {
    name: name || "there",
    business: "Mwinbarka Imports",
    line: OFFICIAL_LINE,
  }).slice(0, 480);
  if (!phone || !message) {
    statusEl.className = "form-status error";
    statusEl.textContent = "Enter a phone number and a message.";
    return;
  }
  btn.disabled = true;
  statusEl.className = "form-status";
  statusEl.textContent = "Sending…";
  const result = await sendSmsMessage(client, { phone, name, message });
  if (result.ok) {
    form.elements.message.value = "";
    updateSmsCount();
    statusEl.className = "form-status success";
    statusEl.textContent = `SMS sent to ${result.phone}.`;
  } else {
    statusEl.className = "form-status error";
    statusEl.textContent = result.error;
  }
  btn.disabled = false;
}

function shipmentLabel(id) {
  return (SHIPMENT_STAGES.find((s) => s.id === id) || {}).label || "Not started";
}

function fillTemplate(body, vars) {
  return String(body || "").replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key) => vars[key] || "");
}

function templateVarsForOrder(order, extra) {
  const vars = {
    name: (order && order.name) || "there",
    business: "Mwinbarka Imports",
    line: OFFICIAL_LINE,
    shipment: order ? shipmentLabel(order.shipment_status) : "",
    status: (order && order.status) || "",
    amount: extra && extra.amount ? extra.amount : "",
  };
  return Object.assign(vars, extra || {});
}

async function maybeAutoSms(client, order, eventName) {
  const autoStatus = !!deskSettings.auto_sms_on_status;
  const autoShip = !!deskSettings.auto_sms_on_shipment;
  const isShip = String(eventName || "").startsWith("shipment:");
  if (isShip && !autoShip) return;
  if (!isShip && !autoStatus) return;
  if (!order || !order.phone) return;
  const matches = allTemplates.filter((t) => t.active !== false && t.trigger_event === eventName);
  for (const tpl of matches) {
    const message = fillTemplate(tpl.body, templateVarsForOrder(order)).slice(0, 480);
    if (!message) continue;
    await sendSmsMessage(client, { phone: order.phone, name: order.name, message });
  }
}

async function loadDeskSettings(client) {
  const form = document.getElementById("desk-settings-form");
  const { data } = await client.from("desk_settings").select("*").eq("id", 1).maybeSingle();
  deskSettings = data || {};
  if (!form || !data) return;
  if (form.elements.auto_sms_on_status) form.elements.auto_sms_on_status.checked = !!data.auto_sms_on_status;
  if (form.elements.auto_sms_on_shipment) form.elements.auto_sms_on_shipment.checked = !!data.auto_sms_on_shipment;
}

async function handleDeskSettingsSubmit(e, client) {
  e.preventDefault();
  const form = e.target;
  const statusEl = document.getElementById("desk-settings-status");
  const btn = form.querySelector('button[type="submit"]');
  btn.disabled = true;
  const patch = {
    auto_sms_on_status: form.elements.auto_sms_on_status.checked,
    auto_sms_on_shipment: form.elements.auto_sms_on_shipment.checked,
    updated_at: new Date().toISOString(),
  };
  const { error } = await client.from("desk_settings").update(patch).eq("id", 1).select("id");
  btn.disabled = false;
  if (error) {
    statusEl.className = "form-status error";
    statusEl.textContent = error.message;
    return;
  }
  deskSettings = Object.assign({}, deskSettings, patch);
  statusEl.className = "form-status success";
  statusEl.textContent = "Auto SMS saved.";
}

async function loadSmsTemplates(client) {
  const { data } = await client.from("sms_templates").select("*").order("created_at", { ascending: true });
  allTemplates = data || [];
  renderSmsTemplates();
}

function renderSmsTemplates() {
  const body = document.getElementById("sms-templates-body");
  const chips = document.getElementById("sms-templates");
  if (body) {
    body.innerHTML = allTemplates.map((t) => `<tr>
      <td><strong>${escapeHtml(t.name)}</strong><br><span class="cell-when">${escapeHtml((t.body || "").slice(0, 72))}</span></td>
      <td>${escapeHtml(t.trigger_event || "Manual")}${t.active === false ? " · off" : ""}</td>
      <td>
        <button type="button" class="chip" data-use-tpl="${escapeAttr(t.id)}">Use</button>
        <button type="button" class="chip" data-del-tpl="${escapeAttr(t.id)}">Delete</button>
      </td>
    </tr>`).join("") || `<tr><td colspan="3"><div class="admin-empty">No templates yet.</div></td></tr>`;
    body.querySelectorAll("[data-use-tpl]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const tpl = allTemplates.find((t) => t.id === btn.dataset.useTpl);
        const box = document.getElementById("sms-message");
        if (tpl && box) {
          box.value = fillTemplate(tpl.body, {
            name: (document.getElementById("sms-name")?.value.trim()) || "there",
            business: "Mwinbarka Imports",
            line: OFFICIAL_LINE,
          });
          updateSmsCount();
          showTab("sms");
        }
      });
    });
    body.querySelectorAll("[data-del-tpl]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        if (!adminClient) return;
        await adminClient.from("sms_templates").delete().eq("id", btn.dataset.delTpl);
        await loadSmsTemplates(adminClient);
      });
    });
  }
  if (chips && !chips.dataset.enriched) {
    const existing = [...chips.querySelectorAll("button")].map((b) => (b.textContent || "").trim().toLowerCase());
    chips.insertAdjacentHTML("beforeend", allTemplates.filter((t) => !existing.includes(String(t.name || "").trim().toLowerCase())).map((t) =>
      `<button type="button" class="chip" data-sms-template="${escapeAttr(t.body)}">${escapeHtml(t.name)}</button>`
    ).join(""));
    chips.dataset.enriched = "1";
  }
}

async function handleSmsTemplateSubmit(e, client) {
  e.preventDefault();
  const form = e.target;
  const statusEl = document.getElementById("sms-template-status");
  const { error } = await client.from("sms_templates").insert([{
    name: form.elements.name.value.trim(),
    body: form.elements.body.value.trim(),
    trigger_event: form.elements.trigger_event.value || null,
    active: form.elements.active.checked,
  }]);
  if (error) {
    statusEl.className = "form-status error";
    statusEl.textContent = error.message;
    return;
  }
  form.reset();
  form.elements.active.checked = true;
  statusEl.className = "form-status success";
  statusEl.textContent = "Template saved.";
  const chips = document.getElementById("sms-templates");
  if (chips) delete chips.dataset.enriched;
  await loadSmsTemplates(client);
}
