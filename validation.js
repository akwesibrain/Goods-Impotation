// Form validation + sanitizing for the public site (no build step, no npm).
// Ghana phone rules — not UK. Server CHECK constraints re-validate on insert.

(function (root) {
  const CATEGORIES = [
    "Kitchen & Home",
    "Clothing & Fashion",
    "Electronics",
    "Shoes & Bags",
    "Beauty & Cosmetics",
    "Auto Parts",
    "Baby & Kids",
    "Other",
  ];
  const ORIGINS = ["", "China", "Turkey"];
  const NAME_RE = /^[\p{L}\p{M}][\p{L}\p{M}\s.'’-]*$/u;

  function asString(value) {
    return value == null ? "" : String(value);
  }

  function sanitize(input) {
    if (typeof input !== "string") return "";
    return input
      .replace(/<\s*(script|style)\b[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, "")
      .replace(/<[^>]+>/g, "")
      .replace(/javascript:/gi, "")
      .replace(/on\w+\s*=/gi, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function sanitizeEmail(email) {
    return sanitize(asString(email)).toLowerCase();
  }

  function sanitizePhone(phone) {
    return asString(phone).replace(/[^\d\s+\-]/g, "").trim();
  }

  function sanitizeUrl(url) {
    const raw = asString(url).trim();
    if (!raw) return "";
    if (/^(javascript|data|vbscript):/i.test(raw)) return "";
    let next = sanitize(raw);
    if (!next) return "";
    if (!/^[a-z][a-z0-9+.-]*:/i.test(next)) next = "https://" + next;
    try {
      const parsed = new URL(next);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "";
      return parsed.href.slice(0, 2048);
    } catch (_err) {
      return "";
    }
  }

  function isEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
  }

  function isPersonName(name) {
    return NAME_RE.test(name);
  }

  function isGhanaPhone(phone) {
    let digits = asString(phone).replace(/\D/g, "");
    if (digits.startsWith("00")) digits = digits.slice(2);
    if (digits.startsWith("233")) return digits.length === 12;
    if (digits.startsWith("0")) return digits.length === 10;
    return digits.length === 9;
  }

  function firstError(errors) {
    const key = Object.keys(errors)[0];
    return key ? errors[key] : "Please fix the highlighted fields and try again.";
  }

  function parseImportRequest(raw) {
    const data = {
      name: sanitize(raw.name).slice(0, 100),
      phone: sanitizePhone(raw.phone).slice(0, 20),
      email: sanitizeEmail(raw.email).slice(0, 254),
      request_details: sanitize(raw.request_details || raw.product).slice(0, 2000),
      category: sanitize(raw.category),
      quantity: sanitize(raw.quantity).slice(0, 80),
      location: sanitize(raw.location).slice(0, 200),
      reference_url: raw.reference_url ? sanitizeUrl(raw.reference_url) : "",
      origin: sanitize(raw.origin),
      photo_url: sanitize(raw.photo_url || "").slice(0, 2048),
    };
    const errors = {};
    if (data.name.length < 2) errors.name = "Name must be at least 2 characters.";
    else if (!isPersonName(data.name)) errors.name = "Use letters, spaces, hyphens, or apostrophes only.";
    if (!data.phone) errors.phone = "Enter a Ghana phone number.";
    else if (!isGhanaPhone(data.phone)) errors.phone = "Enter a Ghana number (e.g. 024 123 4567 or +233 24 123 4567).";
    if (!data.email) errors.email = "Enter your email address.";
    else if (!isEmail(data.email)) errors.email = "Enter a valid email address.";
    if (data.request_details.length < 10) errors.product = "Describe what you want imported (at least 10 characters).";
    if (!CATEGORIES.includes(data.category)) errors.category = "Select a category.";
    if (!data.quantity) errors.quantity = "Enter a quantity.";
    if (data.location.length < 2) errors.location = "Enter a delivery location in Ghana.";
    if (raw.reference_url && String(raw.reference_url).trim() && !data.reference_url) {
      errors.reference_url = "Paste a wholesale http(s) link, or leave this blank.";
    }
    if (data.origin && !ORIGINS.includes(data.origin)) errors.origin = "Pick China, Turkey, or leave blank.";
    return { ok: Object.keys(errors).length === 0, data, errors };
  }

  function parseReview(raw) {
    const data = {
      author_name: sanitize(raw.author_name).slice(0, 100),
      location: sanitize(raw.location).slice(0, 200),
      quote: sanitize(raw.quote).slice(0, 2000),
      rating: Number(raw.rating) || 0,
    };
    const errors = {};
    if (data.author_name.length < 2) errors.author_name = "Enter your name.";
    else if (!isPersonName(data.author_name)) errors.author_name = "Use letters, spaces, hyphens, or apostrophes only.";
    if (data.location.length < 2) errors.location = "Enter a location in Ghana.";
    if (data.quote.length < 10) errors.quote = "Write at least 10 characters.";
    if (!Number.isInteger(data.rating) || data.rating < 1 || data.rating > 5) errors.rating = "Pick a rating from 1 to 5.";
    return { ok: Object.keys(errors).length === 0, data, errors };
  }

  function parseSignup(raw) {
    const data = {
      fullName: sanitize(raw.fullName || raw.full_name).slice(0, 100),
      phone: sanitizePhone(raw.phone).slice(0, 20),
      email: sanitizeEmail(raw.email).slice(0, 254),
      password: asString(raw.password),
    };
    const errors = {};
    if (data.fullName.length < 2) errors.full_name = "Name must be at least 2 characters.";
    else if (!isPersonName(data.fullName)) errors.full_name = "Use letters, spaces, hyphens, or apostrophes only.";
    if (!isGhanaPhone(data.phone)) errors.phone = "Enter a Ghana phone number.";
    if (!isEmail(data.email)) errors.email = "Enter a valid email address.";
    if (data.password.length < 6) errors.password = "Password must be at least 6 characters.";
    else if (data.password.length > 72) errors.password = "Password must be under 72 characters.";
    return { ok: Object.keys(errors).length === 0, data, errors };
  }

  function parseLogin(raw) {
    const identifier = asString(raw.email || raw.identifier).trim();
    const data = {
      email: identifier.includes("@") ? sanitizeEmail(identifier).slice(0, 254) : identifier,
      password: asString(raw.password).replace(/^\s+|\s+$/g, ""),
    };
    const errors = {};
    if (!isEmail(data.email) && !isGhanaPhone(data.email)) {
      errors.email = "Enter your email or a Ghana phone number.";
    }
    if (!data.password) errors.password = "Enter your password.";
    return { ok: Object.keys(errors).length === 0, data, errors };
  }

  function parseProfile(raw) {
    const data = {
      full_name: sanitize(raw.full_name).slice(0, 100),
      company_name: sanitize(raw.company_name).slice(0, 120),
      phone: sanitizePhone(raw.phone).slice(0, 20),
      whatsapp: sanitizePhone(raw.whatsapp).slice(0, 20),
      region: sanitize(raw.region).slice(0, 80),
      city: sanitize(raw.city).slice(0, 80),
      address: sanitize(raw.address).slice(0, 200),
      landmark: sanitize(raw.landmark).slice(0, 120),
    };
    const errors = {};
    if (data.full_name.length < 2) errors.full_name = "Name must be at least 2 characters.";
    else if (!isPersonName(data.full_name)) errors.full_name = "Use letters, spaces, hyphens, or apostrophes only.";
    if (data.phone && !isGhanaPhone(data.phone)) errors.phone = "Enter a Ghana phone number.";
    if (data.whatsapp && !isGhanaPhone(data.whatsapp)) errors.whatsapp = "Enter a Ghana number for the official line.";
    return { ok: Object.keys(errors).length === 0, data, errors };
  }

  function parseNewEmail(raw) {
    const data = { email: sanitizeEmail(raw.email || raw.newEmail).slice(0, 254) };
    const errors = {};
    if (!isEmail(data.email)) errors.new_email = "Enter a valid email address.";
    return { ok: Object.keys(errors).length === 0, data, errors };
  }

  root.MwinbarkaForms = {
    CATEGORIES,
    sanitize,
    sanitizeEmail,
    sanitizePhone,
    sanitizeUrl,
    isGhanaPhone,
    isEmail,
    firstError,
    parseImportRequest,
    parseReview,
    parseSignup,
    parseLogin,
    parseProfile,
    parseNewEmail,
  };
})(typeof window !== "undefined" ? window : globalThis);
