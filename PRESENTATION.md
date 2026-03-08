# Live Launch Meeting Copilot — Presentation

Use this as speaker notes and slide copy. Each `---` block is one slide.

---

## Slide 1: Title

**Live Launch Meeting Copilot**

*Turn conversations into structured knowledge — in real time.*

Columbia Hack 2026 · The Live Agent

---

## Slide 2: The problem

**Most meeting tools are passive.**

- Record → transcribe → summarize **after** the meeting
- Notes are scattered and hard to act on
- Ownership and decisions get lost

**We wanted:** value **during** the meeting, not just after.

---

## Slide 3: What we built

**A live meeting agent that:**

1. **Listens** — live or replayed transcript
2. **Extracts** — people, systems, milestones, dependencies, decisions, action items
3. **Visualizes** — a live graph that updates as people talk
4. **Surfaces** — decisions and actions in a dedicated panel

*Structured, queryable knowledge from conversation.*

---

## Slide 4: Core thesis (one line)

**We turn conversations into structured, queryable knowledge.**

Not a passive recorder — an active participant that helps teams see what they’re building, deciding, and owning **in the moment**.

---

## Slide 5: Tech at a glance

- **Frontend:** Next.js, React Flow (graph), SSE for live updates
- **Agent:** Hono/Node, session API, Firestore persistence
- **STT:** Deepgram (multi-speaker)
- **Extraction:** Gemini (entities, decisions, actions, issues)
- **Deploy:** Cloud Run (web + agent), Secret Manager

---

## Slide 6: Demo flow

1. Open the app (replay or live).
2. Transcript flows in (replay uses our demo script; live uses your mic).
3. Graph builds: people, systems, milestones, dependencies.
4. Decisions and action items appear as they’re said.
5. One session, one shared view — no post-meeting archaeology.

**Demo URL:** https://launch-copilot-web-fh43iudbha-uc.a.run.app

---

## Slide 7: Why it matters

- **Judge gets it in &lt;30 seconds** — see the graph and panels change
- **Feels active, not passive** — AI is structuring the conversation live
- **Aligned to Live Agent** — speech in, reasoning + visualization out
- **Startup path** — same architecture can become cross-meeting org memory

---

## Slide 8: Closing line

**“Instead of leaving meetings with scattered notes, teams leave with structured knowledge they can actually use.”**

---

## Backup: If something breaks

- **Replay is the primary demo path** — no dependency on live mic or Deepgram in the browser.
- Agent health: `curl -sS https://launch-copilot-agent-fh43iudbha-uc.a.run.app/health`
- If the deployed web looks stale: redeploy with `gcloud builds submit --config cloudbuild.web.yaml .` (see README).

---

## Backup: What’s next (post-hackathon)

- Productionize deployed live STT (remove `ws://localhost:4002` dependency)
- Gemini TTS / spoken interruptions on high-value triggers
- Cross-meeting knowledge graph and org memory
