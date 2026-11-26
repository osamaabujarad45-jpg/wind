# Start here: finish Wind safely

For current work, read `AGENTS.md`, `docs/CURRENT-WORK.md`, then `docs/PLAN-2026-11-26-CONTINUE.md`. That plan reconciles the older task designs and identifies the active branch and acceptance gaps. Routine delivery uses the standing review-gated approval in `AGENTS.md`; the historical permission wording below does not override it.

## Historical handoff — 29 October 2026

The material below was prepared against `85b5a3a`. Use it as historical requirements/evidence, reconciling each task with the current continuation plan before implementation. It is not authorization to deploy, commit, push, charge money or send messages.

## Paste this prompt into the implementing agent

> Implement the next unblocked task in tasks/todo.md following tasks/plan.md. First inspect current HEAD and git status, then re-read the named source symbols and current tests. Do not treat historical reviews as current bugs. Keep each change to five files or fewer; if necessary, create numbered child tasks before expanding. Reproduce a defect before fixing it. Preserve authorization, idempotency, custody, money and provider feature gates. Use the existing libraries and patterns; read SDK 57 documentation before Expo/React Native API changes. Run focused tests, lint and both typechecks. Record actual commands, host, revision and results in tasks/evidence.md. Mark a task complete only when every acceptance criterion has evidence; a skipped device/provider test means blocked acceptance. Continue to the next eligible task. Ask only for access, credentials, necessary business decisions or final approval of a concrete irreversible/outward action. Never use an emulator or simulator, never clear Chrome's profile, and never mistake mocks for field evidence.

## Session handback template

- Revision and files changed:
- Task IDs completed / partially complete / blocked:
- Issue → change → verification:
- Commands, exit codes, execution host:
- Physical-device evidence and native build ID, if applicable:
- Provider evidence (fixture / staging / real approved test):
- Remaining risk or dependency:
- Next exact task and first command:

No secrets, phone numbers, tracking tokens or customer GPS in the handback. Preserve concurrent edits. A command that failed or was skipped must remain visible in the evidence.
