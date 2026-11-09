// Supabase Edge Function: writes the full intake. Encrypts the MyScoreIQ login
// with a key held in Supabase secrets (CREDIT_ACCESS_KEY, 32 bytes base64).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const DOC_VERSION = { authorization: "2026-11-09", agreement: "draft" }; // bump when agreement wording changes

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const body = await req.json();
    const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: client, error: e1 } = await db.from("clients").insert(body.client).select().single();
    if (e1) throw e1;

    const { error: e2 } = await db.from("goals").insert({
      client_id: client.id,
      goal_raw: body.goal.raw,
      followups: body.goal.followups,
      target: body.goal.target?.target ?? null,
      requirements: body.goal.target?.requirements ?? []
    });
    if (e2) throw e2;

    const key = await importKey(Deno.env.get("CREDIT_ACCESS_KEY")!);
    const { error: e3 } = await db.from("credit_access").insert({
      client_id: client.id,
      username_enc: await encrypt(key, body.credit_access.username),
      password_enc: await encrypt(key, body.credit_access.password),
      enrolled_via_kjc: !!body.credit_access.enrolled_via_kjc
    });
    if (e3) throw e3;

    const ip = req.headers.get("x-forwarded-for")?.split(",")[0] ?? null;
    const sigs = ["authorization", "agreement"].map(d => ({
      client_id: client.id,
      document: d,
      document_version: DOC_VERSION[d as "authorization" | "agreement"],
      signed_name: body.signatures[d].name,
      initials: body.signatures[d].initials ?? {},
      esign_consent: !!body.signatures.esign_consent,
      signed_at: body.signatures[d].signed_at,
      ip,
      user_agent: body.signatures.user_agent
    }));
    const { error: e4 } = await db.from("signatures").insert(sigs);
    if (e4) throw e4;

    return new Response(JSON.stringify({ ok: true, client_id: client.id }), { headers: { ...cors, "content-type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: cors });
  }
});

async function importKey(b64: string) {
  const raw = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt"]);
}
async function encrypt(key: CryptoKey, text: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(text)));
  const out = new Uint8Array(iv.length + ct.length); out.set(iv); out.set(ct, iv.length);
  return "\\x" + [...out].map(b => b.toString(16).padStart(2, "0")).join("");
}

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type"
};
