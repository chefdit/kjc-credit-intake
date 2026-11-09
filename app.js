import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm";
import { CONFIG } from "./config.js";

const supabase = createClient(CONFIG.supabaseUrl, CONFIG.supabaseAnonKey);
const state = { step: 1, data: {}, followups: [], target: null };

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

$("#enroll-link").href = CONFIG.myScoreIqEnrollUrl;
$("#enroll-link").textContent = "Enroll with MyScoreIQ";

/* ---------- navigation ---------- */
function show(step) {
  state.step = step;
  $$(".panel").forEach(p => p.classList.toggle("is-active", p.dataset.panel == step));
  $$(".step").forEach(li => {
    const n = +li.dataset.step;
    li.classList.toggle("is-current", n === step);
    li.classList.toggle("is-done", n < step);
  });
  window.scrollTo({ top: 0, behavior: "smooth" });
}
$$("[data-back]").forEach(b => b.addEventListener("click", () => show(state.step - 1)));

/* ---------- validation ---------- */
function validate(form) {
  let ok = true;
  $$(".field, .choices", form).forEach(f => f.classList.remove("is-invalid"));
  $$("[required]", form).forEach(el => {
    const wrap = el.closest(".field, .choices, .check");
    let valid = el.type === "radio"
      ? !!form.querySelector(`[name="${el.name}"]:checked`)
      : el.type === "checkbox" ? el.checked : el.checkValidity();
    if (!valid) { ok = false; wrap?.classList.add("is-invalid"); }
  });
  if (!ok) form.querySelector(".is-invalid input, .is-invalid textarea")?.focus();
  return ok;
}
function collect(form) {
  const fd = new FormData(form);
  for (const [k, v] of fd.entries()) state.data[k] = v.trim ? v.trim() : v;
}
function banner(form, msg) {
  form.querySelector(".error-banner")?.remove();
  if (!msg) return;
  const d = document.createElement("div");
  d.className = "error-banner"; d.textContent = msg;
  form.prepend(d);
}

/* ---------- step 1 ---------- */
$("#panel-1").addEventListener("submit", e => {
  e.preventDefault();
  if (!validate(e.target)) return;
  collect(e.target); show(2);
});

/* ---------- step 2: goal interview ---------- */
const goalForm = $("#panel-2");
const nextBtn = $("#goal-next");

goalForm.addEventListener("submit", async e => {
  e.preventDefault();
  banner(goalForm);
  if (!validate(goalForm)) return;
  collect(goalForm);

  if (state.target) { show(3); return; }

  nextBtn.disabled = true;
  try {
    if (!state.followups.length) {
      nextBtn.textContent = "Thinking…";
      const { questions } = await callInterview({ mode: "questions" });
      state.followups = questions;
      renderFollowups(questions);
      nextBtn.textContent = "Build my target";
    } else {
      nextBtn.textContent = "Working…";
      const answers = state.followups.map((q, i) => ({ q, a: state.data[`fu_${i}`] || "" }));
      const target = await callInterview({ mode: "target", answers });
      state.target = target;
      renderTarget(target);
      nextBtn.textContent = "Continue";
    }
  } catch (err) {
    banner(goalForm, "Couldn't reach the planning service. Check your connection and try again.");
    console.error(err);
  } finally { nextBtn.disabled = false; }
});

async function callInterview(payload) {
  const { data, error } = await supabase.functions.invoke("goal-interview", {
    body: {
      ...payload,
      goal_raw: state.data.goal_raw,
      source: state.data.source,
      answers: payload.answers || []
    }
  });
  if (error) throw error;
  return data;
}

function renderFollowups(questions) {
  const box = $("#followups");
  box.innerHTML = "";
  questions.forEach((q, i) => {
    const wrap = document.createElement("div");
    wrap.className = "followup field";
    wrap.innerHTML = `<div class="q">${escapeHtml(q)}</div>
      <textarea name="fu_${i}" rows="2" required></textarea>`;
    box.append(wrap);
  });
  box.hidden = false;
  box.querySelector("textarea")?.focus();
}

function renderTarget(t) {
  $("#target-text").textContent = t.target;
  const meta = $("#target-meta");
  meta.innerHTML = "";
  (t.requirements || []).forEach(r => {
    const li = document.createElement("li"); li.textContent = r; meta.append(li);
  });
  $("#target").hidden = false;
  $("#followups").querySelectorAll("textarea").forEach(t => t.readOnly = true);
}

/* ---------- step 3 ---------- */
$("#panel-3").addEventListener("submit", e => {
  e.preventDefault();
  if (!validate(e.target)) return;
  collect(e.target);
  $("#sign-meta").textContent = `Signing as ${state.data.full_name} on ${new Date().toLocaleDateString("en-US", { dateStyle: "long" })}.`;
  show(4);
});

/* ---------- step 4: sign + submit ---------- */
const finalForm = $("#panel-4");
finalForm.addEventListener("submit", async e => {
  e.preventDefault();
  banner(finalForm);
  if (!validate(finalForm)) return;
  collect(finalForm);

  const name = state.data.full_name.toLowerCase().replace(/\s+/g, " ");
  const bad = ["sig_authorization", "sig_agreement"].filter(k => state.data[k].toLowerCase().replace(/\s+/g, " ") !== name);
  if (bad.length) {
    bad.forEach(k => finalForm.querySelector(`[name="${k}"]`).closest(".field").classList.add("is-invalid"));
    banner(finalForm, "Signatures must match the full legal name you entered on the first page.");
    return;
  }

  const btn = $("#submit-all");
  btn.disabled = true; btn.textContent = "Submitting…";
  try {
    const { error } = await supabase.functions.invoke("submit-intake", {
      body: {
        client: pick(state.data, ["full_name","dob","email","phone","address1","city","state","zip","source"]),
        goal: {
          raw: state.data.goal_raw,
          followups: state.followups.map((q, i) => ({ q, a: state.data[`fu_${i}`] })),
          target: state.target
        },
        credit_access: {
          username: state.data.msiq_user,
          password: state.data.msiq_pass,
          enrolled_via_kjc: true
        },
        signatures: {
          authorization: { name: state.data.sig_authorization, signed_at: new Date().toISOString() },
          agreement: { name: state.data.sig_agreement, signed_at: new Date().toISOString() },
          user_agent: navigator.userAgent
        }
      }
    });
    if (error) throw error;
    show("done");
    $$(".step").forEach(li => li.classList.replace("is-current", "is-done"));
  } catch (err) {
    console.error(err);
    banner(finalForm, "Submission didn't go through. Nothing was saved. Try again in a moment.");
    btn.disabled = false; btn.textContent = "Sign and submit";
  }
});

/* ---------- utils ---------- */
function pick(o, keys) { return Object.fromEntries(keys.map(k => [k, o[k]])); }
function escapeHtml(s) { return s.replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c])); }
