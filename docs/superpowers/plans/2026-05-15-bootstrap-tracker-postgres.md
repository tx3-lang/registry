# Bootstrap tracker Postgres + tracker daemon — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Plan-style note (from project memory):** This plan describes *what* each file should contain (spec, references to copy from, tests, acceptance criteria). The implementing agent writes the actual Terraform / Dockerfile / YAML code. Do NOT expect literal code blocks for the artifacts here — they are intentionally specified, not pre-written.

**Goal:** Ship a Postgres cluster (`telchar-postgres`) and the tracker daemon (`telchar-tracker`) as new Terraform modules under `bootstrap/`, plus a Dockerfile and GHCR publish workflow for the tracker image. After this lands, the cluster repo can consume both modules via a single Terraform module reference each.

**Architecture:** Two new bootstrap modules (`bootstrap/postgres`, `bootstrap/tracker`) following the existing `bootstrap/{backend,frontend,registry}` style (plain `kubernetes_*` resources, no Helm). The Postgres module is a thin wrapper around the Zalando postgres-operator CRD (`acid.zalan.do/v1`), imitating `ext-balius/bootstrap/postgres`. The tracker module is a single Deployment fed by a ConfigMap-rendered `tracker.toml`, with `DATABASE_URL` assembled via Kubernetes native `$(VAR)` env expansion from the operator-generated credentials Secret. No Rust code changes.

**Tech Stack:** Terraform + `hashicorp/kubernetes` provider, Zalando postgres-operator CRD, Spilo PG16 image, Rust 1.87 multi-stage Docker build, GitHub Actions (`workflow_dispatch`).

**Reference design:** `docs/superpowers/specs/2026-05-15-bootstrap-tracker-postgres-design.md`. Read it first.

**Reference repositories on disk:**

- `ext-balius/bootstrap/postgres/` — canonical pattern for the postgres module.
- `bootstrap/backend/` — canonical pattern for the tracker module (var shape, dynamic tolerations, ingress-less Deployment).
- `docker/Dockerfile.backend` — canonical pattern for the tracker Dockerfile.
- `.github/workflows/backend.yml` — canonical pattern for the publish workflow.

---

## File structure (created by this plan)

```
docker/
└── Dockerfile.tracker                 (NEW)
.github/workflows/
└── tracker-publish.yml                (NEW)
bootstrap/
├── postgres/
│   ├── main.tf                        (NEW — variables)
│   ├── postgres.tf                    (NEW — kubernetes_manifest postgresql CRD)
│   ├── monitor.tf                     (NEW — PodMonitor)
│   └── output.tf                      (NEW — outputs for tracker consumption)
└── tracker/
    ├── main.tf                        (NEW — variables)
    ├── tracker.toml.tpl               (NEW — TOML template)
    ├── configmap.tf                   (NEW — ConfigMap with rendered TOML)
    └── deployment.tf                  (NEW — Deployment)
```

Not modified by this plan: anything under `tracker/`, `backend/`, `frontend/`, or any existing `bootstrap/*` module.

Out of repo scope: the consumer wiring in `txpipe/clusters/clusters/m2-prod-7xjh33/global/tx3.tf` is documented in the spec but applied in a separate repo, separate PR. Do not attempt to edit that file as part of this plan.

---

### Task 1: Tracker Docker image and GHCR publish workflow

**Files:**
- Create: `docker/Dockerfile.tracker`
- Create: `.github/workflows/tracker-publish.yml`

**Reference:** `docker/Dockerfile.backend` (exact pattern to imitate, two-stage Rust 1.87 build) and `.github/workflows/backend.yml` (exact workflow to imitate, `workflow_dispatch` only).

- [ ] **Step 1: Specify `docker/Dockerfile.tracker`**

  Spec the Dockerfile to:
  - Stage 1 `FROM rust:1.87 AS build`, install build deps (`build-essential`, `pkg-config`, `libssl-dev`, `cmake`), `WORKDIR /app`, copy `tracker/Cargo.toml`, `tracker/Cargo.lock`, `tracker/src/`, `tracker/migrations/` (migrations needed for `sqlx::migrate!()` compile-time embedding), `cd tracker && cargo build --release`.
  - Stage 2 `FROM rust:1.87-slim`, copy the binary from `/app/tracker/target/release/tracker` to `/app/bin/tracker`, `WORKDIR /app/bin`, `CMD ["./tracker", "/etc/tracker/tracker.toml"]`. The config path is a positional argument (`tracker/src/main.rs:9-12`); there is no `--config` flag.
  - Do NOT add `ENV` defaults; runtime env (`DATABASE_URL`, `RUST_LOG`) is injected by Kubernetes.

- [ ] **Step 2: Specify `.github/workflows/tracker-publish.yml`**

  Verbatim copy of `.github/workflows/backend.yml` with two substitutions:
  - `name: Tracker`
  - In the `Build and push` step: `file: docker/Dockerfile.tracker`, `tags: ghcr.io/tx3-lang/registry-tracker:${{ github.sha }}`.

  Keep `permissions.packages: write`, `on: workflow_dispatch: {}`, `runs-on: ubuntu-latest`, the same three steps in the same order, and `platforms: linux/amd64`.

- [ ] **Step 3: Local build smoke test**

  Run: `docker build -f docker/Dockerfile.tracker -t test-tracker-image .` from the repo root.
  Expected: image builds successfully. Build time is dominated by `cargo build --release` (expect several minutes; this is the same hit as the backend image).

- [ ] **Step 4: Binary entrypoint smoke test**

  Run: `docker run --rm test-tracker-image`
  Expected: the binary starts, attempts to open `/etc/tracker/tracker.toml`, fails with a config-not-found / IO error, and exits non-zero. This confirms the binary is executable and the CMD args are wired correctly. A clean "config missing" error is the success signal here; any other panic or "exec format error" is a failure.

- [ ] **Step 5: Workflow lint**

  Run: `yamllint .github/workflows/tracker-publish.yml` if `yamllint` is installed; otherwise diff against `.github/workflows/backend.yml` and confirm only the four planned substitutions differ.
  Expected: no errors / no unexpected diffs.

- [ ] **Step 6: Commit**

  ```bash
  git add docker/Dockerfile.tracker .github/workflows/tracker-publish.yml
  git commit -m "feat: dockerfile and ghcr publish workflow for tracker image"
  ```

**Acceptance for Task 1:**
- `docker build` succeeds locally.
- Binary launches and exits with a config-missing error (not a format error).
- The workflow file structure matches `backend.yml` modulo the four substitutions above.
- Workflow not yet executed (manual `workflow_dispatch` happens after merge to main).

---

### Task 2: `bootstrap/postgres` module

**Files:**
- Create: `bootstrap/postgres/main.tf`
- Create: `bootstrap/postgres/postgres.tf`
- Create: `bootstrap/postgres/monitor.tf`
- Create: `bootstrap/postgres/output.tf`

**Reference (copy structure, diff only what the spec calls out):** `ext-balius/bootstrap/postgres/main.tf`, `postgres.tf`, `monitor.tf`.

- [ ] **Step 1: Specify `bootstrap/postgres/main.tf` (variables only)**

  Declare exactly the variables in the spec's "Module bootstrap/postgres > Variables" table. Specifically:

  - `namespace` (string, required).
  - `name` (string, default `"telchar-postgres"`).
  - `db_name` (string, default `"tracker"`).
  - `owner_user` (string, default `"tracker"`).
  - `team_id` (string, default `"telchar"`).
  - `version` (string, default `"16"`).
  - `replicas` (number, default `1`).
  - `volume` (object `{ storage_class = string, size = string }`, default `{ storage_class = "fast", size = "20Gi" }`).
  - `resources` (object `{ requests = map(string), limits = map(string) }`, default requests `cpu=100m, memory=2Gi` / limits `cpu=2000m, memory=4Gi`).
  - `params` (map(string), default `{}`).
  - `docker_image` (string, default `"ghcr.io/zalando/spilo-16:3.3-p1"`).
  - `tolerations` (list(object{effect,key,operator,value=optional(string)})) with default mirroring the balius tolerations array verbatim: `compute-profile/Exists`, `compute-arch/Equal/arm64`, `availability-sla/Equal/consistent`. Include the `mem-intensive` workload toleration if balius has it; check `ext-balius/bootstrap/postgres/postgres.tf:27-50` and copy as-is into the default.

  Do not include any other variables. No `provider` block (the consumer wires it).

- [ ] **Step 2: Specify `bootstrap/postgres/postgres.tf`**

  One `kubernetes_manifest` resource named `postgres` with `field_manager { force_conflicts = true }`, mirroring `ext-balius/bootstrap/postgres/postgres.tf` with these deltas:

  - `metadata.name = var.name`, `metadata.namespace = var.namespace`.
  - `spec.numberOfInstances = var.replicas`.
  - `spec.enableMasterLoadBalancer = false`, `spec.enableReplicaLoadBalancer = false`.
  - `spec.allowedSourceRanges = []`.
  - `spec.dockerImage = var.docker_image`.
  - `spec.teamId = var.team_id`.
  - `spec.tolerations = var.tolerations`.
  - Omit the `serviceAnnotations` block entirely (we are not exposing externally).
  - `spec.databases = { (var.db_name) = var.owner_user }`.
  - `spec.postgresql = { version = var.version, parameters = var.params }`.
  - `spec.users = { (var.owner_user) = ["superuser", "createdb", "login"] }` — single user only; do NOT add the second `dmtrro` user that balius has.
  - `spec.resources = { limits = var.resources.limits, requests = var.resources.requests }`.
  - `spec.volume = { storageClass = var.volume.storage_class, size = var.volume.size }`.
  - `spec.env = [{ name = "ALLOW_NOSSL", value = "true" }]` (copy from balius).
  - `spec.sidecars` containing one entry `exporter` copied verbatim from balius (image `quay.io/prometheuscommunity/postgres-exporter:v0.12.0`, env block, port `metrics:9187`), with one substitution: `DATA_SOURCE_URI = "localhost:5432/${var.db_name}?sslmode=disable"`.

- [ ] **Step 3: Specify `bootstrap/postgres/monitor.tf`**

  Verbatim copy of `ext-balius/bootstrap/postgres/monitor.tf`. The selector is `cluster-name = var.name` and the only other variable consumed is `var.namespace`. No other changes.

- [ ] **Step 4: Specify `bootstrap/postgres/output.tf`**

  Five `output` blocks:
  - `credentials_secret_name` = `"${var.owner_user}.${var.name}.credentials.postgresql.acid.zalan.do"`.
  - `service_host` = `"${var.name}.${var.namespace}.svc.cluster.local"`.
  - `service_port` = `5432`.
  - `db_name` = `var.db_name`.
  - `owner_user` = `var.owner_user`.

  Naming follows the Zalando operator convention: `<role>.<cluster>.credentials.postgresql.acid.zalan.do`.

- [ ] **Step 5: Validation**

  Run from `bootstrap/postgres/`:
  ```
  terraform init -backend=false
  terraform validate
  terraform fmt -check
  ```
  Expected: all succeed with no diagnostics. `terraform fmt -check` exits 0 (run `terraform fmt` and re-commit if not).

- [ ] **Step 6: Plan against a stub root**

  Create a temporary `examples/postgres-stub/main.tf` (or use a scratch directory outside the repo) that instantiates the module with `namespace = "scratch"`, configures the `kubernetes` provider with a dummy kubeconfig (or `KUBE_HOST` unset — `terraform plan` only resolves attributes, no apply). Run `terraform plan`.
  Expected: plan shows exactly one `kubernetes_manifest.postgres` and one `kubernetes_manifest.podmonitor`, with the expected literal values (name `telchar-postgres`, numberOfInstances 1, volume 20Gi/fast, version 16, db `tracker`, user `tracker`).
  Discard the scratch directory after the check; do not commit it.

- [ ] **Step 7: Commit**

  ```bash
  git add bootstrap/postgres/
  git commit -m "feat: bootstrap/postgres module via zalando operator"
  ```

**Acceptance for Task 2:**
- `terraform init -backend=false && terraform validate && terraform fmt -check` all pass.
- A plan against a stub root renders the expected literal field values.
- Outputs render without errors when referenced from a downstream module (verified indirectly via Task 3 plan).

---

### Task 3: `bootstrap/tracker` module

**Files:**
- Create: `bootstrap/tracker/main.tf`
- Create: `bootstrap/tracker/tracker.toml.tpl`
- Create: `bootstrap/tracker/configmap.tf`
- Create: `bootstrap/tracker/deployment.tf`

**Reference (copy structure):** `bootstrap/backend/main.tf` (var pattern, default tolerations triple), `bootstrap/backend/deployment.tf` (Deployment shape, dynamic tolerations). The tracker has no Service or Ingress.

- [ ] **Step 1: Specify `bootstrap/tracker/main.tf` (variables only)**

  Declare exactly the variables in the spec's "Module bootstrap/tracker > Variables" table:

  - `namespace` (string, default `"telchar"`).
  - `name` (string, default `"telchar-tracker"`).
  - `image` (string, required).
  - `replicas` (number, default `1`).
  - `db_host` (string, required).
  - `db_port` (number, default `5432`).
  - `db_name` (string, required).
  - `db_credentials_secret` (string, required).
  - `upstream_endpoint` (string, required).
  - `upstream_profile` (string, default `"mainnet"`).
  - `upstream_api_key` (string, required, `sensitive = true`).
  - `upstream_intersect` (string, default `"tip"`).
  - `upstream_filter_addresses` (list(string), default `[]`).
  - `oci_registry_url` (string, default `"http://telchar-registry.telchar.svc.cluster.local:5000"`).
  - `oci_include_scopes` (list(string), default `[]`).
  - `oci_include_names` (list(string), default `[]`).
  - `oci_exclude_scopes` (list(string), default `[]`).
  - `oci_exclude_names` (list(string), default `[]`).
  - `oci_profile_override` (list(object{ match = string, profile = string }), default `[]`).
  - `rust_log` (string, default `"info,tx3_registry_tracker=debug"`).
  - `resources` (same object shape as `bootstrap/backend/main.tf`, default requests `cpu=100m, memory=256Mi` / limits `cpu=1000m, memory=1Gi`).
  - `tolerations` (same list shape as `bootstrap/backend/main.tf`, default mirroring the three `Equal` tolerations from backend: compute-profile/general-purpose, compute-arch/x86, availability-sla/best-effort).

- [ ] **Step 2: Specify `bootstrap/tracker/tracker.toml.tpl`**

  Template variables consumed: `upstream_endpoint`, `upstream_profile`, `upstream_api_key`, `upstream_intersect`, `upstream_addresses`, `oci_registry_url`, `include_scopes`, `include_names`, `exclude_scopes`, `exclude_names`, `profile_override`.

  TOML rendered (preserve formatting parseable by `toml::from_str`):

  - Section `[upstream]` with `endpoint`, `profile`, `api_key`, `intersect` as quoted strings.
  - Section `[upstream.filter]` with `addresses = ${jsonencode(upstream_addresses)}` so empty `[]` renders correctly.
  - Section `[storage]` with `database_url = ""` and a one-line comment noting that the runtime env var `DATABASE_URL` overrides this (matches `tracker/src/config.rs:114`).
  - Section `[oci]` with `registry_url` and the four include/exclude list fields using `jsonencode` for valid TOML arrays.
  - Repeated `[[oci.profile_override]]` blocks rendered via Terraform `%{ for o in profile_override ~}` ... `%{ endfor ~}`, each with quoted `match` and `profile`.

  Validate manually: run `terraform console` in the module directory, call `templatefile("./tracker.toml.tpl", { upstream_endpoint = "https://example.invalid", upstream_profile = "mainnet", upstream_api_key = "fake", upstream_intersect = "tip", upstream_addresses = [], oci_registry_url = "http://x:5000", include_scopes = [], include_names = [], exclude_scopes = [], exclude_names = [], profile_override = [{ match = "a/b", profile = "preview" }] })`, write the output to `/tmp/out.toml`, and parse it with `python3 -c "import tomllib, sys; tomllib.loads(open('/tmp/out.toml').read()); print('ok')"`. Expected: prints `ok` (no parse errors). Cross-check that every top-level table and field name matches the Rust struct names in `tracker/src/config.rs` (`upstream`, `upstream.filter`, `storage.database_url`, `oci.registry_url`, `oci.include_scopes`, `oci.include_names`, `oci.exclude_scopes`, `oci.exclude_names`, `oci.profile_override[].match`, `oci.profile_override[].profile`).

- [ ] **Step 3: Specify `bootstrap/tracker/configmap.tf`**

  One `kubernetes_config_map` resource named `tracker_config`:
  - `metadata.name = "${var.name}-config"`.
  - `metadata.namespace = var.namespace`.
  - `data = { "tracker.toml" = templatefile("${path.module}/tracker.toml.tpl", { ... all 11 template vars ... }) }`.

- [ ] **Step 4: Specify `bootstrap/tracker/deployment.tf`**

  One `kubernetes_deployment` resource named `tracker`. Structural specifics:

  - `metadata`: `name = var.name`, `namespace = var.namespace`, `labels = { role = var.name }`.
  - `spec.replicas = var.replicas`.
  - `spec.selector.match_labels = { role = var.name }`.
  - `spec.template.metadata.labels = { role = var.name }`.
  - `spec.template.spec.restart_policy = "Always"`.
  - **One** `container` named `main`:
    - `image = var.image`, `image_pull_policy = "IfNotPresent"`.
    - `args = ["/etc/tracker/tracker.toml"]` — positional, no flag (`tracker/src/main.rs:9-12`).
    - `resources` from `var.resources`.
    - `volume_mount`: name `config`, `mount_path = "/etc/tracker/tracker.toml"`, `sub_path = "tracker.toml"`.
    - Env vars **in this exact order** (order is significant for Kubernetes `$(VAR)` expansion):
      1. `PG_USER` from `value_from.secret_key_ref { name = var.db_credentials_secret, key = "username" }`.
      2. `PG_PASSWORD` from `value_from.secret_key_ref { name = var.db_credentials_secret, key = "password" }`.
      3. `DATABASE_URL` with literal `value = "postgresql://$(PG_USER):$(PG_PASSWORD)@${var.db_host}:${var.db_port}/${var.db_name}?sslmode=disable"`. Kubernetes expands `$(PG_USER)` and `$(PG_PASSWORD)` at container start because both were declared earlier in the same list.
      4. `RUST_LOG = var.rust_log`.
  - One `volume` named `config` sourced from `config_map { name = "${var.name}-config" }`.
  - Dynamic `toleration` block copied from `bootstrap/backend/deployment.tf:44-53`.

  No Service. No Ingress. No PodMonitor (tracker does not expose metrics yet).

- [ ] **Step 5: Validation**

  From `bootstrap/tracker/`:
  ```
  terraform init -backend=false
  terraform validate
  terraform fmt -check
  ```
  Expected: all pass.

- [ ] **Step 6: Plan against a stub root that wires postgres + tracker**

  Create a scratch directory with a root module that instantiates both:
  - `module "postgres"` with `namespace = "scratch"`, defaults otherwise.
  - `module "tracker"` with `namespace = "scratch"`, `image = "ghcr.io/example:abc"`, `db_host = module.postgres.service_host`, `db_port = module.postgres.service_port`, `db_name = module.postgres.db_name`, `db_credentials_secret = module.postgres.credentials_secret_name`, `upstream_endpoint = "https://example.invalid"`, `upstream_api_key = "fake"`.

  Run `terraform plan`. Expected:
  - `kubernetes_manifest.postgres` (from postgres module) shows expected literal config.
  - `kubernetes_config_map.tracker_config` with `data.tracker.toml` containing the four sections rendered correctly (eyeball-validate the TOML output in the plan).
  - `kubernetes_deployment.tracker` shows env list in the correct order: `PG_USER` → `PG_PASSWORD` → `DATABASE_URL` (with `$(PG_USER)` literal text visible since Terraform does not expand it) → `RUST_LOG`.
  - Args field equals `["/etc/tracker/tracker.toml"]`.

  Discard scratch directory after the check.

- [ ] **Step 7: Commit**

  ```bash
  git add bootstrap/tracker/
  git commit -m "feat: bootstrap/tracker module deployment"
  ```

**Acceptance for Task 3:**
- `terraform init -backend=false && terraform validate && terraform fmt -check` pass.
- The rendered `tracker.toml` parses as valid TOML and round-trips into `tracker::config::Config`.
- Plan shows the env entries in the order `PG_USER`, `PG_PASSWORD`, `DATABASE_URL`, `RUST_LOG`.
- Plan shows the container args as `["/etc/tracker/tracker.toml"]`.

---

### Task 4: End-to-end dry run against the postgres + tracker pair

This task does not produce new files; it exercises the two modules together against a real cluster (the actual `m2-prod-7xjh33` apply happens in the consumer repo). Skip this step if no cluster is available locally; otherwise it catches integration issues before the consumer-repo PR.

- [ ] **Step 1: Apply in a scratch namespace**

  In a sandbox cluster that already has the Zalando postgres-operator installed (otherwise this is not a valid test environment), apply the scratch root from Task 3, Step 6, against `namespace = "scratch-tracker"`. Use a real (preview/preprod) UTxORPC endpoint and api_key so the tracker has something to connect to.

  Expected post-apply state:
  - `kubectl -n scratch-tracker get postgresql telchar-postgres` shows `Running` within ~2 minutes.
  - `kubectl -n scratch-tracker get statefulset telchar-postgres` shows `1/1` ready.
  - `kubectl -n scratch-tracker get secret tracker.telchar-postgres.credentials.postgresql.acid.zalan.do` exists and contains keys `username` and `password`.
  - `kubectl -n scratch-tracker get deployment telchar-tracker` reaches `1/1 Available`. The tracker pod may need one restart if it started before the operator's secret existed; the second start should succeed.

- [ ] **Step 2: Verify migrations + connection**

  - `kubectl -n scratch-tracker logs deployment/telchar-tracker` shows log lines indicating `sqlx::migrate` applying `20260511000001_initial` and `20260514120000_add_repo_columns`, then a successful `WatchTx` connection to the upstream.
  - `kubectl -n scratch-tracker exec -it telchar-postgres-0 -c postgres -- psql -U tracker -d tracker -c '\dt'` shows the `matches` and `cursor` tables (per `tracker/migrations/`).

- [ ] **Step 3: Cleanup**

  `terraform destroy` on the scratch root. Confirm the PVC is deleted (the Zalando operator removes the StatefulSet, but the PVC retention depends on operator settings — manually `kubectl delete pvc` if needed).

**Acceptance for Task 4:**
- Both pods reach Ready / Available.
- Migrations applied successfully.
- Tracker logs show a connected UTxORPC stream (or a deterministic "no matching txs yet" steady state).

---

## Out of repo scope (do NOT do as part of this plan)

The following lives in `txpipe/clusters` (separate repo) and lands in a **separate** PR after the registry-repo PR is merged and tagged with a SHA:

- Add `module "postgres"` and `module "tracker"` blocks to `clusters/m2-prod-7xjh33/global/tx3.tf` referencing this repo at the merged SHA.
- Add `tracker_utxorpc_api_key` to whatever secrets store the cluster repo uses (mirroring how other secrets flow through `local.secrets[...]`).
- Run the `tracker-publish` workflow manually once on `main` to produce the first `ghcr.io/tx3-lang/registry-tracker:<sha>` image, and pin that SHA in `tx3.tf`.

The spec's "Cluster repo wiring" section contains the exact module-block contents to paste over there. Do not pre-emptively open that PR from this plan.

---

## Self-review checklist

Run this before opening the PR. All boxes should be checkable without further work.

- [ ] Every file in "File structure" exists.
- [ ] `terraform validate` + `terraform fmt -check` clean in both `bootstrap/postgres` and `bootstrap/tracker`.
- [ ] `docker build -f docker/Dockerfile.tracker .` succeeds.
- [ ] Workflow file structurally matches `backend.yml` modulo the four planned substitutions (name, file path, image tag, optional comments).
- [ ] No `tracker/` Rust source or migrations were modified.
- [ ] No `bootstrap/{backend,frontend,registry}` files were modified.
- [ ] No file under `clusters/` was edited (that repo is out of scope).
- [ ] If Task 4 dry-run was performed: tracker pod reached Ready and applied both migrations.
