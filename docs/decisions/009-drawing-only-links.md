# 009 — Drawing-only links over refusing what the simulator can't run

## Context

People draw architecture the way they would in draw.io: arrows both ways, a line from the database back to the API for replication, a note pointing at a component, two lines between the same boxes for reads and writes. The simulator needs something stricter. Requests flow one way, the graph must not loop, nothing flows into the clients, and two traffic links between the same pair would double-count calls.

The first editor simply refused those connections. It felt broken: you could see the line you wanted, and the tool said no.

## Options

- **Refuse invalid links.** Simple and correct, and it fights the user.
- **Let the engine handle loops and bidirectional traffic.** That means iterating a cyclic flow to a fixed point every tick, which costs determinism, speed and explainability, all for lines most people draw as documentation.
- **Accept every line, but classify it.** Links the engine can run carry traffic; the rest are drawing-only.

## Decision

Every link has a `kind`: `traffic` (the default) or `annotation`. When a link is drawn, reconnected or reversed, [`trafficLinkProblem`](../../src/core/graph.ts) checks it against the traffic graph. Self-links, links into a client, duplicates, links to notes and zones, and anything that would close a loop are kept as drawing-only, and the editor says why in one line. Users can switch a link either way from its panel; switching to traffic re-checks it.

Arrowheads, labels, bends, line style, notes and zones are all UI-only fields. [`simulatedDesign`](../../src/core/graph.ts) strips drawing-only links and annotations at the engine's boundary: the simulation, validation, the reviewer, scenarios and the server's re-run all start from it.

## Consequences

- You can draw anything and still press Play. A test proves a design covered in loops, notes, zones and double-headed arrows scores exactly the same as the plain one.
- Arrowheads are visual. A traffic link with arrows at both ends still carries requests from its source to its target, and the panel says so. That's a deliberate simplification: request and response are one round trip in the model.
- Drawing-only links look different (dashed, muted) so the two are never confused, and hovering one says "not simulated".
- Saved designs gain optional fields, but older designs load unchanged, and the edge function ignores the new ones.
