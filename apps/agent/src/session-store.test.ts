import test from "node:test";
import assert from "node:assert/strict";
import { stripFirestoreUndefined } from "./session-store.js";

test("strips undefined fields from nested patch payloads before Firestore writes", () => {
  const sanitized = stripFirestoreUndefined({
    addNodes: undefined,
    addEdges: undefined,
    addIssues: [
      {
        id: "i-1",
        text: "Billing is blocked",
        severity: "blocker",
        timestamp: 1,
        note: undefined,
      },
    ],
    highlightNodeIds: ["billing"],
    interruptMessage: undefined,
    nested: {
      owner: undefined,
      value: "kept",
    },
  });

  assert.deepEqual(sanitized, {
    addIssues: [
      {
        id: "i-1",
        text: "Billing is blocked",
        severity: "blocker",
        timestamp: 1,
      },
    ],
    highlightNodeIds: ["billing"],
    nested: {
      value: "kept",
    },
  });
});
