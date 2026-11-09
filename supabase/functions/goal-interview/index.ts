// Supabase Edge Function: turns a plain-language goal into follow-up questions,
// then into a lender-ready target. Secret: ANTHROPIC_API_KEY
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SYSTEM = `You are the intake planner for a private credit review service run by a commercial loan broker and real estate advisor. Clients describe goals loosely ("build a legacy", "stop funding other people's deals"). Your job is to translate that into something a lender can underwrite.

Context about the client's world: many are investors or would-be investors. Common paths: gap funding or private lending today, wanting to be the borrower on their own flips or rentals; starting an operating business and needing business credit; buying a first rental; refinancing. Credit is the gate.

Rules:
- Ask only what changes the plan. 3 to 5 questions, each one sentence, plain language, no jargon.
- Cover: what they own or fund today, what they'd rather be doing, income/business picture, timeline, anything tried before.
- Never ask for SSN, account numbers, or exact balances.
- When writing the target, be specific: the financing product, the realistic timeline, and the credit thresholds it requires (score range, DTI or DSCR, reserves, tradeline depth). State thresholds as typical lender requirements, not guarantees.
- Use "they/their" for the client in requirements. Write the target in second person ("You...").
Respond only with JSON, no markdown.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const { mode, goal_raw, source, answers = [] } = await req.json();

    const user = mode === "questions"
      ? `Client came to us via: ${source}.\nTheir goal in their words: "${goal_raw}"\n\nReturn {"questions": [string, ...]}`
      : `Client came to us via: ${source}.\nGoal in their words: "${goal_raw}"\nFollow-up answers:\n${answers.map((a: any) => `Q: ${a.q}\nA: ${a.a}`).join("\n")}\n\nReturn {"target": string, "requirements": [string, ...], "horizon_months": number}`;

    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": Deno.env.get("ANTHROPIC_API_KEY")!,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 800,
        system: SYSTEM,
        messages: [{ role: "user", content: user }]
      })
    });
    const data = await r.json();
    const text = data.content?.map((c: any) => c.text || "").join("") ?? "";
    const json = JSON.parse(text.replace(/```json|```/g, "").trim());
    return new Response(JSON.stringify(json), { headers: { ...cors, "content-type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: cors });
  }
});

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type"
};
