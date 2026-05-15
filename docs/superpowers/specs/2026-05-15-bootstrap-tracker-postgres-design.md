# Bootstrap modules for tracker Postgres and tracker daemon

**Date:** 2026-05-15
**Branch:** TBD (new branch off `main`)
**Status:** Design approved, pending implementation plan.

## Goal

Add Terraform bootstrap modules to deploy:

1. A PostgreSQL cluster (`telchar-postgres`) managed by the Zalando
   postgres-operator, hosting the `tracker` database used by the tracker
   daemon.
2. The tracker daemon itself (`telchar-tracker`), a Deployment that consumes
   the chain from UTxORPC and writes matches to the Postgres above.

Plus the prerequisites to ship a tracker container image:

3. A `docker/Dockerfile.tracker` and a GHCR publish workflow, mirroring the
   existing backend image pipeline.

Final state: a single `terraform apply` of the cluster repo
(`txpipe/clusters/clusters/m2-prod-7xjh33/global/tx3.tf`) brings up Postgres
and the tracker, with the tracker auto-migrating its schema on first boot.

## Current state (pre-change)

- `bootstrap/` contains three modules: `registry` (zot), `backend` (GraphQL),
  `frontend`. All use plain `kubernetes_*` resources, no Helm, no operators.
- The tracker (`tracker/`) is a Rust + `sqlx` daemon that reads a TOML config
  and runs migrations from `tracker/migrations/` against Postgres. It is not
  deployed anywhere yet.
- `.github/workflows/tracker.yml` only runs `cargo test`; no Docker image is
  built or pushed for the tracker.
- The cluster repo (`txpipe/clusters/clusters/m2-prod-7xjh33`) already runs
  the Zalando postgres-operator (`acid.zalan.do/v1`) — it is consumed by
  `ext-balius/bootstrap/postgres` and other ext-* modules. Storage classes
  `fast` and `gp3` are available; `fast` is the convention for Postgres
  volumes.
- The cluster uses Demeter tolerations (`demeter.run/compute-profile`,
  `compute-arch`, `availability-sla`) on every workload.

## Architecture

### New files

```
bootstrap/
├── postgres/                          (NEW — mirrors ext-balius/bootstrap/postgres)
│   ├── main.tf
│   ├── postgres.tf
│   ├── monitor.tf
│   └── output.tf
└── tracker/                           (NEW)
    ├── main.tf
    ├── configmap.tf
    ├── deployment.tf
    └── tracker.toml.tpl
docker/
└── Dockerfile.tracker                 (NEW — mirrors docker/Dockerfile.backend)
.github/workflows/
└── tracker-publish.yml                (NEW — mirrors .github/workflows/backend.yml)
```

### Module `bootstrap/postgres`

Imitates `ext-balius/bootstrap/postgres`. Declares a `kubernetes_manifest`
with `apiVersion: acid.zalan.do/v1`, `kind: postgresql`, and lets the operator
materialise the StatefulSet, Service, PVC and credentials Secret.

**Variables (`main.tf`):**

| Variable | Type | Default | Purpose |
| --- | --- | --- | --- |
| `namespace` | `string` | — (required) | Kubernetes namespace. Passed from `tx3.tf` (`telchar`). |
| `name` | `string` | `"telchar-postgres"` | Postgres cluster name; also the Service DNS. |
| `db_name` | `string` | `"tracker"` | Database created and owned by `owner_user`. |
| `owner_user` | `string` | `"tracker"` | Postgres role owning `db_name`. |
| `team_id` | `string` | `"telchar"` | Zalando `teamId`. |
| `version` | `string` | `"16"` | PostgreSQL major version. |
| `replicas` | `number` | `1` | `numberOfInstances`. |
| `volume` | `object({ storage_class, size })` | `{ "fast", "20Gi" }` | PVC. |
| `resources` | `object({ requests, limits })` | requests `cpu=100m, memory=2Gi`, limits `cpu=2000m, memory=4Gi` | Pod resources. |
| `params` | `map(string)` | `{}` | Postgres `parameters` block; empty by default. |
| `docker_image` | `string` | `"ghcr.io/zalando/spilo-16:3.3-p1"` | Spilo image matching `version`. |
| `tolerations` | `list(object(...))` | Demeter set matching balius defaults | Same toleration shape as balius (compute-profile/Exists, compute-arch/Equal arm64, availability-sla/Equal consistent). |

**Manifest (`postgres.tf`):** mirrors `ext-balius/bootstrap/postgres/postgres.tf`
with the following deltas:

- `databases = { (var.db_name) = var.owner_user }` (single db).
- `users = { (var.owner_user) = ["superuser", "createdb", "login"] }`
  (single user; no `dmtrro` extra role).
- `numberOfInstances = var.replicas`.
- `enableMasterLoadBalancer = false`, `enableReplicaLoadBalancer = false`.
- `serviceAnnotations` omitted (no AWS LB needed — cluster-internal only).
- `allowedSourceRanges = []`.
- `postgresql.version = var.version`.
- `postgresql.parameters = var.params`.
- `volume = { storageClass = var.volume.storage_class, size = var.volume.size }`.
- `resources = { limits = var.resources.limits, requests = var.resources.requests }`.
- Sidecar `exporter` (`quay.io/prometheuscommunity/postgres-exporter:v0.12.0`)
  kept verbatim from balius, with `DATA_SOURCE_URI` pointing at
  `localhost:5432/${var.db_name}`.

**PodMonitor (`monitor.tf`):** verbatim copy of `ext-balius/bootstrap/postgres/monitor.tf`,
selecting on `cluster-name = var.name`.

**Outputs (`output.tf`):**

```hcl
output "credentials_secret_name" {
  value = "${var.owner_user}.${var.name}.credentials.postgresql.acid.zalan.do"
}
output "service_host" { value = "${var.name}.${var.namespace}.svc.cluster.local" }
output "service_port" { value = 5432 }
output "db_name"      { value = var.db_name }
output "owner_user"   { value = var.owner_user }
```

The credentials Secret is generated by the operator (not by us); it has keys
`username` and `password`.

### Module `bootstrap/tracker`

A single Deployment, 1 replica, fed by a ConfigMap with the rendered
`tracker.toml`.

**Variables (`main.tf`):**

| Variable | Type | Default | Purpose |
| --- | --- | --- | --- |
| `namespace` | `string` | `"telchar"` | Namespace. |
| `name` | `string` | `"telchar-tracker"` | Deployment / ConfigMap base name. |
| `image` | `string` | — (required) | `ghcr.io/tx3-lang/registry-tracker:<sha>`. |
| `replicas` | `number` | `1` | Tracker is a singleton consumer of the chain. |
| `db_host` | `string` | — (required) | From `module.postgres.service_host`. |
| `db_port` | `number` | `5432` | From `module.postgres.service_port`. |
| `db_name` | `string` | — (required) | From `module.postgres.db_name`. |
| `db_credentials_secret` | `string` | — (required) | From `module.postgres.credentials_secret_name`. |
| `upstream_endpoint` | `string` | — (required) | UTxORPC gRPC endpoint. |
| `upstream_profile` | `string` | `"mainnet"` | TII profile. |
| `upstream_api_key` | `string` (sensitive) | — (required) | Demeter UTxORPC API key. |
| `upstream_intersect` | `string` | `"tip"` | Resume point. |
| `upstream_filter_addresses` | `list(string)` | `[]` | Server-side prefilter. |
| `oci_registry_url` | `string` | `"http://telchar-registry.telchar.svc.cluster.local:5000"` | zot URL, cluster-internal. |
| `oci_include_scopes` | `list(string)` | `[]` | OCI allow filter. |
| `oci_include_names` | `list(string)` | `[]` | OCI allow filter. |
| `oci_exclude_scopes` | `list(string)` | `[]` | OCI deny filter. |
| `oci_exclude_names` | `list(string)` | `[]` | OCI deny filter. |
| `oci_profile_override` | `list(object({ match, profile }))` | `[]` | Per-protocol TII profile overrides. |
| `rust_log` | `string` | `"info,tx3_registry_tracker=debug"` | `RUST_LOG`. |
| `resources` | `object({ requests, limits })` | requests `cpu=100m, memory=256Mi`, limits `cpu=1000m, memory=1Gi` | Pod resources. |
| `tolerations` | `list(object(...))` | Same Demeter `Exists` triple as `bootstrap/backend` | Scheduling. |

**ConfigMap (`configmap.tf`):**

Renders `tracker.toml.tpl` via `templatefile()` with every variable above
(except db / image / replicas / tolerations / resources / rust_log).
`upstream_api_key` is included **in the TOML directly** — the cluster is
private and the operator stores no public-facing copy. No separate Secret.

The template mirrors the structure of `tracker/tracker.toml.example` /
`tracker/local_tracker.toml`:

```toml
[upstream]
endpoint  = "${upstream_endpoint}"
profile   = "${upstream_profile}"
api_key   = "${upstream_api_key}"
intersect = "${upstream_intersect}"

[upstream.filter]
addresses = ${jsonencode(upstream_addresses)}

[storage]
# Overridden at runtime by env DATABASE_URL.
database_url = ""

[oci]
registry_url      = "${oci_registry_url}"
include_scopes    = ${jsonencode(include_scopes)}
include_names     = ${jsonencode(include_names)}
exclude_scopes    = ${jsonencode(exclude_scopes)}
exclude_names     = ${jsonencode(exclude_names)}

%{ for o in profile_override ~}
[[oci.profile_override]]
match   = "${o.match}"
profile = "${o.profile}"
%{ endfor ~}
```

**Deployment (`deployment.tf`):**

- 1 container `main`, `image = var.image`, `imagePullPolicy: IfNotPresent`.
- Mount ConfigMap at `/etc/tracker/tracker.toml` (subPath).
- Args: `["/etc/tracker/tracker.toml"]`. The binary takes the config path as
  the first positional argument (`tracker/src/main.rs:9-12`); there is no
  `--config` flag. Omitting args falls back to `./tracker.toml` in CWD,
  which is not what we want.
- Env:
  - `PG_USER` from `secret_key_ref { name = var.db_credentials_secret, key = "username" }`.
  - `PG_PASSWORD` from `secret_key_ref { name = var.db_credentials_secret, key = "password" }`.
  - `DATABASE_URL` constructed at runtime. Two candidate techniques, to be
    chosen in the implementation plan:
    1. **Data source** `kubernetes_secret_v1` reads the operator's secret at
       plan time and Terraform assembles a literal `DATABASE_URL` string into
       the Deployment. Pro: simple env var. Con: Terraform refresh depends
       on the secret existing first (use `depends_on` on the postgres
       manifest).
    2. **Init container / wrapper** that reads `PG_USER` / `PG_PASSWORD` env
       and writes the final URL into `DATABASE_URL`. Pro: no Terraform
       coupling. Con: more moving parts.
  - `RUST_LOG = var.rust_log`.
- `restartPolicy: Always`.
- Dynamic `toleration` block mirroring `bootstrap/backend/deployment.tf`.
- No Service, no Ingress. The tracker has no inbound traffic.

### Cluster repo wiring

`clusters/m2-prod-7xjh33/global/tx3.tf` gains two new modules:

```hcl
module "postgres" {
  source = "git::https://github.com/tx3-lang/registry//bootstrap/postgres?ref=<sha>"

  namespace = local.telchar_namespace
  # All other values use module defaults: name=telchar-postgres, db=tracker,
  # user=tracker, volume 20Gi fast, PG 16, 1 replica.
}

module "tracker" {
  source = "git::https://github.com/tx3-lang/registry//bootstrap/tracker?ref=<sha>"

  namespace = local.telchar_namespace
  image     = "ghcr.io/tx3-lang/registry-tracker:<sha-to-fill>"

  db_host               = module.postgres.service_host
  db_port               = module.postgres.service_port
  db_name               = module.postgres.db_name
  db_credentials_secret = module.postgres.credentials_secret_name

  upstream_endpoint = "https://cardano-mainnet.utxorpc-m1.demeter.run"
  upstream_profile  = "mainnet"
  upstream_api_key  = local.secrets["tracker_utxorpc_api_key"]
}
```

Both `?ref=<sha>` placeholders are filled in once the registry-repo PR with
these modules lands.

### Tracker container image

**`docker/Dockerfile.tracker`** — multi-stage build mirroring
`docker/Dockerfile.backend`:

```dockerfile
FROM rust:1.87 AS build
WORKDIR /app
RUN apt update && apt install -y build-essential pkg-config libssl-dev cmake
COPY ./tracker/Cargo.toml ./tracker/Cargo.toml
COPY ./tracker/Cargo.lock ./tracker/Cargo.lock
COPY ./tracker/src ./tracker/src
COPY ./tracker/migrations ./tracker/migrations
WORKDIR /app/tracker
RUN cargo build --release

FROM rust:1.87-slim
COPY --from=build /app/tracker/target/release/tracker /app/bin/tracker
WORKDIR /app/bin
CMD ["./tracker", "/etc/tracker/tracker.toml"]
```

Notes:
- The binary name comes from `tracker/Cargo.toml [[bin]] name = "tracker"`.
- `sqlx::migrate!()` embeds migration SQL into the binary at compile time;
  copying `tracker/migrations/` into the build stage is sufficient. They are
  not needed at runtime.
- The config path is a positional argument (`tracker/src/main.rs:9-12`); no
  `--config` flag exists. The deployment can override via `args` if the
  mount path ever changes.

**`.github/workflows/tracker-publish.yml`** — verbatim copy of
`backend.yml` with `file: docker/Dockerfile.tracker` and `tags:
ghcr.io/tx3-lang/registry-tracker:${{ github.sha }}`. Triggered manually via
`workflow_dispatch`, same as the backend image.

## Rust code changes

**None.** `tracker/src/config.rs` already supports the env override that
matters here (`DATABASE_URL` → `storage.database_url`). The `api_key` lives
inside the ConfigMap, so no extra env plumbing is needed.

## Open decisions deferred to the implementation plan

1. `DATABASE_URL` injection mechanism (data source vs init container).

## Acceptance criteria

- `terraform plan` on the cluster repo with the two new `module` blocks
  succeeds against this repo at the merged SHA.
- After `terraform apply`:
  - A `postgresql/telchar-postgres` CR exists in namespace `telchar`.
  - StatefulSet `telchar-postgres` reaches `Ready` with 1 replica.
  - Secret `tracker.telchar-postgres.credentials.postgresql.acid.zalan.do`
    exists and contains keys `username` and `password`.
  - Deployment `telchar-tracker` reaches `Available` with 1 replica.
  - The tracker pod logs show successful migration run
    (`20260511000001_initial`, `20260514120000_add_repo_columns`) and
    successful `WatchTx` connection to the configured upstream.
- A push to `ghcr.io/tx3-lang/registry-tracker:<sha>` is produced by
  manually triggering the new `tracker-publish` workflow.
