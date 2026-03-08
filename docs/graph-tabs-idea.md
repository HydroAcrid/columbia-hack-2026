# Graph Tabs Idea

## Summary

Potential future feature: let one meeting session maintain multiple React Flow diagrams, with the UI switching between graph "tabs" when the conversation clearly moves into a different structure or workstream.

This is intentionally deferred. It is high-leverage, but too large and risky to land cleanly during the hackathon push.

## Why it is interesting

- Some conversations naturally split into separate structures:
  - launch plan
  - backend architecture
  - ownership / org map
  - blocker triage
- A single graph can become crowded when unrelated subtopics accumulate in the same canvas.
- Tabs could keep each graph tighter and more legible without deleting prior context.

## Product idea

- One session can own multiple graph views.
- Each view is a separate React Flow canvas with its own nodes, edges, and highlights.
- The system can:
  - continue updating the current tab
  - create a new tab when the topic shifts enough
  - let the user switch back and forth between tabbed diagrams

Example:
- Tab 1: `Launch Plan`
- Tab 2: `Billing / Auth`
- Tab 3: `Owners + Follow-ups`

## How it could work

### 1. Detect topic shifts

The agent would classify each chunk or batch against the current graph context and ask:

- does this belong to the current graph?
- does it fit an existing alternate graph?
- is it strong enough to start a new graph?

Signals for a new tab:

- mostly new entities with little overlap to the current graph
- repeated discussion of a distinct subsystem or planning track
- a switch from architecture talk to launch ops / ownership talk
- a new cluster of edges forming around a different center of gravity

### 2. Keep graph views separate

Each tab would maintain:

- its own node/edge state
- its own highlight history
- its own title
- its own summary of what that tab represents

The session would still keep shared transcript and insights, but graph updates would be routed to one tab at a time.

### 3. UI behavior

Recommended UI:

- compact tab strip above the graph
- AI-created tab titles, editable by the user later
- active tab gets live updates
- previous tabs stay frozen until relevant again

Important:

- do not auto-switch tabs too aggressively
- if confidence is weak, stay on the current tab
- creating a new tab should feel rare and justified

## Why we are deferring it

- It changes the mental model from "one meeting, one graph" to "one meeting, many graph views".
- It requires a stronger routing layer for graph patches.
- It creates new UX questions:
  - when to create a tab
  - when to merge tabs
  - when to re-use an old tab
  - how users understand why the AI moved to another tab
- It is easy to make the demo feel unstable if tabs appear too often or split the wrong way.

## What would need to change

### Agent

- graph patch generation would need a target graph/view ID
- extraction context would need to consider multiple existing graph views
- tab creation logic would need confidence thresholds and naming

### Session model

- session state would need `graphViews[]` instead of one `nodes/edges` pair
- each view would need:
  - `id`
  - `title`
  - `nodes`
  - `edges`
  - `createdAt`
  - `lastActiveAt`

### Frontend

- tab strip above the graph
- active graph view selector
- graph rendering based on active tab
- UX for new-tab creation events

## Best v1 shape later

If we build this later, the safest v1 is:

- max 2-3 tabs
- only create a new tab on high confidence
- never auto-delete tabs
- keep transcript and insights session-global
- let graph tabs be a derived visualization layer, not separate meetings

## Current recommendation

Do not build this before the demo.

Better short-term investments are:

- stronger graph canonicalization
- better graph containment / dedupe
- better insight quality
- deployed live-path reliability

Those improve the core demo immediately without introducing a second-order UX risk.
