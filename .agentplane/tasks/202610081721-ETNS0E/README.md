---
id: "202610081721-ETNS0E"
title: "Trap process exit inside the execution worker"
result_summary: "Exits from executed programs are trapped in the worker and reported as a result; output is preserved on failure and timeout; the CLI exits with the program's status."
status: "DONE"
priority: "high"
owner: "CODER"
revision: 11
origin:
  system: "manual"
depends_on: []
tags:
  - "code"
verify: []
plan_approval:
  state: "approved"
  updated_at: "2026-10-08T17:39:46.989Z"
  updated_by: "ORCHESTRATOR"
  note: null
verification:
  state: "ok"
  updated_at: "2026-10-08T17:44:20.867Z"
  updated_by: "CODER"
  note: "All 5 Verify Steps pass on main: full suite 86/86 (incl. test/worker_exit_test.ts), birdie --help prints its help and exits 0 from a Gleam project, birdie version reports 'Program exited with status 1' with output kept, the --code exit repro prints only 'before exit', sqlode still reports v0.34.0."
  attempts: 0
quality_review:
  state: "pass"
  updated_at: "2026-10-08T17:44:48.117Z"
  updated_by: "EVALUATOR"
  note: "Program exit is trapped in the worker: exit() from node:process no longer kills the worker, the status is reported, and captured output survives failures and timeouts."
  evaluated_sha: "6828bae0b998d7a4176c69cba9907f740a98e9d9"
  blueprint_digest: "c89504bbc516c5f62634e11fe02155139700adcbbb2a9e38a7288fe34c50eee2"
  evidence_refs:
    - ".agentplane/tasks/202610081721-ETNS0E/README.md"
    - ".agentplane/tasks/202610081721-ETNS0E/quality/20261008-174448117-recovery-context/quality-report.json"
    - ".agentplane/tasks/202610081721-ETNS0E/quality/20261008-174448117-recovery-context/evaluator-prompt.md"
    - ".agentplane/tasks/202610081721-ETNS0E/quality/20261008-174448117-recovery-context/evaluator-opinion.md"
    - ".agentplane/tasks/202610081721-ETNS0E/blueprint/resolved-snapshot.json"
    - "test/worker_exit_test.ts; deno test --allow-all --unstable-worker-options --unstable-raw-imports test/ (86 passed, 0 failed)"
  findings:
    - "node:process imports are pointed at a subaru shim (_ffi/_subaru/process.mjs); Deno.exit is replaced in the worker; RunResult carries exitCode; the CLI prints output on failure and exits with the program's status."
commit:
  hash: "6828bae0b998d7a4176c69cba9907f740a98e9d9"
  message: "fix(worker): trap program exit instead of losing the worker"
comments:
  -
    author: "CODER"
    body: "Start: implement the worker exit trap fix in worktree fix/worker-exit-trap."
  -
    author: "CODER"
    body: "Verified: all 5 Verify Steps pass on main (full suite 86/86 including test/worker_exit_test.ts; birdie --help prints its help and exits 0 from a Gleam project; birdie version reports 'Program exited with status 1' with output kept; the --code exit repro prints only 'before exit'; sqlode still reports v0.34.0); implementation commit 6828bae."
events:
  -
    type: "status"
    at: "2026-10-08T17:22:12.143Z"
    author: "CODER"
    from: "TODO"
    to: "DOING"
    note: "Start: implement the worker exit trap fix in worktree fix/worker-exit-trap."
  -
    type: "verify"
    at: "2026-10-08T17:44:20.867Z"
    author: "CODER"
    state: "ok"
    note: "All 5 Verify Steps pass on main: full suite 86/86 (incl. test/worker_exit_test.ts), birdie --help prints its help and exits 0 from a Gleam project, birdie version reports 'Program exited with status 1' with output kept, the --code exit repro prints only 'before exit', sqlode still reports v0.34.0."
  -
    type: "status"
    at: "2026-10-08T17:44:48.736Z"
    author: "CODER"
    from: "DOING"
    to: "DONE"
    note: "Verified: all 5 Verify Steps pass on main (full suite 86/86 including test/worker_exit_test.ts; birdie --help prints its help and exits 0 from a Gleam project; birdie version reports 'Program exited with status 1' with output kept; the --code exit repro prints only 'before exit'; sqlode still reports v0.34.0); implementation commit 6828bae."
doc_version: 3
doc_updated_at: "2026-10-08T17:44:48.738Z"
doc_updated_by: "CODER"
description: "A Gleam CLI that calls process.exit (via node:process) silently kills the subaru worker; the runner then waits for the full timeout and discards captured output. Trap exit in the worker so the run reports a result, and keep captured output visible on failure/timeout paths."
sections:
  Summary: |-
    Trap process exit inside the execution worker

    A Gleam CLI that calls process.exit (via node:process) silently kills the subaru worker; the runner then waits for the full timeout and discards captured output. Trap exit in the worker so the run reports a result, and keep captured output visible on failure/timeout paths.
  Scope: |-
    - In scope: A Gleam CLI that calls process.exit (via node:process) silently kills the subaru worker; the runner then waits for the full timeout and discards captured output. Trap exit in the worker so the run reports a result, and keep captured output visible on failure/timeout paths.
    - Out of scope: unrelated refactors not required for "Trap process exit inside the execution worker".
  Plan: |-
    1. Trap exits inside src/worker/execution_worker.ts before the program is imported: replace `Deno.exit` with a handler that records the exit code, posts a `result` message to the host, and aborts the program so the worker survives. `node:process`'s `exit` delegates to `Deno.exit`, so this also covers FFI files that do `import { exit } from "node:process"` (verified experimentally).
    2. Teach the worker response/RunResult path about the exit code so a non-zero exit is reported as a failure instead of a silent success.
    3. Keep captured output visible: print the collected output lines in src/cli.ts even when the run fails or times out, instead of dropping them.
    4. Add regression coverage: a runner test that executes a program calling the process exit external and asserts it completes without hitting the timeout, and a worker-level test for the trap itself.
  Verify Steps: |-
    1. Run `deno test --allow-all --unstable-worker-options --unstable-raw-imports test/`. Expected: 81+ passed, 0 failed, including the new exit-trap regression tests in test/worker_exit_test.ts.
    2. From a directory that contains a `gleam.toml` (birdie's own `find_root` loops forever when it cannot find a project root, which is unrelated to this fix), run `deno run --allow-all --unstable-worker-options --unstable-raw-imports src/cli.ts --git https://github.com/giacomocavalieri/birdie --ref main -- --help`. Expected: birdie's usage text is printed, the exit status is 0, and the run returns in seconds instead of hanging until the timeout.
    3. From the same directory, run the same command with `-- version` (an invalid subcommand). Expected: birdie's error text is still printed and the run fails with `Program exited with status 1`, proving a non-zero exit is reported and its output is kept.
    4. Run `deno run --allow-all --unstable-worker-options --unstable-raw-imports src/cli.ts --code 'import gleam/io

    @external(javascript, "node:process", "exit")
    pub fn exit(code: Int) -> Nil

    pub fn main() {
      io.println("before exit")
      exit(0)
      io.println("after exit")
    }'`. Expected: prints `before exit` (not `after exit`) and completes without a timeout.
    5. Run `deno run --allow-all --unstable-worker-options --unstable-raw-imports src/cli.ts --git https://github.com/nao1215/sqlode --ref main -- version`. Expected: `sqlode v0.34.0`, proving normal programs are unaffected.
  Verification: |-
    <!-- BEGIN VERIFICATION RESULTS -->
    ### 2026-10-08T17:44:20.867Z — VERIFY — ok

    By: CODER

    Note: All 5 Verify Steps pass on main: full suite 86/86 (incl. test/worker_exit_test.ts), birdie --help prints its help and exits 0 from a Gleam project, birdie version reports 'Program exited with status 1' with output kept, the --code exit repro prints only 'before exit', sqlode still reports v0.34.0.
    Attempts: 0

    VerifyStepsRef: doc_version=3, doc_updated_at=2026-10-08T17:39:46.433Z, excerpt_hash=sha256:cd1ae75d2ed2db57faa3b55fc0f10f3957e70ae239cbc2ea6171fd344d712948

    Details:

    BlueprintSnapshotRef:
    - state: current
    - path: /home/coma/.ghq/github.com/Comamoca/subaru/.agentplane/tasks/202610081721-ETNS0E/blueprint/resolved-snapshot.json
    - old_digest: c89504bbc516c5f62634e11fe02155139700adcbbb2a9e38a7288fe34c50eee2
    - current_digest: c89504bbc516c5f62634e11fe02155139700adcbbb2a9e38a7288fe34c50eee2
    - route_changed: no
    - safe_command: agentplane blueprint snapshot 202610081721-ETNS0E

    <!-- END VERIFICATION RESULTS -->
  Rollback Plan: |-
    - Revert task-related commit(s).
    - Re-run required checks to confirm rollback safety.
  Findings: ""
id_source: "generated"
---
## Summary

Trap process exit inside the execution worker

A Gleam CLI that calls process.exit (via node:process) silently kills the subaru worker; the runner then waits for the full timeout and discards captured output. Trap exit in the worker so the run reports a result, and keep captured output visible on failure/timeout paths.

## Scope

- In scope: A Gleam CLI that calls process.exit (via node:process) silently kills the subaru worker; the runner then waits for the full timeout and discards captured output. Trap exit in the worker so the run reports a result, and keep captured output visible on failure/timeout paths.
- Out of scope: unrelated refactors not required for "Trap process exit inside the execution worker".

## Plan

1. Trap exits inside src/worker/execution_worker.ts before the program is imported: replace `Deno.exit` with a handler that records the exit code, posts a `result` message to the host, and aborts the program so the worker survives. `node:process`'s `exit` delegates to `Deno.exit`, so this also covers FFI files that do `import { exit } from "node:process"` (verified experimentally).
2. Teach the worker response/RunResult path about the exit code so a non-zero exit is reported as a failure instead of a silent success.
3. Keep captured output visible: print the collected output lines in src/cli.ts even when the run fails or times out, instead of dropping them.
4. Add regression coverage: a runner test that executes a program calling the process exit external and asserts it completes without hitting the timeout, and a worker-level test for the trap itself.

## Verify Steps

1. Run `deno test --allow-all --unstable-worker-options --unstable-raw-imports test/`. Expected: 81+ passed, 0 failed, including the new exit-trap regression tests in test/worker_exit_test.ts.
2. From a directory that contains a `gleam.toml` (birdie's own `find_root` loops forever when it cannot find a project root, which is unrelated to this fix), run `deno run --allow-all --unstable-worker-options --unstable-raw-imports src/cli.ts --git https://github.com/giacomocavalieri/birdie --ref main -- --help`. Expected: birdie's usage text is printed, the exit status is 0, and the run returns in seconds instead of hanging until the timeout.
3. From the same directory, run the same command with `-- version` (an invalid subcommand). Expected: birdie's error text is still printed and the run fails with `Program exited with status 1`, proving a non-zero exit is reported and its output is kept.
4. Run `deno run --allow-all --unstable-worker-options --unstable-raw-imports src/cli.ts --code 'import gleam/io

@external(javascript, "node:process", "exit")
pub fn exit(code: Int) -> Nil

pub fn main() {
  io.println("before exit")
  exit(0)
  io.println("after exit")
}'`. Expected: prints `before exit` (not `after exit`) and completes without a timeout.
5. Run `deno run --allow-all --unstable-worker-options --unstable-raw-imports src/cli.ts --git https://github.com/nao1215/sqlode --ref main -- version`. Expected: `sqlode v0.34.0`, proving normal programs are unaffected.

## Verification

<!-- BEGIN VERIFICATION RESULTS -->
### 2026-10-08T17:44:20.867Z — VERIFY — ok

By: CODER

Note: All 5 Verify Steps pass on main: full suite 86/86 (incl. test/worker_exit_test.ts), birdie --help prints its help and exits 0 from a Gleam project, birdie version reports 'Program exited with status 1' with output kept, the --code exit repro prints only 'before exit', sqlode still reports v0.34.0.
Attempts: 0

VerifyStepsRef: doc_version=3, doc_updated_at=2026-10-08T17:39:46.433Z, excerpt_hash=sha256:cd1ae75d2ed2db57faa3b55fc0f10f3957e70ae239cbc2ea6171fd344d712948

Details:

BlueprintSnapshotRef:
- state: current
- path: /home/coma/.ghq/github.com/Comamoca/subaru/.agentplane/tasks/202610081721-ETNS0E/blueprint/resolved-snapshot.json
- old_digest: c89504bbc516c5f62634e11fe02155139700adcbbb2a9e38a7288fe34c50eee2
- current_digest: c89504bbc516c5f62634e11fe02155139700adcbbb2a9e38a7288fe34c50eee2
- route_changed: no
- safe_command: agentplane blueprint snapshot 202610081721-ETNS0E

<!-- END VERIFICATION RESULTS -->

## Rollback Plan

- Revert task-related commit(s).
- Re-run required checks to confirm rollback safety.

## Findings
