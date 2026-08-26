// ============================================================
// MWINBARKA IMPORTS — floating AI sales assistant
// Talks to the ai-chat Edge Function. The OpenAI key never
// leaves the server. Catalog, orders, and requests stay in
// the existing Supabase tables.
// ============================================================

(function () {
  const DEFAULT_WELCOME =
    "Hi 👋 Welcome to Mwinbarka Imports. I'm your AI assistant. I can help you find products, understand our importation process, check product information, and help you start an order. What would you like to import?";
  const OFFICIAL_WA = "https://wa.me/233540309637";
  const QUICK = [
    "How does importation work?",
    "Find a product",
    "I want to place an order",
    "Talk to an agent",
  ];
  const SESSION_KEY = "mwinbarka_ai_session";
  const HISTORY_KEY = "mwinbarka_ai_history";

  if (document.body && document.body.id === "admin-page") return;

  const state = {
    open: false,
    sending: false,
    welcome: DEFAULT_WELCOME,
    enabled: true,
    sessionId: "",
    history: [],
    photoUrl: "",
  };

  function sessionId() {
    let id = "";
    try { id = sessionStorage.getItem(SESSION_KEY) || ""; } catch (_err) { /* private mode */ }
    if (!/^[0-9a-f-]{36}$/i.test(id) && window.crypto && window.crypto.randomUUID) {
      id = window.crypto.randomUUID();
      try { sessionStorage.setItem(SESSION_KEY, id); } catch (_err) { /* ignore */ }
    }
    return id || "00000000-0000-4000-8000-000000000000";
  }

  function loadHistory() {
    try {
      const raw = sessionStorage.getItem(HISTORY_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed.slice(-24) : [];
    } catch (_err) {
      return [];
    }
  }

  function saveHistory() {
    try {
      sessionStorage.setItem(HISTORY_KEY, JSON.stringify(state.history.slice(-24)));
    } catch (_err) { /* ignore */ }
  }

  function el(html) {
    const wrap = document.createElement("div");
    wrap.innerHTML = html.trim();
    return wrap.firstElementChild;
  }

  function escapeHtml(text) {
    return String(text || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function formatText(text) {
    return escapeHtml(text).replace(/\n/g, "<br>");
  }

  function buildUi() {
    const launcher = el(`
      <button type="button" class="ai-float" id="ai-float" aria-label="Open Mwinbarka AI Assistant" aria-expanded="false">
        <span class="ai-float-icon" aria-hidden="true">✦</span>
      </button>
    `);
    const panel = el(`
      <section class="ai-panel" id="ai-panel" hidden role="dialog" aria-labelledby="ai-title" aria-modal="false">
        <header class="ai-head">
          <span class="ai-avatar" aria-hidden="true">MW</span>
          <div class="ai-head-copy">
            <strong id="ai-title">Mwinbarka AI Assistant</strong>
            <small><span class="ai-dot"></span> Online</small>
          </div>
          <button type="button" class="ai-icon-btn" id="ai-min" aria-label="Minimise chat">–</button>
          <button type="button" class="ai-icon-btn" id="ai-close" aria-label="Close chat">×</button>
        </header>
        <div class="ai-log" id="ai-log"></div>
        <div class="ai-quick" id="ai-quick"></div>
        <form class="ai-composer" id="ai-form">
          <label class="ai-attach" title="Attach a product photo">
            <input type="file" id="ai-photo" accept="image/jpeg,image/png,image/webp" aria-label="Attach a product photo">
            <span aria-hidden="true">📷</span>
          </label>
          <textarea id="ai-input" rows="1" placeholder="What would you like to import?" maxlength="2000" enterkeyhint="send"></textarea>
          <button type="submit" class="ai-send" id="ai-send" aria-label="Send">Send</button>
        </form>
        <a class="ai-wa" id="ai-wa" href="${OFFICIAL_WA}" target="_blank" rel="noopener">Continue on WhatsApp</a>
      </section>
    `);
    document.body.appendChild(launcher);
    document.body.appendChild(panel);
    QUICK.forEach((label) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "ai-chip";
      btn.textContent = label;
      btn.addEventListener("click", () => sendMessage(label));
      panel.querySelector("#ai-quick").appendChild(btn);
    });
    return { launcher, panel };
  }

  function setOpen(open) {
    state.open = open;
    const panel = document.getElementById("ai-panel");
    const launcher = document.getElementById("ai-float");
    if (!panel || !launcher) return;
    panel.hidden = !open;
    launcher.setAttribute("aria-expanded", open ? "true" : "false");
    document.body.classList.toggle("ai-open", open);
    if (open) {
      const log = document.getElementById("ai-log");
      if (log) log.scrollTop = log.scrollHeight;
      const input = document.getElementById("ai-input");
      if (input) input.focus();
    }
  }

  function appendBubble(role, text, extra) {
    const log = document.getElementById("ai-log");
    if (!log) return;
    const node = document.createElement("div");
    node.className = "ai-bubble ai-bubble-" + role;
    node.innerHTML = `<p>${formatText(text)}</p>`;
    if (extra && extra.whatsapp_url) {
      const link = document.createElement("a");
      link.className = "ai-inline-wa";
      link.href = extra.whatsapp_url;
      link.target = "_blank";
      link.rel = "noopener";
      link.textContent = "Continue on WhatsApp";
      node.appendChild(link);
    }
    log.appendChild(node);
    log.scrollTop = log.scrollHeight;
    return node;
  }

  function setTyping(on) {
    const log = document.getElementById("ai-log");
    if (!log) return;
    const existing = log.querySelector(".ai-typing");
    if (existing) existing.remove();
    if (!on) return;
    const node = document.createElement("div");
    node.className = "ai-bubble ai-bubble-assistant ai-typing";
    node.innerHTML = "<span></span><span></span><span></span>";
    log.appendChild(node);
    log.scrollTop = log.scrollHeight;
  }

  function renderWelcome() {
    const log = document.getElementById("ai-log");
    if (!log) return;
    log.innerHTML = "";
    if (!state.history.length) {
      appendBubble("assistant", state.welcome);
      return;
    }
    state.history.forEach((row) => appendBubble(row.role, row.content));
  }

  function toggleQuick() {
    const quick = document.getElementById("ai-quick");
    if (!quick) return;
    const hasUser = state.history.some((row) => row.role === "user");
    quick.hidden = hasUser;
  }

  async function loadSettings() {
    const client = window.getSupabaseClient && window.getSupabaseClient();
    if (!client) return;
    const { data } = await client.from("ai_settings").select("enabled, welcome_message, whatsapp_number").eq("id", 1).maybeSingle();
    if (!data) return;
    state.enabled = data.enabled !== false;
    if (data.welcome_message) state.welcome = data.welcome_message;
    const wa = document.getElementById("ai-wa");
    const launcher = document.getElementById("ai-float");
    if (!state.enabled && launcher) launcher.hidden = true;
    if (wa && data.whatsapp_number) {
      const digits = String(data.whatsapp_number).replace(/\D/g, "");
      let intl = digits;
      if (intl.startsWith("0")) intl = "233" + intl.slice(1);
      else if (!intl.startsWith("233") && intl.length === 9) intl = "233" + intl;
      if (intl.length >= 12) wa.href = "https://wa.me/" + intl;
    }
  }

  async function uploadPhoto(file) {
    const client = window.getSupabaseClient && window.getSupabaseClient();
    if (!client) throw new Error("Upload is not available right now.");
    if (file.size > 5 * 1024 * 1024) throw new Error("Please choose a photo under 5 MB.");
    const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
    if (!["jpg", "jpeg", "png", "webp"].includes(ext)) throw new Error("Please use a JPG or PNG photo.");
    const path = `requests/${(window.crypto && window.crypto.randomUUID && window.crypto.randomUUID()) || Date.now()}.${ext}`;
    const { error } = await client.storage.from("media").upload(path, file, {
      contentType: file.type || "image/jpeg",
      upsert: false,
    });
    if (error) throw new Error("Couldn't upload that photo. You can still send it on the official line.");
    const { data } = client.storage.from("media").getPublicUrl(path);
    return data.publicUrl || "";
  }

  async function sendMessage(text) {
    const message = String(text || "").trim();
    if (!message || state.sending) return;
    const input = document.getElementById("ai-input");
    const sendBtn = document.getElementById("ai-send");
    if (input) input.value = "";
    state.sending = true;
    if (sendBtn) sendBtn.disabled = true;
    appendBubble("user", message);
    state.history.push({ role: "user", content: message });
    saveHistory();
    toggleQuick();
    setTyping(true);

    const client = window.getSupabaseClient && window.getSupabaseClient();
    let payload = { reply: "", whatsapp_url: OFFICIAL_WA, handoff: false };
    try {
      if (!client) throw new Error("unavailable");
      const { data, error } = await client.functions.invoke("ai-chat", {
        body: {
          session_id: state.sessionId,
          message,
          photo_url: state.photoUrl || "",
          history: state.history.slice(0, -1).slice(-12),
        },
      });
      if (error) throw error;
      payload = data || payload;
    } catch (_err) {
      payload = {
        reply: "Sorry, our AI assistant is temporarily unavailable. You can still contact our Mwinbarka Imports team on WhatsApp.",
        whatsapp_url: OFFICIAL_WA,
        handoff: true,
      };
    }

    setTyping(false);
    const reply = String(payload.reply || "I'd recommend speaking with our Mwinbarka Imports agent so they can confirm that for you.");
    appendBubble("assistant", reply, payload.handoff || payload.request_id ? { whatsapp_url: payload.whatsapp_url } : null);
    state.history.push({ role: "assistant", content: reply });
    saveHistory();
    const wa = document.getElementById("ai-wa");
    if (wa && payload.whatsapp_url) wa.href = payload.whatsapp_url;
    state.photoUrl = "";
    const photo = document.getElementById("ai-photo");
    if (photo) photo.value = "";
    state.sending = false;
    if (sendBtn) sendBtn.disabled = false;
    if (input) {
      input.style.height = "auto";
      input.focus();
    }
  }

  function bind(ui) {
    ui.launcher.addEventListener("click", () => setOpen(true));
    ui.panel.querySelector("#ai-close").addEventListener("click", () => setOpen(false));
    ui.panel.querySelector("#ai-min").addEventListener("click", () => setOpen(false));
    const form = ui.panel.querySelector("#ai-form");
    const input = ui.panel.querySelector("#ai-input");
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      sendMessage(input.value);
    });
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendMessage(input.value);
      }
    });
    input.addEventListener("input", () => {
      input.style.height = "auto";
      input.style.height = Math.min(input.scrollHeight, 96) + "px";
    });
    ui.panel.querySelector("#ai-photo").addEventListener("change", async (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      try {
        state.photoUrl = await uploadPhoto(file);
        appendBubble("assistant", "I've received your product photo. Tell me what you'd like imported — quantity, size, or colour if you know them — and I can open a request for the desk.");
      } catch (err) {
        appendBubble("assistant", err.message || "Couldn't upload that photo. Please try the Order Now form or the official line.");
        e.target.value = "";
      }
    });
  }

  document.addEventListener("DOMContentLoaded", async () => {
    if (document.body && document.body.id === "admin-page") return;
    state.sessionId = sessionId();
    state.history = loadHistory();
    const ui = buildUi();
    bind(ui);
    await loadSettings();
    renderWelcome();
    toggleQuick();
  });
})();
