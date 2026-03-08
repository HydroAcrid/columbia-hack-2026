# Demo FAQ — Questions Judges & Attendees Might Ask

Suggested answers for common questions about Cricket / Live Launch Meeting Copilot. Adjust wording to fit your style.

---

## Product & vision

**What is this?**

A live meeting copilot that turns conversation into **structured knowledge** in real time. While people talk, we transcribe, extract entities and relationships (people, teams, systems, milestones, dependencies), capture decisions and action items, surface issues (blockers, warnings), and optionally have the agent speak up when something important is detected. It’s built for the “Live Agent” track.

**How is this different from Otter / Fireflies / meeting summarizers?**

Those tools record and summarize **after** the meeting. We focus on **during**: the graph and Operator Brief update live as people speak. We’re not just transcribing and summarizing — we’re structuring the conversation (who owns what, what blocks what, what was decided) so the team can see it and act on it in the moment.

**Who is this for?**

Teams that run technical or product discussions: engineering, product, ops, consulting. Any meeting where people talk about systems, dependencies, ownership, and decisions. The idea is to reduce “who said they’d do what?” and “what did we decide?” after the fact.

**What’s the one-line pitch?**

“We turn conversations into structured, queryable knowledge — live, not after the meeting.”

**What’s next after the hackathon?**

The same architecture can become an **organizational memory** layer: persistent knowledge graph across meetings, conflict detection over time, onboarding from past conversations, ownership and dependency tracing. We’re persisting structured graph objects, not just transcripts, so we can build that on top.

---

## Tech & architecture

**What’s in the stack?**

- **Frontend:** Next.js, React, React Flow for the graph, SSE for live updates.
- **Agent:** Hono on Node.js — session API, WebSocket at `/stt` for live audio, SSE for streaming graph/insight events.
- **STT:** Deepgram (via the agent). We need speaker separation for real meetings, so we use Deepgram rather than a single-speaker model.
- **Extraction:** Google Gemini — we send transcript chunks and get back structured patches (nodes, edges, decisions, actions, issues).
- **TTS / interruption:** Gemini-backed TTS on the agent; the web client can fall back to browser speech if needed.
- **Persistence:** Firestore for session state and event history in deployed mode.
- **Hosting:** Both web and agent on Cloud Run; secrets (e.g. Gemini, Deepgram) via Secret Manager.

**Why Deepgram and not Gemini for speech-to-text?**

We need **multi-speaker** (diarization) so we know who said what. Deepgram gives us that. Gemini is used for **structured extraction** (entities, decisions, actions) and for **TTS** when the agent speaks. So we use both for different jobs.

**Why a graph instead of just a list of items?**

The graph makes **relationships** visible: who owns what, what depends on what, what blocks what. That’s the difference between “list of topics” and “model of the system and who’s responsible.” It also sets us up for cross-meeting reasoning later.

**How does “Replay” work vs “Live”?**

- **Live:** Mic → Deepgram (via agent `/stt`) → transcript chunks → agent → Gemini extraction → graph and Operator Brief update. Real-time.
- **Replay:** The app sends a fixed demo script (same chunks) to the same backend; for that script we have curated demo extractions so the graph and insights look polished. No mic. We use it for a reliable demo or backup when live isn’t available.

**Where does the data go? Is it private?**

For the hackathon, session state and events are stored in our Firestore in the `hackathon-test-key` GCP project. We’re not shipping data to third parties beyond what’s needed for Deepgram (audio → transcript) and Gemini (text → extraction). Post-hackathon, privacy and data residency would be part of the product design.

---

## Demo & behavior

**Why did you choose Live vs Replay for the demo?**

We prefer **Live** when we can — it shows the real product with the mic and real extraction. We keep **Replay** as a backup (e.g. mic or network issues) or as a second run so judges see every feature land on cue. The demo script doc has both flows.

**What if extraction is wrong or misses something?**

We’re not aiming for perfect accuracy in the demo. We’re showing that the system **structures** the conversation live; the value is in making ownership, decisions, and blockers visible. The graph and prompts can be tuned over time. For the curated demo script, Replay gives us consistent, “perfect” output when we need it.

**When does the agent “interrupt” or speak?**

When the extraction identifies a high-value trigger (e.g. blocker, unowned action), the agent can generate a short spoken message and send it to the client. We use Gemini for TTS; if that’s slow or blocked, the web app can fall back to browser speech synthesis. We throttle interruptions so the agent doesn’t talk over people.

**Does it work with more than two people?**

Yes. Deepgram does speaker separation, so we get multiple speakers. The graph and Operator Brief don’t assume a fixed number of people. The demo script happens to use four roles (Priya, Kevin, Sara, Marcus) to show variety.

**Can we try it on our own meeting?**

Yes — use **Live** mode, start the mic, and talk. The deployed app is at the URL in the README. For the best experience, speak clearly and give a short pause between turns so STT and extraction can keep up. Replay is there if you want to see the full curated story without speaking.

---

## Deployment & reliability

**Is it deployed or local-only?**

Both web and agent are deployed on **Google Cloud Run** in the `hackathon-test-key` project. The README has the demo URLs. Pushes to `main` trigger Cloud Build and deploy both services. You can also run everything locally with the agent and web dev servers.

**What if the demo breaks during judging?**

We have a short runbook: (1) Prefer Live; if mic or STT fails, switch to Replay and click Replay. (2) Check the agent health endpoint if nothing updates. (3) If the deployed site looks stale, we can redeploy or push to `main`. The demo script doc has an “If something breaks” section we rehearse from.

**How do you handle API keys and secrets?**

Gemini and Deepgram keys are in **Secret Manager**; the agent Cloud Run service mounts them at runtime. The web app only talks to our agent; it doesn’t see the keys. For local dev we use `.env` / `.env.local` (not committed).

---

## Team & build

**Who built this?**

Kevin Dotel and Nelly Nguyen. We’re the team behind the repo (e.g. HydroAcrid, nellynguyen on GitHub).

**How long did it take?**

Built over the hackathon period. We started with the session pipeline, graph merge, and replay, then added live STT, Gemini extraction, TTS/interruption, and Cloud Run deployment.

**What was the hardest part?**

Getting the full loop right: live audio → STT → extraction → graph merge → SSE to the client, plus making the UI feel responsive. Deciding to use Deepgram for STT and Gemini for extraction (and later TTS) and sticking to one pipeline for both Live and Replay helped.

**Is the code open source?**

The repo is our hackathon project. Check the repo for license and whether we open-source it after the event.

---

## Quick reference

| Topic | Short answer |
|-------|----------------|
| What it does | Live meeting → transcript + graph + decisions/actions/issues; optional agent voice. |
| Why a graph | Shows relationships (owns, depends on, blocks); not just a summary. |
| Why Deepgram | Multi-speaker STT. Gemini is for extraction and TTS. |
| Live vs Replay | Live = real mic + real extraction. Replay = canned script + curated demo data. |
| Deployed? | Yes — web + agent on Cloud Run; see README for URLs. |
| If demo fails | Switch to Replay; check agent health; redeploy if needed. |
