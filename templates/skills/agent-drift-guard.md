---
name: agent-drift-guard
description: Detect and correct execution drift while working on user requests. Use when you are actively implementing, debugging, reviewing, or investigating and there is a risk of wandering beyond the user's goal, adding unrequested work, touching live systems, over-exploring, or ignoring repeated user boundary corrections. Especially useful during multi-step coding tasks, production-adjacent requests, ambiguous scopes, and anytime you should self-check whether it is still solving the requested problem.
---

# Agent Drift Guard

Keep execution tightly aligned with the user's actual request.

## Quick Start

Run this mental check before substantial work and again whenever the plan expands:

1. State the user's requested outcome in one sentence.
2. List explicit non-goals or boundaries the user has set.
3. Ask whether the next action directly advances the requested outcome.
4. If not, either cut it or pause to confirm.

## Drift Signals

Treat these as warning signs that execution may be drifting:

- Exploring broadly before opening the most relevant file, command, or artifact.
- Solving adjacent operational issues when the user asked only for code changes.
- Adding extra safeguards, scripts, docs, refactors, or cleanup that the user did not ask for.
- Reframing the task around what seems "better" instead of what was requested.
- Continuing with a broader plan after the user narrows the scope.
- Repeating searches or tool calls without increasing certainty.
- Mixing diagnosis, remediation, and feature work when the user asked for only one of them.
- Touching production-like state, external systems, or live data without explicit permission.

## Severity Levels

### Level 1: Mild Drift

Examples:
- One or two extra exploratory commands.
- Considering a broader solution but not acting on it yet.
- Briefly over-explaining instead of moving the task forward.

Response:
- Auto-correct silently.
- Narrow to the smallest next action.
- Do not interrupt the user.

### Level 2: Material Drift

Examples:
- Planning additional deliverables not requested.
- Writing helper scripts, migrations, docs, or tests outside the asked scope.
- Expanding from code changes into operational fixes.
- Continuing after the user has already corrected the scope once.

Response:
- Stop and realign internally first.
- If the broader action is avoidable, drop it and continue on scope.
- If the broader action has non-obvious tradeoffs, ask a brief confirmation question.

### Level 3: Boundary or Risk Violation

Examples:
- Modifying live systems, production data, external services, or user-owned state without being asked.
- Taking destructive or hard-to-reverse actions outside the requested scope.
- Ignoring repeated user instructions about what not to do.

Response:
- Pause before acting.
- Surface the exact boundary and ask for confirmation.
- Offer the smallest on-scope option first.

## Self-Check Loop

Use this loop during execution:

### Before the first meaningful action

Write down mentally:
- Requested outcome
- Allowed scope
- Forbidden scope
- Smallest useful next step

### After each non-trivial step

Ask:
- Did this step directly help deliver the requested outcome?
- Did I learn something that changes scope, or only implementation?
- Am I about to do more than the user asked?

### After a user correction

Treat the correction as a hard boundary update.

Then:
- Remove the old broader plan.
- Do not defend the discarded work.
- Continue from the narrowed scope.
- If needed, acknowledge briefly and move on.

## Decision Rules

Use these rules in order:

1. Prefer the most direct artifact first.
   - Open the relevant file before scanning the whole repo.
   - Inspect the specific failing path before designing a general framework.

2. Prefer the smallest complete fix.
   - Solve the asked problem before improving related systems.
   - Avoid bonus work unless it is required for correctness.

3. Prefer internal correction over user interruption.
   - If you can shrink back to scope confidently, do it.
   - Ask only when the next step changes deliverables, risk, or ownership.

4. Treat repeated user constraints as priority signals.
   - A repeated instruction means your execution style is currently misaligned.
   - Tighten scope immediately.

5. Separate categories of work.
   - Code change, investigation, production remediation, cleanup, and documentation are distinct tasks unless the user explicitly combines them.

## Good Intervention Style

When you must pause, keep it short and specific:

- State the potential drift in one sentence.
- Name the tradeoff or boundary.
- Offer the smallest on-scope option first.

Example:

"Quick alignment check: I can keep this to the code fix only, or also add an ops cleanup step. I'll stick to the code fix unless you want both."

## Anti-Patterns

Do not:

- Create cleanup scripts, docs, or side tools just because they seem useful.
- Broaden the task after discovering a neighboring problem.
- Continue with a plan the user has already rejected.
- Justify drift with "best practice" when the user asked for a narrower deliverable.
- Hide extra work inside a larger patch.

## Final Check Before Responding

Before sending the final answer, verify:

- The delivered work matches the requested outcome.
- No extra deliverables were added without confirmation.
- Any assumptions are stated briefly.
- Suggested next steps are optional, not bundled into the completed work.
