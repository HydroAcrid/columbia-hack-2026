# Live Meeting Visualizer / Organizational Memory Agent

## 1. Overview

We are building a real-time AI meeting agent that listens to live conversation, extracts structure from what is being said, and turns that conversation into a live visual map of entities, systems, decisions, action items, and dependencies.

This is not a passive meeting summarizer. Traditional meeting tools transcribe, summarize, and archive. Our product actively adds value during the meeting by helping participants understand what they are building, deciding, assigning, and contradicting in real time.

For the hackathon, the product will focus on a simple, high-impact live experience:

* live speech input
* live transcript
* live diagram generation
* live decisions/action items panel
* selective AI interruptions when something important is detected

Under the hood, the system will be structured as a lightweight knowledge graph pipeline so the same architecture can evolve into a startup product after the hackathon.

## 2. Core Product Thesis

Most meeting tools are passive recorders.

They do this:

* record the meeting
* produce transcript
* generate summary afterward

We do this:

* listen live
* structure the conversation into entities, relationships, decisions, and ownership
* visualize it during the meeting
* reason over the evolving discussion
* occasionally intervene when there is a contradiction, blocker, or unowned task

Core positioning:

**We turn conversations into structured, queryable knowledge.**

## 3. Hackathon Goal

Build a working demo where two or more people speak about a system, project, or workflow, and the app:

* transcribes the discussion live
* extracts entities such as services, teams, people, and topics
* detects relationships such as owns, depends on, calls, blocks, connects to
* builds a live graph on screen
* lists decisions and action items as they appear
* optionally speaks up when a high-value trigger occurs

Success criteria for the demo:

* a judge can understand the value in under 30 seconds
* the UI visibly changes while people talk
* the AI feels active, not passive
* the system appears intelligent without requiring perfect accuracy

## 4. Startup Direction

The hackathon version is a live visualizer.

The startup version becomes an organizational intelligence layer:

* persistent meeting knowledge graph
* cross-meeting memory
* conflict detection across time
* onboarding from past conversations
* ownership and dependency tracing
* searchable team knowledge

The important architectural decision is to persist structured graph objects instead of treating each meeting as a disposable transcript.

## 5. Track, Industry, and Use Case

### Track

The Live Agent

### Industry

Primary:

* engineering
* product
* operations
* consulting

Secondary future industries:

* legal strategy meetings
* architecture and infrastructure planning
* enterprise PMO / program management
* internal knowledge management

### Primary use case

When a team is discussing a technical system, project plan, or business workflow, the app listens and builds a live visual model of that conversation. This reduces ambiguity, captures ownership, and helps participants align in the moment instead of relying on memory after the meeting.

## 6. Product Scope

### In scope for hackathon

* one live meeting session
* live transcript
* live structured extraction
* live graph rendering
* decisions panel
* actions panel
* voice interruption on high-value events only
* persistent storage of graph nodes/edges for the session

### Out of scope for hackathon

* perfect speaker diarization
* multi-meeting analytics dashboard
* enterprise auth and team management
* polished onboarding flow
* advanced permissions model
* high-scale performance optimization
* complex search/RAG features

## 7. User Experience

### Main UI layout

Three-panel layout:

1. Left panel: live transcript
2. Center panel: live visual graph / diagram canvas
3. Right panel: structured insights

   * decisions
   * action items
   * blockers / contradictions
   * detected ownership gaps

### Demo flow

1. User opens the app and joins a meeting room.
2. Audio stream begins.
3. Transcript starts appearing in real time.
4. The graph begins to populate with nodes and edges.
5. The right panel fills with decisions and action items.
6. If an important trigger is detected, the AI briefly speaks and highlights the relevant nodes.
7. End of demo shows a summary card:

   * entities detected
   * relationships detected
   * decisions made
   * action items captured

## 8. Functional Requirements

### FR1. Live speech ingestion

The system must ingest meeting audio in real time.

### FR2. Live transcript

The system must display a rolling transcript with low enough latency to feel live.

### FR3. Structured extraction

The system must transform transcript chunks into structured objects:

* entities
* relationships
* decisions
* action items
* blockers
* contradictions

### FR4. Graph persistence

The system must maintain an evolving graph state for the session.

### FR5. Live graph rendering

The graph UI must update incrementally without rerendering the entire system from scratch.

### FR6. Selective agent voice output

The agent may speak only when important triggers are detected.

### FR7. Structured insight panel

The UI must show extracted decisions and action items in parallel with the graph.

### FR8. Session persistence

The system should persist meeting data so the state can be reviewed after the session.

## 9. Non-Functional Requirements

* Low latency for transcript and visual updates
* High demo reliability
* Graceful degradation if extraction is imperfect
* Stable UI with deduped graph updates
* Simple deploy path on Google Cloud
* Monorepo-friendly code structure

## 10. Technical Architecture

### High-level architecture

```text
Audio Input
   -> Speech Streaming Layer
   -> Transcript Buffer / Orchestrator
   -> LLM Structuring Engine
   -> Knowledge Graph State Manager
   -> Realtime Event Stream
   -> Frontend Graph + Insights UI
```

### Architectural principle

Separate the system into two loops:

1. **Input understanding loop**

   * audio
   * transcript
   * chunking
   * extraction

2. **Presentation and reasoning loop**

   * graph state
   * realtime UI patches
   * contradiction / trigger detection
   * optional agent speech output

This separation keeps the app stable even if the AI is not perfect.

## 11. Final Recommended Tech Stack

### Frontend

* Next.js
* TypeScript
* Tailwind CSS
* React Flow for graph rendering

### Backend

* Node.js
* TypeScript
* modular service architecture

### AI / real-time model layer

* Gemini Live API on Google Cloud / Vertex AI for live multimodal interaction and agent logic

### Database / persistence

Preferred hackathon path:

* Firestore for session and graph persistence



### Realtime transport

Preferred if staying GCP-native:

* backend event stream over managed service patterns from Cloud Run to frontend


### Voice input/output

If Gemini Live covers both sufficiently in implementation, keep it unified.
Otherwise split responsibilities:

* STT: Gemini live audio ingestion (live api)
* TTS: Gemini TTS

### Deployment

* Monorepo hosted in GitHub
* Frontend deployed on Firebase App Hosting or other GCP-friendly Next.js deployment path
* Backend deployed on Cloud Run
* AI via Vertex AI / Gemini Live

## 12. Why Monorepo

We want a single repository for speed, easier local development, shared types, and faster collaboration.

Recommended structure:

```text
/apps
  /web      -> Next.js frontend
  /agent    -> Node.js backend / orchestration service
/packages
  /shared   -> shared types, schemas, prompts
  /graph    -> graph diffing / merge logic
  /ui       -> optional shared components
```

Benefits:

* shared event schemas between frontend and backend
* shared graph models
* easier local development
* easier preview builds
* easy separation for deployment targets

## 13. Core Data Model

### Node types

* person
* team
* system
* topic
* decision
* action
* blocker

### Edge types

* owns
* depends_on
* calls
* blocks
* relates_to
* decided_by
* assigned_to
* mentioned_with

### Graph object examples

```json
{
  "nodes": [
    { "id": "frontend", "label": "Frontend", "type": "system" },
    { "id": "auth", "label": "Auth Service", "type": "system" },
    { "id": "kevin", "label": "Kevin", "type": "person" }
  ],
  "edges": [
    { "id": "frontend-auth", "source": "frontend", "target": "auth", "type": "calls" },
    { "id": "kevin-auth", "source": "kevin", "target": "auth", "type": "owns" }
  ],
  "decisions": [
    { "id": "d1", "text": "Use PostgreSQL for auth data" }
  ],
  "actions": [
    { "id": "a1", "owner": "Kevin", "text": "Draft auth API" }
  ]
}
```

## 14. Event Model

The frontend should not receive full graph regeneration for every update. It should receive graph patches.

### Patch event types

* node_added
* node_updated
* edge_added
* decision_added
* action_added
* blocker_added
* contradiction_detected
* agent_interrupt_triggered

### Example patch

```json
{
  "type": "graph_patch",
  "payload": {
    "add_nodes": [
      { "id": "payments", "label": "Payments Service", "type": "system" }
    ],
    "add_edges": [
      { "source": "frontend", "target": "payments", "type": "calls" }
    ],
    "add_actions": [
      { "owner": "Kevin", "text": "Design payments API" }
    ]
  }
}
```

## 15. LLM Responsibilities

The LLM should not do everything. Its job is specific.

### LLM job

Given recent transcript context and current graph state, return structured JSON containing:

* entities
* relationships
* decisions
* action items
* blockers
* contradictions
* whether an agent interruption is warranted

### Rules

* do not hallucinate owners or due dates
* prefer reuse of existing node ids
* use short labels
* only add strong relationships
* be conservative with interruptions

## 16. Agent Voice Behavior

The AI should not constantly speak.

### Voice triggers

The agent is allowed to speak when one of the following occurs:

* contradiction detected
* major decision detected
* critical dependency missing
* important action item has no owner
* blocker explicitly surfaced

### Voice principles

* short
* rare
* useful
* respectful

### Examples

* “Excuse me — I detected a contradiction in service ownership.”
* “Excuse me — a key action item was mentioned without an owner.”
* “Excuse me — this sounds like a major architecture decision.”

## 17. Extraction Pipeline

### Step 1: audio ingestion

Receive live audio from browser or live meeting stream.

### Step 2: transcript chunking

Buffer transcript into short windows, such as every 5–10 seconds.

### Step 3: structured extraction

Send recent transcript + graph context to the LLM.

### Step 4: graph merge

Dedupe entities, merge existing nodes, and generate graph patches.

### Step 5: publish updates

Send graph and insight patches to frontend.

### Step 6: trigger detection

If a voice-worthy event is returned, trigger TTS and highlight related nodes.

## 18. Persistence Model

### Session-level persistence

Store:

* transcript chunks
* graph nodes and edges
* decisions
* actions
* blockers
* event history / patches

### Reason for persistence

Even if cross-meeting search is not fully built in the hackathon, persisting this data proves the architecture supports startup expansion.

## 19. Google Cloud Deployment Plan

### Frontend

Deploy Next.js app using a Google-cloud-friendly hosting path, ideally Firebase App Hosting.

### Backend

Deploy Node.js orchestration service to Cloud Run.

### AI

Use Gemini via Vertex AI / Gemini Live API.

### Storage

Use Firestore or GCP-native persistence for session data if staying fully native.

### CI/CD

Optional:

* GitHub integration
* Cloud Build

## 20. Development Phases

### Phase 1: skeleton

* monorepo setup
* frontend shell
* backend shell
* shared types
* deploy scaffolding

### Phase 2: transcript loop

* connect live audio ingestion
* show transcript in UI

### Phase 3: extraction loop

* transcript chunking
* LLM structured output
* schema validation

### Phase 4: graph loop

* graph state manager
* graph patch generation
* React Flow rendering

### Phase 5: insight loop

* decisions/actions panel
* blockers/contradictions panel

### Phase 6: agent voice

* trigger logic
* short TTS output
* visual highlight sync

### Phase 7: demo polish

* loading states
* animated node entry
* replay or end-of-meeting summary

## 21. Hackathon MVP Definition

A successful MVP must demonstrate:

* live transcript
* live graph that changes meaningfully
* at least 3 node types
* at least 3 edge types
* decisions panel
* actions panel
* one successful agent interruption event

If time is tight, the priority order is:

1. transcript
2. graph extraction
3. graph rendering
4. actions and decisions panel
5. agent interruption
6. persistence polish

## 22. Risks and Mitigations

### Risk: inaccurate extraction

Mitigation:

* keep graph conceptual
* only add confident relationships
* show AI as assistive, not authoritative

### Risk: event spam

Mitigation:

* batch updates into patches every few seconds
* throttle interruptions heavily

### Risk: graph clutter

Mitigation:

* dedupe nodes
* use simplified labels
* hide weak relationships

### Risk: over-scoping

Mitigation:

* ship one-room demo only
* no advanced analytics
* no cross-meeting UI unless time remains

## 23. Demo Script

### Setup

Two teammates discuss a system design problem.

### During demo

* transcript appears live
* graph builds with systems, people, and dependencies
* decisions and actions populate
* AI interrupts once with a contradiction or missing ownership

### Closing line

“Instead of leaving meetings with scattered notes, teams leave with structured knowledge they can actually use.”

## 24. Why This Can Win

* visually impressive
* easy to understand quickly
* feels active instead of passive
* strongly aligned to Live Agent theme
* combines speech, reasoning, visualization, and interaction
* has a credible startup path beyond the hackathon

## 25. Build Checklist

### Product

* [ ] final project name
* [ ] final pitch sentence
* [ ] final demo scenario

### Frontend

* [ ] Next.js app shell
* [ ] transcript panel
* [ ] graph panel
* [ ] insights panel
* [ ] React Flow integration

### Backend

* [ ] transcript intake
* [ ] chunking logic
* [ ] LLM extraction endpoint
* [ ] graph merge logic
* [ ] patch broadcaster

### AI

* [ ] structured extraction prompt
* [ ] output schema validation
* [ ] interruption scoring logic
* [ ] TTS call for agent voice

### Data

* [ ] session schema
* [ ] graph schema
* [ ] event schema

### Deploy

* [ ] GCP frontend deploy
* [ ] Cloud Run deploy
* [ ] Gemini API credentials
* [ ] env var management

## 26. Immediate Next Steps

1. Lock the stack.
2. Create the monorepo.
3. Define shared TypeScript schemas.
4. Build transcript-only vertical slice.
5. Add extraction endpoint returning mocked graph patches first.
6. Render patches in React Flow.
7. Replace mocked patches with LLM extraction.
8. Add decisions and actions panel.
9. Add one interruption event.
10. Polish the demo.

## 27. Final Positioning Statement

This project reimagines the meeting assistant as an active collaborator. Instead of simply recording and summarizing discussion after the fact, it transforms live conversation into visual, structured, and persistent knowledge that helps teams reason together in real time.
