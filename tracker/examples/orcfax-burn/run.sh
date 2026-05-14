#!/usr/bin/env bash
# Run the tracker against the orcfax-burn demo. Compiles main.tx3, publishes
# the resulting protocol + TII to the local Zot at `http://localhost:3000`
# (Zot must be running first — see README.md), splices `DMTR_API_KEY` /
# `DMTR_ENDPOINT` (if any) into a temp copy of tracker.toml, and execs the
# daemon, which then auto-discovers the just-published protocol from Zot.
#
# The committed default targets `http://localhost:50051` (a local utxorpc
# server speaking v1beta), so you can run without any env entirely.

set -euo pipefail
cd "$(dirname "$0")"

trix build -p mainnet >/dev/null
trix publish >/dev/null

if [[ -f .env ]]; then
    set -a
    # shellcheck disable=SC1091
    source .env
    set +a
fi

CFG=$(mktemp)
trap 'rm -f "$CFG"' EXIT

awk -v key="${DMTR_API_KEY:-}" -v ep="${DMTR_ENDPOINT:-}" '
  /^# api_key/      { if (key != "") { print "api_key = \"" key "\""; next } }
  /^endpoint =/     { if (ep != "")  { print "endpoint = \"" ep "\""; next } }
  { print }
' tracker.toml > "$CFG"

# `cargo run` from the tracker crate root so the binary builds against the
# local crate — useful while iterating.
ROOT=$(git -C "$(pwd)" rev-parse --show-toplevel)
exec cargo run --manifest-path "$ROOT/tracker/Cargo.toml" --release -- "$CFG"
