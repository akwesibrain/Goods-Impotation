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
    if (!chip) return;
    document.querySelectorAll("#status-filters .chip").forEach((c) => c.classList.remove("active"));
    chip.classList.add("active");
    activeFilter = chip.dataset.status;
    renderRequests(client);
  });
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
    </td>
    <td>${escapeHtml(r.location) || '<span class="muted">—</span>'}</td>
    <td class="cell-details">
      ${escapeHtml(r.category) ? `<span class="status-pill">${escapeHtml(r.category)}</span><br>` : ""}
      ${escapeHtml(r.request_details)}
      ${referenceHtml(r.reference_url)}
    </td>
    <td>${r.budget_range ? "GH₵" + escapeHtml(r.budget_range) : '<span class="muted">—</span>'}</td>
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
