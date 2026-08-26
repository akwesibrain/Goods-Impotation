# Mwinbarka Imports

Lead-generation website for **Mwinbarka Imports**, a Ghana-based importation agent who sources
and imports goods from **China and Turkey** on behalf of customers.

This is **not** an e-commerce shop. There is no catalog, no cart, and no online checkout. The
site exists to explain the service, earn trust, and capture one thing: an import request. Each
submission is saved to Supabase and handed off to WhatsApp, where all pricing, payment, and
order confirmation happen directly between Mwinbarka Imports and the customer.

All monetary values on the site are in **Ghana Cedis (GH₵)**.

---

## AI sales assistant

The floating chatbot on public pages talks to a Supabase Edge Function
(`ai-chat`). That function calls OpenAI and looks up the existing `products`
and `requests` tables. The OpenAI API key never ships in the browser.

### Required secret

Add this in the **Supabase Dashboard → Edge Functions → Secrets** (or
`supabase secrets set`):

| Name | Where it lives | Notes |
|------|----------------|-------|
| `OPENAI_API_KEY` | Supabase Edge Function secret only | Do **not** put this in `supabase-client.js`, Netlify, or Vercel frontend env vars |
| `SUPABASE_URL` | Provided automatically to Edge Functions | Already set by Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Provided automatically to Edge Functions | Never expose this to the browser |
| `SUPABASE_ANON_KEY` / publishable key | Already in `supabase-client.js` | Public; RLS protects data |

Until `OPENAI_API_KEY` is set, the chat UI still opens and the welcome message
still shows, but replies will say the assistant is temporarily unavailable and
point the customer to the official line **054 030 9637**.

Admin copy for the assistant (welcome, FAQs, hours, official line, extra
instructions) is edited at `/admin#ai`. That form does **not** accept an API key.

### How to test locally

```bash
python3 -m http.server 8000
```

Open http://localhost:8000, click the navy ✦ button (left of the gold floating
button on desktop), send a message, and watch the Network tab: the browser
should only call `.../functions/v1/ai-chat`. There must be no request to
`api.openai.com` from the page.

### Deploy notes

Production for this repo is **Vercel** (`goods-impotation`). Pushing `main`
updates the static site. `netlify.toml` is still valid if you publish the
same folder on Netlify — there is no frontend build step and no OpenAI key
to add there.

After adding `OPENAI_API_KEY` in Supabase, redeploy is not required for the
secret to take effect on the next chat message. You do need the `ai-chat`
Edge Function deployed (`verify_jwt` is off because guests can chat; the
function authenticates signed-in customers itself).

---

## Pages

| File | Route | Purpose |
|------|-------|---------|
| `index.html` | `/` | Hero, four-step process, category teaser, CTA |
| `how-it-works.html` | `/how-it-works` | The MW–01 to MW–04 process, expanded |
| `categories.html` | `/categories` | Example categories — inspiration, not a catalog |
| `request.html` | `/request` | The lead form. The whole point of the site |
| `about.html` | `/about` | Who Mwinbarka Imports is, sourcing countries, coverage |
| `faq.html` | `/faq` | Pricing, timelines, payment, customs |
| `contact.html` | `/contact` | WhatsApp front and centre |
| `admin.html` | `/admin` | Password-protected desk for incoming requests |

Supporting files: `styles.css` (design system), `script.js` (nav, FAQ accordion, request form),
`supabase-client.js` (lead capture), `admin.js` (admin desk), `supabase/schema.sql` (database).

## Running it locally

No build step and no dependencies — it's plain HTML, CSS, and JavaScript. Serve the folder over
HTTP rather than opening the files directly, so relative paths behave the way they will in
production:

```bash
python3 -m http.server 8000
```

Then visit http://localhost:8000.

## Connecting Supabase

Without Supabase the site still works — requests go to WhatsApp and nothing is stored. Connecting
it means every lead is also captured in a database, so nothing is lost if a customer fills in the
form and never presses send in WhatsApp.

1. Create a free project at [supabase.com](https://supabase.com).
2. Open **SQL Editor** and run the contents of [`supabase/schema.sql`](supabase/schema.sql). This
   creates the `requests` table and the row level security policies.
3. Go to **Project Settings → API** and copy the Project URL and the `anon` public key into the
   two constants at the top of `supabase-client.js`.
4. Create the admin login under **Authentication → Users → Add user** (tick *Auto Confirm User*).
   Then disable public sign-ups under **Authentication → Sign In / Providers → Email**, so nobody
   else can create an account.

The anon key is meant to be public; row level security is what protects the data. The policies in
`schema.sql` let anyone insert a request, but only a signed-in user can read or update one.

### `requests` table

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid | primary key, `gen_random_uuid()` |
| `name` | text | customer's name |
| `phone` | text | customer's phone / WhatsApp number |
| `location` | text | region or city in Ghana |
| `request_details` | text | free text — what they want imported |
| `category` | text | optional |
| `reference_url` | text | optional link or photo reference |
| `budget_range` | text | optional, in GH₵ |
| `status` | text | New / Contacted / Quoted / Confirmed / Closed |
| `created_at` | timestamptz | defaults to `now()` |

## Deploying to Netlify

Connect the repository in Netlify and accept the defaults — `netlify.toml` already sets the
publish directory to the repo root with no build command. Netlify serves `/request` from
`request.html` automatically, so the routes in the table above work without extra configuration.

## The admin desk

`/admin` asks for the Supabase email and password created during setup, then lists every request
newest first. Each row can be filtered by status, updated to a new status, and answered with a
one-click WhatsApp reply that formats the customer's Ghanaian number into international form.

Hiding the page is only convenience — the database policies are what actually keep requests
private, so an unauthenticated visitor to `/admin` can never read a lead.

## Replacing the logo

`assets/logo.png` is a **placeholder** — a gold globe and flight path in the brand colours. Drop
the real navy-and-gold logo in at the same path and filename and every page picks it up. It's
displayed 34px tall in the header, so a transparent PNG around 256px square works well.

## Brand

| Token | Value | Used for |
|-------|-------|----------|
| Navy | `#0A1F44` (deepest `#071427`) | Headers, nav, footer, dark panels |
| Gold | `#C9A227` | CTAs, prices, eyebrow labels, icons |
| Base | `#FFFFFF` / `#FAF8F3` | Page backgrounds |

Type is Fraunces for display, Inter for body, IBM Plex Mono for labels and codes. Gold is used
sparingly and deliberately — on calls to action and highlights, never across large areas.

The visual language is a shipping manifest: the `MW–0X` codes, dashed route lines, perforated
ticket cards, and the plane tracing its path all say the same thing — your request becomes a
manifest entry we track to Ghana.

## Out of scope

Deliberately not built, and not to be added without a decision to change the business model:
shopping cart, product catalog with individual product pages, online payment or checkout
(Paystack, cards, Mobile Money), customer accounts, and order tracking. Order status lives in
the WhatsApp conversation.

## Contact

WhatsApp: [054 030 9637](https://wa.me/233540309637)
