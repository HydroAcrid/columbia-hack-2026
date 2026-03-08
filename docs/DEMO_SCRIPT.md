# Live Launch Meeting Copilot — Demo Script (Two Presenters)

Use this script to run a tight, impressive demo that showcases **every feature**: live transcript, graph extraction (nodes + edges), decisions, actions, issues (blocker / warning / info), and ownership.

---

## Replay vs Live — Which to Use?

| | **Live** | **Replay** |
|---|----------|------------|
| **What it does** | **Real mic** → Deepgram STT → your speech becomes transcript → **Gemini** extracts entities, decisions, actions, issues in real time. | **No mic.** The app “plays” a pre-recorded meeting script; the graph fills from **curated demo data** so every feature appears on cue. |
| **Why use it** | Shows the real product: “We’re actually speaking and it’s extracting.” More impressive. | Guaranteed to look perfect. Same story every time; good if Live isn’t available or as a backup. |
| **When it works** | **Local:** needs agent + Deepgram (and optionally Gemini) running. **Deployed:** agent must have `DEEPGRAM_API_KEY` and `GEMINI_API_KEY`; browser connects to `wss://agent-url/stt`. | Works everywhere (local and deployed); no mic or STT needed. |

**Recommendation:** **Use Live** when you can (real mic, real extraction). Have **Replay** as backup or as a second beat: “Now here’s the same conversation in replay so you see every feature land on cue.”

---

**Roles**
- **Person A** — Driver + graph focus (starts Live/Replay, points at center canvas).
- **Person B** — Narrator + insights focus (points at left transcript, right Operator Brief).

---

## Before You Start (Checklist)

- [ ] One laptop, one browser, **full screen** (F11 or zoom out so panels are visible).
- [ ] Open: **https://launch-copilot-web-fh43iudbha-uc.a.run.app** (or local: `http://localhost:3000`).
- [ ] Wait for **Live** (green) in the top bar. If it says Connecting, wait a few seconds.
- [ ] **If using Live:** Switch to **Live** mode, then click the mic to start. Grant mic permission.  
- [ ] **If using Replay:** Leave mode on **Replay**; Person A will click **Replay** when you start.
- [ ] Person A has hand on mouse; Person B knows where the transcript (left) and Operator Brief (right) are.

---

## Script A — Live Mode (Real Mic, Real Extraction)

**Person A**  
*[Switch to **Live**, start the mic.]*

**Person A**  
“We’re going to run a short launch-planning meeting. Everything you see — transcript and graph — is coming from **our voices right now**. No pre-recorded tape.”

*Then **both** take turns reading the lines below. Speak clearly; pause briefly between lines so Deepgram and Gemini can process. Point at the graph and Operator Brief as nodes, decisions, actions, and issues appear.*

**Person A (Priya)**  
“Alright, let’s lock down the launch timeline. We’re targeting March 28 for the public release of Project Aurora.”

**Person B (Kevin)**  
“The API gateway is ready, but the billing integration still depends on the payments team finishing their v2 migration.”

**Person A (Sara)**  
“The onboarding flow redesign is done on my end. I handed it off to frontend last week.”

**Person B (Kevin)**  
“We picked that up. The new onboarding screens are in staging, but we haven’t gotten QA sign-off yet.”

**Person A (Priya)**  
“Who owns the QA pass for onboarding? I don’t see it assigned anywhere.”

**Person B (Marcus)**  
“I can flag that with the QA lead, but honestly the staging environment has been flaky. We should fix the deploy pipeline first.”

**Person A (Priya)**  
“Okay, decision: we fix staging reliability before we run the final QA pass. Kevin, can your team own that?”

**Person B (Kevin)**  
“Yes, we’ll prioritise the staging fix. But if payments v2 slips, billing integration blocks the whole launch.”

*As the graph and panels update, call out what’s appearing (e.g. “There’s the first decision,” “Now we have a blocker issue,” “Actions with owners”).*

**Person A or B (closing)**  
“So that’s **live**: our speech → transcript → extraction → graph and Operator Brief. Instead of leaving meetings with scattered notes, teams leave with **structured knowledge** they can actually use.”

---

## Script B — Replay Mode (Curated Demo, No Mic)

*Use this if Live isn’t working (e.g. no mic, deployed STT issues) or as a second run to show every feature on cue.*

**Person A**  
*[Click **Replay** in the top right.]*

**Person A**  
“We’re starting a simulated launch-planning meeting. Watch the left panel — that’s the **live transcript** as the meeting would be spoken.”

*Then follow along as the 8 lines play automatically (no mic). Narrate what appears:*

---

**Person B**  
*[As first line appears in transcript.]*

“First line in: **Priya** locks the launch date — March 28 for Project Aurora.”

**Person A**  
*[Point at center graph as first nodes appear.]*

“The graph is **extracting in real time**. You’re seeing **people** and **milestones** — Priya and the Aurora launch — and the first **decision** is already in the Operator Brief: *Target March 28 for Project Aurora public launch*.”

---

**Person B**  
*[As Kevin’s line and new nodes appear.]*

“**Kevin** from Engineering: API gateway is ready, billing depends on the payments team. Watch the graph — we now have **teams** and **systems**: Engineering, Payments, API Gateway, Billing, and the **depends_on** relationship: Billing waiting on Payments v2.”

**Person A**  
*[Briefly point at an edge.]*

“So we’re not just entities — we’re capturing **relationships**: who owns what, what depends on what.”

---

**Person B**  
*[As Sara and onboarding appear.]*

“**Sara** from Design: onboarding redesign done, handed to frontend. Graph adds **Sara**, **Onboarding Flow**, and an **owns** edge — she designed it.”

---

**Person B**  
*[As Kevin’s second line and staging appear.]*

“**Kevin** again: onboarding is in staging, no QA sign-off yet. We get **Staging** as a system, and the first **issue** in the right panel: *QA sign-off for onboarding is still pending* — that’s an **info**-level issue.”

**Person A**  
*[Point at Issues section.]*

“Issues can be **info**, **warning**, or **blocker**. We’ll see a blocker in a second.”

---

**Person B**  
*[As Priya asks who owns QA.]*

“**Priya** asks who owns the QA pass — it’s unassigned. Right panel: new issue — *No owner assigned for onboarding QA pass* — that’s a **blocker**.”

**Person A**  
*[Point at the blocker badge if visible.]*

“So the system is surfacing **ownership gaps** live.”

---

**Person B**  
*[As Marcus appears.]*

“**Marcus** from Ops: he’ll flag it with QA, but staging has been flaky — fix the deploy pipeline first. Graph adds **Marcus**, and a **blocks** edge: Staging **blocks** Onboarding. We also get our first **action**: *Flag QA assignment for onboarding with QA lead*, **owner Marcus**.”

**Person A**  
*[Point at Actions section.]*

“Actions show **who owns them** — so nothing falls through the cracks.”

---

**Person B**  
*[As Priya’s decision line appears.]*

“**Priya** makes it explicit: decision — fix staging reliability before final QA pass; Kevin’s team owns it. That’s a second **decision** in the brief.”

**Person A**  
*[Point at Decisions section.]*

“Decisions are captured as they’re said — no digging through notes later.”

---

**Person B**  
*[As Kevin’s last line appears.]*

“**Kevin** commits to the staging fix but calls out the risk: if Payments v2 slips, billing **blocks** the whole launch. Graph adds the **blocks** edge from Billing to the Aurora launch, and we get another **action** — *Fix staging deploy pipeline reliability*, **owner Kevin** — and a **warning** issue: *Billing integration blocked by Payments Team v2 migration*.”

**Person A**  
*[Sweep the graph once.]*

“So in one short conversation we’ve got **people**, **teams**, **systems**, and a **milestone**; **owns**, **depends_on**, **blocks**, and **relates_to**; **decisions**, **actions**, and **issues** at three severity levels — all extracted live.”

---

## Closing (Person A or B)

**Person A or B**  

“Instead of leaving meetings with scattered notes, teams leave with **structured knowledge** they can actually use. That’s the Live Launch Meeting Copilot.”

---

## Feature Checklist (What You Showed)

| Feature | Where it appeared |
|--------|--------------------|
| Live transcript | Left panel, line by line |
| Person nodes | Priya, Kevin, Sara, Marcus |
| Team nodes | Engineering, Payments Team |
| System nodes | API Gateway, Billing, Onboarding Flow, Staging |
| Milestone node | Aurora Launch (Mar 28) |
| **owns** edge | e.g. Priya→launch, Kevin→Eng, Eng→API Gateway, Sara→Onboarding |
| **depends_on** edge | Billing → Payments |
| **blocks** edge | Staging→Onboarding, Billing→Aurora Launch |
| **relates_to** edge | Marcus → Staging |
| Decisions | 2 (launch date; fix staging before QA) |
| Actions with owner | 2 (Marcus: flag QA; Kevin: fix staging) |
| Issue severity **info** | QA sign-off pending |
| Issue severity **blocker** | No owner for onboarding QA |
| Issue severity **warning** | Billing blocked by Payments v2 |
| Highlighting | Nodes briefly highlight as patches apply |

---

## If Something Breaks

- **Live mic not working / no extraction:** Fall back to **Replay** (Script B). Switch to Replay mode, click Replay, and narrate as the curated demo plays.
- **Replay not starting:** Check **Live** (green) in the top bar. If **Offline**, refresh and wait for connection.
- **No graph updates:** If the agent is down, you’ll see transcript only. Health check: `curl -sS https://launch-copilot-agent-fh43iudbha-uc.a.run.app/health`
- **Wrong URL:** Deployed: `https://launch-copilot-web-fh43iudbha-uc.a.run.app`. Local: `http://localhost:3000` (agent must be running for local).

---

## Optional: Live Mode Teaser

If you have time and are on **local** (with Deepgram proxy):

- Switch to **Live**, start mic, and say one or two lines (e.g. “We decided to move the launch to April 5”).
- Point out: “Same pipeline — live speech goes to the same extraction and graph. Deployed live is coming next.”

Keep this short; **Replay is the main demo**.
