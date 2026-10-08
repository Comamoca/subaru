---
id: "202610081656-WVH3QV"
title: "Add --unstable-raw-imports to deno tasks"
result_summary: "deno tasks run on Deno 2.4.5: cli/check/test/compile all green (verified, merged afe78e3)."
status: "DONE"
priority: "high"
owner: "CODER"
revision: 9
origin:
  system: "manual"
depends_on: []
tags:
  - "code"
task_kind: "code"
mutation_scope: "code"
verify:
  - "deno task check"
  - "deno task cli --help"
plan_approval:
  state: "approved"
  updated_at: "2026-10-08T16:56:01.846Z"
  updated_by: "ORCHESTRATOR"
  note: null
verification:
  state: "ok"
  updated_at: "2026-10-08T17:10:09.702Z"
  updated_by: "CODER"
  note: "All 4 Verify Steps pass: deno task cli --help exits 0, deno task check exits 0 (after the glob repair), deno task test 81/0, deno task compile builds a binary that reports Subaru v1.0.0."
  attempts: 0
quality_review:
  state: "pass"
  updated_at: "2026-10-08T17:10:42.764Z"
  updated_by: "EVALUATOR"
  note: "Deno 2.4.5 blocked every TS-executing task on the text import attribute; the fix adds --unstable-raw-imports to exactly those tasks, repairs the never-matching examples glob, and unblocks type checking of the examples."
  evaluated_sha: "daba6ee16bb398a851a3f47e755fecc7b72ffce4"
  blueprint_digest: "b6d31443f00153590c347e0e7c8275c0b8a179f22cdc7517b5faf08ef9684b68"
  evidence_refs:
    - ".agentplane/tasks/202610081656-WVH3QV/README.md"
    - ".agentplane/tasks/202610081656-WVH3QV/quality/20261008-171042764-recovery-context/quality-report.json"
    - ".agentplane/tasks/202610081656-WVH3QV/quality/20261008-171042764-recovery-context/evaluator-prompt.md"
    - ".agentplane/tasks/202610081656-WVH3QV/quality/20261008-171042764-recovery-context/evaluator-opinion.md"
    - ".agentplane/tasks/202610081656-WVH3QV/blueprint/resolved-snapshot.json"
    - "deno task check"
  findings:
    - "deno task cli/compile/test/check died before any work with 'import attribute type of text is unsupported'; check also globbed examples/*.ts, a path that never existed."
commit:
  hash: "daba6ee16bb398a851a3f47e755fecc7b72ffce4"
  message: "Merge task 202610081656-GRRRP8: ignore local dist build output"
comments:
  -
    author: "CODER"
    body: "Start: Add --unstable-raw-imports to deno tasks. Guided shortcut created the task, approved the plan, and entered execution."
  -
    author: "CODER"
    body: "Verified: all TS-executing deno tasks now carry --unstable-raw-imports; deno task check exits 0 (glob repaired to examples/typescript/*.ts, 4 unknown catch variables narrowed), deno task test 81 passed / 0 failed, deno task compile produces a working binary. Merged to main as afe78e3; evaluator verdict pass."
events:
  -
    type: "status"
    at: "2026-10-08T16:56:01.851Z"
    author: "CODER"
    from: "TODO"
    to: "DOING"
    note: "Start: Add --unstable-raw-imports to deno tasks. Guided shortcut created the task, approved the plan, and entered execution."
  -
    type: "verify"
    at: "2026-10-08T17:10:09.702Z"
    author: "CODER"
    state: "ok"
    note: "All 4 Verify Steps pass: deno task cli --help exits 0, deno task check exits 0 (after the glob repair), deno task test 81/0, deno task compile builds a binary that reports Subaru v1.0.0."
  -
    type: "status"
    at: "2026-10-08T17:11:43.739Z"
    author: "CODER"
    from: "DOING"
    to: "DONE"
    note: "Verified: all TS-executing deno tasks now carry --unstable-raw-imports; deno task check exits 0 (glob repaired to examples/typescript/*.ts, 4 unknown catch variables narrowed), deno task test 81 passed / 0 failed, deno task compile produces a working binary. Merged to main as afe78e3; evaluator verdict pass."
doc_version: 3
doc_updated_at: "2026-10-08T17:11:43.740Z"
doc_updated_by: "CODER"
description: "Deno 2.4.5 rejects src/stubs.ts imports with { type: \"text\" } unless --unstable-raw-imports is passed, so deno task cli / compile / test / check all fail before doing any work."
sections:
  Summary: |-
    Add --unstable-raw-imports to deno tasks

    Deno 2.4.5 rejects src/stubs.ts imports with { type: "text" } unless --unstable-raw-imports is passed, so deno task cli / compile / test / check all fail before doing any work.
  Scope: |-
    - In scope: Deno 2.4.5 rejects src/stubs.ts imports with { type: "text" } unless --unstable-raw-imports is passed, so deno task cli / compile / test / check all fail before doing any work.
    - Out of scope: unrelated refactors not required for "Add --unstable-raw-imports to deno tasks".
  Plan: |-
    1. Add --unstable-raw-imports to every deno.json task that executes or type-checks TypeScript from src/ or test/ (help, cli, compile, test, check, example, example:debug, example:preload, init-config).
    2. Leave file-only tasks (fmt, lint, clean*) untouched.
    3. Confirm deno task cli --help and deno task check both run to completion.
  Verify Steps: |-
    1. Run `deno task cli --help`. Expected: subaru usage prints, exit 0 (today it fails with 'import attribute type of text is unsupported').
    2. Run `deno task check`. Expected: type check completes with no import-attribute error.
    3. Run `deno task test`. Expected: 81 passed, 0 failed.
    4. Run `deno task compile` and then `./dist/subaru --version`. Expected: binary builds and reports the subaru version.
  Verification: |-
    <!-- BEGIN VERIFICATION RESULTS -->
    ### 2026-10-08T17:10:09.702Z — VERIFY — ok

    By: CODER

    Note: All 4 Verify Steps pass: deno task cli --help exits 0, deno task check exits 0 (after the glob repair), deno task test 81/0, deno task compile builds a binary that reports Subaru v1.0.0.
    Attempts: 0

    VerifyStepsRef: doc_version=3, doc_updated_at=2026-10-08T16:56:45.629Z, excerpt_hash=sha256:bf280305e55a6c1198a60877fe4024d7db747d03db3b0528b78b8599376e3cf4

    Details:

    BlueprintSnapshotRef:
    - state: current
    - path: /home/coma/.ghq/github.com/Comamoca/subaru/.agentplane/tasks/202610081656-WVH3QV/blueprint/resolved-snapshot.json
    - old_digest: b6d31443f00153590c347e0e7c8275c0b8a179f22cdc7517b5faf08ef9684b68
    - current_digest: b6d31443f00153590c347e0e7c8275c0b8a179f22cdc7517b5faf08ef9684b68
    - route_changed: no
    - safe_command: agentplane blueprint snapshot 202610081656-WVH3QV

    <!-- END VERIFICATION RESULTS -->
  Rollback Plan: |-
    - Revert task-related commit(s).
    - Re-run required checks to confirm rollback safety.
  Findings: ""
id_source: "generated"
---
## Summary

Add --unstable-raw-imports to deno tasks

Deno 2.4.5 rejects src/stubs.ts imports with { type: "text" } unless --unstable-raw-imports is passed, so deno task cli / compile / test / check all fail before doing any work.

## Scope

- In scope: Deno 2.4.5 rejects src/stubs.ts imports with { type: "text" } unless --unstable-raw-imports is passed, so deno task cli / compile / test / check all fail before doing any work.
- Out of scope: unrelated refactors not required for "Add --unstable-raw-imports to deno tasks".

## Plan

1. Add --unstable-raw-imports to every deno.json task that executes or type-checks TypeScript from src/ or test/ (help, cli, compile, test, check, example, example:debug, example:preload, init-config).
2. Leave file-only tasks (fmt, lint, clean*) untouched.
3. Confirm deno task cli --help and deno task check both run to completion.

## Verify Steps

1. Run `deno task cli --help`. Expected: subaru usage prints, exit 0 (today it fails with 'import attribute type of text is unsupported').
2. Run `deno task check`. Expected: type check completes with no import-attribute error.
3. Run `deno task test`. Expected: 81 passed, 0 failed.
4. Run `deno task compile` and then `./dist/subaru --version`. Expected: binary builds and reports the subaru version.

## Verification

<!-- BEGIN VERIFICATION RESULTS -->
### 2026-10-08T17:10:09.702Z — VERIFY — ok

By: CODER

Note: All 4 Verify Steps pass: deno task cli --help exits 0, deno task check exits 0 (after the glob repair), deno task test 81/0, deno task compile builds a binary that reports Subaru v1.0.0.
Attempts: 0

VerifyStepsRef: doc_version=3, doc_updated_at=2026-10-08T16:56:45.629Z, excerpt_hash=sha256:bf280305e55a6c1198a60877fe4024d7db747d03db3b0528b78b8599376e3cf4

Details:

BlueprintSnapshotRef:
- state: current
- path: /home/coma/.ghq/github.com/Comamoca/subaru/.agentplane/tasks/202610081656-WVH3QV/blueprint/resolved-snapshot.json
- old_digest: b6d31443f00153590c347e0e7c8275c0b8a179f22cdc7517b5faf08ef9684b68
- current_digest: b6d31443f00153590c347e0e7c8275c0b8a179f22cdc7517b5faf08ef9684b68
- route_changed: no
- safe_command: agentplane blueprint snapshot 202610081656-WVH3QV

<!-- END VERIFICATION RESULTS -->

## Rollback Plan

- Revert task-related commit(s).
- Re-run required checks to confirm rollback safety.

## Findings
