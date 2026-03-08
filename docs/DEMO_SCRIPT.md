# Nota Demo Script

This is the recommended live demo for the current product.

The app is `Nota`.
The assistant is `Cricket`.

The best story is to talk about Nota itself, because that naturally produces:
- people and ownership
- systems and tech stack
- milestones
- blockers and risks
- actions and decisions
- a strong Cricket Q&A moment at the end

## Goal

Show this sequence clearly:
1. live transcript appears
2. graph builds from the conversation
3. insights panel captures actions, blockers, and decisions
4. Cricket answers a question using the meeting context

## Roles

- `Kevin`: product/demo driver
- `Nelly`: technical narrator and second speaker

## Recommended Setup

- Use `Live` mode, not replay, as the main path.
- Keep replay available only as backup.
- Start with the graph and insights visible.
- Speak clearly and pause for a beat between major lines.
- Do not trigger Cricket until enough meeting context exists.

## Pre-Demo Check

- Open the deployed app.
- Confirm transcript is updating.
- Confirm graph updates appear within a couple seconds.
- Confirm the insights panel is visible on the right.
- Confirm Cricket voice mode works once before presenting.

## Main Script

### Opening

`Kevin`

"We built Nota to turn live project conversations into a shared visual map of what matters."

`Nelly`

"As we talk, Nota is generating a diagram in real time and extracting actions, blockers, and decisions into the operator brief."

### Establish the Product

`Kevin`

"The product we’re building is called Nota, and the assistant inside it is called Cricket."

`Nelly`

"The point is that teams should not leave meetings with scattered notes. They should leave with a structured graph, ownership, and next steps."

### Establish the Stack

`Kevin`

"On the frontend, we’re using Next.js with React Flow to render the live diagram."

`Nelly`

"On the backend, we run the agent on Google Cloud Run, and Firestore stores the session state."

`Kevin`

"For live transcription, we use Deepgram because we need speaker-aware transcription and diarization."

`Nelly`

"For intelligence, we use Gemini to extract graph structure, decisions, actions, issues, and Cricket’s spoken responses."

### Establish People and Ownership

`Kevin`

"I’m Kevin, and I’m owning the product flow, deployment setup, and the final demo orchestration."

`Nelly`

"I’m Nelly, and I’m owning the voice interaction experience and the assistant behavior."

### Establish Concrete Project Structure

`Kevin`

"One milestone is getting the deployed live demo stable for presentation tonight."

`Nelly`

"One action item is that Kevin finalizes the demo runbook and deployment checks."

`Kevin`

"Another action item is that Nelly validates the final end-to-end voice rehearsal."

### Establish Blockers and Risks

`Nelly`

"A blocker we had earlier was that live transcription was still tied to a localhost websocket path, which broke the deployed flow."

`Kevin`

"We fixed that by routing the live speech-to-text path through the agent service instead of a local-only websocket."

`Nelly`

"Another risk is that graph extraction can get noisy or slow if the model creates duplicate systems or weak edges."

`Kevin`

"So we tightened the graph engine to reuse canonical entities, suppress weak structure, and keep the diagram clean."

### Establish One More Concrete Technical Detail

`Nelly`

"We also improved speaker identity inference, so if someone explicitly says their name, Nota can lock that speaker identity with much more stability."

## Cricket Moment

Pause for a second so the graph and insights settle.

Then ask Cricket direct, context-rich questions.

`Kevin`

"Cricket, who owns what right now?"

Pause for Cricket to answer.

`Nelly`

"Cricket, what blockers or risks are still active?"

Pause for Cricket to answer.

`Kevin`

"Cricket, what are we still missing before demo time?"

## Closing

`Kevin`

"That’s Nota: a live conversation becomes a diagram, a structured operator brief, and a real meeting assistant."

`Nelly`

"Instead of manually summarizing after the fact, the meeting becomes usable knowledge while it is happening."

## What This Script Should Trigger

- `person` nodes:
  - Kevin
  - Nelly
- `system` nodes:
  - Nota
  - Deepgram
  - Gemini
  - Google Cloud Run
  - Firestore
  - React Flow
- `milestone` node:
  - deployed live demo / demo tonight
- insights:
  - action items for Kevin and Nelly
  - blocker about the old localhost websocket path
  - risk around graph noise / latency
  - decisions or commitments around routing/fixes

## Delivery Notes

- Keep sentences explicit and concrete.
- Prefer real nouns over vague phrases like `backend stuff` or `database thing`.
- If you want something in the graph, name the actual system.
- Do not trigger Cricket too early.
- Let the audience watch the graph for a few seconds before the first Cricket question.

## Backup Path

If live mode becomes unreliable:
- switch to replay
- narrate the graph and insights manually
- keep the same product story: Nota organizes the meeting, and Cricket is the assistant layer

## Fast Version

If you only have 45 to 60 seconds:

`Kevin`

"We built Nota to turn live project conversations into a structured diagram and operator brief."

`Nelly`

"As we talk, it extracts systems, owners, blockers, and actions in real time."

`Kevin`

"We use Deepgram for live diarized transcription and Gemini for extraction and Cricket responses."

`Nelly`

"I own the voice assistant layer, and Kevin owns product flow and demo orchestration."

`Kevin`

"Our milestone is stabilizing the deployed demo tonight, and our last risk was the live websocket path, which we fixed."

`Nelly`

"Cricket, what blockers are still active?"

