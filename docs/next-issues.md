# Next Issues

## 2. Graph intelligence + identity stability

### Problem statement
- The graph still depends too much on explicit phrasing and misses obvious implied ownership, responsibility, and person-to-node relationships.
- Person identity can drift across the transcript and graph, especially when the same speaker is referenced indirectly over time.
- Name extraction is still too permissive and can turn first-person action phrases such as `I'm gonna do` into false names like `Gonna Do`.

### Implementation
- Tighten self-identification parsing so first-person action phrases and work-description phrases cannot be interpreted as names.
- Extend canonical `SpeakerProfile` with `personNodeId?: string` so canonical speakers resolve to stable graph person nodes.
- Enrich live extraction context with canonical speaker-to-person bindings, stable speaker-labeled transcript lines, and a larger relevant transcript window.
- Add deterministic post-processing for first-person ownership statements so known speakers saying `I'll own`, `I'm responsible for`, `my work is`, or similar language bind to the correct person node even when the model misses the implicit owner.
- Stabilize person/node linking so repeated mentions from the same canonical speaker update the same person node and related edges instead of creating new or drifting entities.

### Acceptance checks
- A transcript containing `So my work what I'm gonna do is...` does not create or update a person named `Gonna Do`.
- When a known speaker says they own or are responsible for something, the resulting graph ties that work to the correct stable person node without requiring their name to be restated.
- Repeated conversation about the same person across several turns keeps the same person node and stable related edges.

### Rollout notes
- Ship behind the existing live extraction pipeline without changing external APIs.
- Verify prompt-cost impact after the richer context is added.
- Capture before/after transcripts from real live sessions, not only replay fixtures.

## 3. Cricket speed

### Problem statement
- Cricket takes too long to become audible after an `interruptMessage` arrives.
- The current path waits on server TTS before playback unless the request fails, which adds noticeable delay.
- We need faster audible response without creating duplicate or jarring voice swaps.

### Implementation
- Use a hybrid live voice path: start browser speech immediately when `interruptMessage` arrives and request Gemini TTS in parallel.
- Upgrade to Gemini audio only if it arrives within a short early window before playback is materially underway; otherwise let browser speech finish cleanly.
- Reuse the Gemini client and voice configuration on the agent instead of creating avoidable per-request setup overhead.
- Prewarm the browser `AudioContext` and add timing logs for `interruptMessage received`, `TTS request start`, `audio ready`, and `audible playback start`.

### Acceptance checks
- Measured `interruptMessage received -> audible start` is materially faster than the current behavior.
- Cricket never double-speaks the same answer.
- Gemini audio does not cut over mid-sentence once browser speech is already clearly underway.

### Rollout notes
- Keep `/tts` backward-compatible in this phase.
- Log latency metrics in development and staging before tuning thresholds.
- Validate with short and long Cricket responses because the upgrade window will behave differently by utterance length.
