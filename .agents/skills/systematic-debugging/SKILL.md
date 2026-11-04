---
name: systematic-debugging
description: Use when encountering any bug, test failure, or unexpected behavior, before proposing fixes
source: https://raw.githubusercontent.com/obra/superpowers/refs/heads/main/skills/systematic-debugging/SKILL.md
---
<!-- Last updated: 2026-11-03 (restructured into main file + references/; LLM model not recorded) -->

# Systematic Debugging

A root-cause-first debugging process for any technical issue: test failures,
production bugs, unexpected behavior, performance problems, build failures,
integration issues. It enforces a strict four-phase sequence —
root cause investigation → pattern analysis → hypothesis and testing →
implementation — so that fixes always target the cause, never the symptom.

## Core principle

**ALWAYS find root cause before attempting fixes. Symptom fixes are
failure.**

**Violating the letter of this process is violating the spirit of
debugging.**

## The Iron Law

```
NO FIXES WITHOUT ROOT CAUSE INVESTIGATION FIRST
```

If you haven't completed Phase 1, you cannot propose fixes.

## When to use

Use for ANY technical issue, including:

- Test failures
- Bugs in production
- Unexpected behavior
- Performance problems
- Build failures
- Integration issues

**Use this ESPECIALLY when:**

- Under time pressure (emergencies make guessing tempting)
- "Just one quick fix" seems obvious
- You've already tried multiple fixes
- Previous fix didn't work
- You don't fully understand the issue

**Don't skip when:**

- Issue seems simple (simple bugs have root causes too)
- You're in a hurry (rushing guarantees rework)
- Manager wants it fixed NOW (systematic is faster than thrashing)

## The Four Phases

You MUST complete each phase before proceeding to the next.

| Phase | Key Activities | Success Criteria |
| ----- | -------------- | ---------------- |
| **1. Root Cause** | Read errors, reproduce, check changes, gather evidence | Understand WHAT and WHY |
| **2. Pattern** | Find working examples, compare | Identify differences |
| **3. Hypothesis** | Form theory, test minimally | Confirmed or new hypothesis |
| **4. Implementation** | Create test, fix, verify | Bug resolved, tests pass |

Phase details:

- **Phase 1: Root Cause Investigation** — read error messages carefully,
  reproduce consistently, check recent changes, add diagnostic
  instrumentation at component boundaries in multi-component systems, trace
  data flow backward when the error is deep in the call stack:
  [references/phase-1-root-cause.md](references/phase-1-root-cause.md)
- **Phase 2: Pattern Analysis** — find working examples in the same codebase,
  compare against references COMPLETELY, identify every difference,
  understand dependencies:
  [references/phase-2-pattern-analysis.md](references/phase-2-pattern-analysis.md)
- **Phase 3: Hypothesis and Testing** — form a single stated hypothesis,
  test it with the smallest possible change (one variable at a time), verify
  before continuing, say "I don't know" when you don't:
  [references/phase-3-hypothesis.md](references/phase-3-hypothesis.md)
- **Phase 4: Implementation** — create a failing test case (MUST have before
  fixing), implement ONE fix for the root cause, verify the fix, and the
  mandatory escalation when 3+ fixes have failed (question the
  architecture, discuss with your human partner before Fix #4):
  [references/phase-4-implementation.md](references/phase-4-implementation.md)

## Discipline and failure detection

Read these before and while running the skill — they define how to catch
yourself (and your human partner) going off-process:

- **Red flags and signals** — the internal thoughts and human redirections
  that mean: STOP, return to Phase 1; plus the 3+ failed fixes rule:
  [references/red-flags-and-signals.md](references/red-flags-and-signals.md)
- **Common rationalizations** — excuse-by-excuse table of the ways this
  process gets skipped, and the reality each one hides:
  [references/rationalizations.md](references/rationalizations.md)

## When process reveals "no root cause"

If systematic investigation reveals the issue is truly environmental,
timing-dependent, or external: complete the process, document what you
investigated, implement appropriate handling (retry, timeout, error
message), and add monitoring/logging for future investigation.

**But:** 95% of "no root cause" cases are incomplete investigation.

## Supporting techniques

These techniques are part of systematic debugging and live in this
directory's `references/` folder:

- [**`root-cause-tracing.md`**](references/root-cause-tracing.md) — trace
  bugs backward through the call stack to find the original trigger. Read
  when the error appears deep in the call stack (Phase 1, step 5).
- [**`defense-in-depth.md`**](references/defense-in-depth.md) — add
  validation at multiple layers after finding the root cause. Read when
  implementing or verifying the fix (Phase 4).
