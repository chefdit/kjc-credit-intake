# KJC Credit Review — Intake

Private client intake for Kristal J Consulting's credit review service.
Static front end + Supabase (database, encrypted credential storage, edge functions).
Built to be imported into Lovable later.

## What it does
1. Client details
2. Goal interview — client writes their goal in plain words, AI asks 3–5 follow-ups, then writes a lender-ready target
3. MyScoreIQ login (encrypted at rest; never readable from the browser)
4. Two e-signatures: account authorization + credit services agreement

## Setup
1. Create a Supabase project (free tier). Run `supabase/schema.sql` in the SQL editor.
2. Secrets (Project Settings → Edge Functions):
   - `ANTHROPIC_API_KEY`
   - `CREDIT_ACCESS_KEY` — 32 random bytes, base64 (`openssl rand -base64 32`)
3. Deploy functions: `supabase functions deploy goal-interview` and `supabase functions deploy submit-intake`
4. Copy `config.example.js` → `config.js`, fill in project URL, anon key, and your IDIQ partner enrollment link.
5. Host the three static files anywhere (GitHub Pages works) at a non-indexed URL, or embed on a hidden page of kristaljconsulting.com.

## Still to do
- Approved wording for the two agreements goes in `#doc-authorization` and `#doc-agreement` in `index.html`; bump `DOC_VERSION` in `submit-intake`.
- Admin view (report upload, AI review, dispute letters, monthly re-review) — next build.
