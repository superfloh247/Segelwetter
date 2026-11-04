---
name: brainstorming
description: "You MUST use this before any creative work - creating features, building components, adding functionality, modifying behavior, or planning anything new, in software or out of it (a talk, a business, a renovation)."
source: https://raw.githubusercontent.com/obra/superpowers/refs/heads/main/skills/brainstorming/SKILL.md
---
<!-- Last updated: 2026-11-03 (restructured into main file + references/; LLM model not recorded) -->

# Brainstorming

You are very good at building. You build what you believe your human
partner wants, and that belief is usually thinner than it feels. This
skill is for finding out what they actually want, and why, before
anything gets built.

People often haven't finished working out what they want. Good questions
help them think it through. When you understand the why, you make the
hundred decisions they never mention the way they would have made them.

## When to use it

Use it before any creative work: creating features, building components,
adding functionality, modifying behavior, or planning anything new, in
software or out of it (a talk, a business, a renovation). It is a
requirements-discovery and design-approval process, not an implementation
technique.

Before you reply, ask yourself: what do I know about what they want, and
why?

- **Everything that matters is in the request** ("make the icon cornflower
  blue"). This is a quick, clear task. Do it, and say what you did — the
  skill does not apply.
- **Something non-trivial is missing.** Start the conversation.

## The workflow

Before you start implementing, you must, in order:

1. Lay out the approaches in a message of their own, and have your
   human partner pick one (see [Lay out the approaches](references/conversation.md)).
2. Write the design doc, short or full (see [Size the Work](references/design-doc.md)).
3. Get their approval of that doc.
4. Invoke the superpowers:writing-plans skill.

Two things aren't implementing: a spike they said yes to (see [Spike to
feel things out](references/conversation.md)), and doing what they asked
once they've opted out of the questions (see [Your First Message](references/opening.md)).

Phases in detail:

- **Opening** — recon before your first message, and how to compose that
  first message (echo + one question, or one question + opt-out offer):
  [references/opening.md](references/opening.md)
- **Conversation** — question discipline, territory to cover, laying out
  approaches, spikes, and playing back what you understand:
  [references/conversation.md](references/conversation.md)
- **Design doc** — sizing the work, what the written design covers, and
  where it goes:
  [references/design-doc.md](references/design-doc.md)
- **Red flags** — rationalizations to catch while running the skill:
  [references/red-flags.md](references/red-flags.md)

## The hard gate

<HARD-GATE>
Nothing gets built until your human partner approves the design doc:
the short one for a small change, the full one for a project.
Building includes writing product code, scaffolding, installing
dependencies, creating projects, and invoking an implementation skill.
Reading and exploring are fine.

Two exceptions. If they opted out of the questions, the skill is done
and the gate goes with it. A spike they said yes to may be built; it
stays labeled throwaway, and keeping what it produced is a new request
that comes back through this gate.

After the design doc is approved, the next step is the plan: invoke
superpowers:writing-plans and no other skill.
</HARD-GATE>
