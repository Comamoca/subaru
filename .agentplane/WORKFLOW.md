---
runner:
  default_adapter: "codex"
  timeouts:
    idle_ms: 180000
    terminate_grace_ms: 1500
    wall_clock_ms: 900000
  trace:
    capture_stderr: true
    compression: "none"
    max_tail_bytes: 65536
    mode: "raw"
    redact_patterns: []
    retention: "keep"
commit:
  dco:
    email: null
    enabled: false
    name: null
  generic_tokens:
    - "start"
    - "status"
    - "mark"
    - "done"
    - "wip"
    - "update"
    - "tasks"
    - "task"
acr:
  default_validation_mode: "local"
  enabled: false
  include_model_identity: "when_known"
  include_prompts: false
  include_tool_outputs: false
  require_for_pr_check: false
  version: "0.1.0"
  write_on_finish: true
approvals:
  require_network: true
  require_plan: true
  require_verify: true
branch:
  task_close_prefix: "task-close"
  task_prefix: "task"
evaluator:
  max_rework_attempts: 3
  required_checks:
    - "agentplane doctor"
    - "node .agentplane/policy/check-routing.mjs"
  verdicts:
    - "pass"
    - "rework"
    - "blocked_external"
    - "human_review"
    - "infra_failed"
    - "no_change"
execution:
  handoff_conditions:
    - "Role boundary reached (for example CODER -> TESTER/REVIEWER)."
    - "Task depends_on prerequisites are incomplete."
    - "Specialized agent is required."
  profile: "balanced"
  reasoning_effort: "medium"
  stop_conditions:
    - "Missing required input blocks correctness."
    - "Requested action expands scope or risk beyond approved plan."
    - "Verification fails and remediation changes scope."
  text_verbosity: "medium"
  tool_budget:
    discovery: 6
    implementation: 10
    verification: 6
  unsafe_actions_requiring_explicit_user_ok:
    - "Destructive git history operations."
    - "Outside-repo read/write."
    - "Credential, keychain, or SSH material changes."
feedback:
  github_issues:
    allow_anonymous_cloud: false
    cloud_endpoint: "https://agentplane.cloud/api/feedback/issues"
    dedupe: true
    enabled: false
    include_insights_report: true
    labels:
      - "agentplane-feedback"
      - "bug"
    prompt_on_internal_error: true
    repository: "basilisk-labs/agentplane"
    transport: "github"
framework:
  cli:
    expected_version: "0.6.13"
  last_update: null
  source: "https://github.com/basilisk-labs/agentplane"
in_scope_paths:
  - "**"
observability:
  events: "jsonl"
  runs_dir: ".agentplane/tasks/<task-id>/runs"
owners:
  orchestrator: "ORCHESTRATOR"
recipes:
  storage_default: "copy"
retry_policy:
  abnormal_backoff: "exponential"
  max_attempts: 5
  normal_exit_continuation: true
scheduler:
  concurrency: 1
  poll_interval_ms: 30000
  retry_policy:
    abnormal_backoff: "exponential"
    max_attempts: 5
    normal_exit_continuation: true
tasks:
  backend:
    config_path: ".agentplane/backends/local/backend.json"
  comments:
    blocked:
      min_chars: 40
      prefix: "Blocked:"
    start:
      min_chars: 40
      prefix: "Start:"
    verified:
      min_chars: 60
      prefix: "Verified:"
  doc:
    required_sections:
      - "Summary"
      - "Scope"
      - "Plan"
      - "Verification"
      - "Rollback Plan"
    sections:
      - "Summary"
      - "Scope"
      - "Plan"
      - "Verify Steps"
      - "Verification"
      - "Rollback Plan"
      - "Findings"
  id_suffix_length_default: 6
  tags:
    fallback_primary: "meta"
    lock_primary_on_update: true
    primary_allowlist:
      - "code"
      - "data"
      - "research"
      - "docs"
      - "ops"
      - "product"
      - "meta"
    strict_primary: false
  verify:
    enforce_on_plan_approve: true
    enforce_on_start_when_no_plan: true
    require_steps_for_primary:
      - "code"
      - "data"
      - "ops"
    require_verification_for_primary:
      - "code"
      - "data"
      - "ops"
    required_tags:
      - "code"
      - "backend"
      - "frontend"
    spike_tag: "spike"
timeouts:
  stall_seconds: 900
version: 2
workflow:
  artifacts_language: "any"
  close_commit:
    direct_dirty_policy: "allow_other_task_readmes"
  closure_commit_requires_approval: false
  commit_automation: "finish_only"
  finish_auto_status_commit: false
  mode: "direct"
  status_commit_policy: "warn"
workspace:
  agents_dir: ".agentplane/agents"
  cleanup: "after_finish"
  isolation: "per_task"
  tasks_path: ".agentplane/tasks.json"
  workflow_dir: ".agentplane/tasks"
  worktrees_dir: ".agentplane/worktrees"
---

## Prompt Template
Repository: subaru
Workflow mode: direct

## Checks
- preflight
- verify
- finish

## Fallback
last_known_good: .agentplane/workflows/last-known-good.md
