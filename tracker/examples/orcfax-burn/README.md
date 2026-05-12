# Demo: Orcfax burn on Cardano mainnet

End-to-end smoke test for `tracker`. Replays a real historical burn from the
**Orcfax** oracle policy on Cardano mainnet and watches the daemon capture
it into SQLite — using utxorpc v1beta and a local server.

## What this demo proves

A protocol described in `tx3` compiles to a TII; the tracker fingerprints
the TII against a profile, replays a window of mainnet history via
utxorpc's WatchTx (v1beta), and on every applied tx whose structure matches
it persists a lifted-annotation row.

The v1beta `TxOutput.original_cbor` field carries each consumed input's
raw CBOR inside the WatchTx envelope itself, so the tracker resolves spent
inputs without a follow-up `ReadUtxos` round-trip.

## Target on-chain tx

| Field        | Value                                                                            |
| ------------ | -------------------------------------------------------------------------------- |
| Network      | Cardano mainnet                                                                  |
| Tx hash      | `1e31b36253043a89a388714f7245156788cbdbceed5d74ee81679e56a7b81a86`                |
| Block        | `a18369937e9acd0b0095173cbd35b8b2f013ba13dcc34518e6d5a8a5004433e1` (height `13368056`) |
| Slot         | `186188550`                                                                      |
| What it does | Orcfax oracle retraction — script-driven burn of 25 oracle tokens, 26 inputs from the script address, single ADA-only output to the publisher |
| Policy id    | `193ee65211bb3b4e0ea5f751f415269355a650e2e3706f625cdf1a4b` (Orcfax)               |
| Asset name   | `""` (empty)                                                                     |
| Burner addr  | `addr1wyvnaejjzxanknsw5hm4raq4y6f4tfjsut3hqmmztn035jc4rpcfn` (Orcfax script)      |
| Recipient    | `addr1vy7p9anntmu8v4w9kfaua5lc9rv9059z0lfq7tx6rr4l97c9w4kcq`                      |

Discovered by streaming `WatchService/WatchTx` from a local utxorpc server
(no predicate, intersect at tip) and grepping the result for txs with a
non-empty `mint` field. Orcfax publishes/retracts oracle data continuously
(74867 mints + 13703 burns recorded by Koios at the time of writing), so
mainnet tip almost always has a recent example.

## Files

- `main.tx3` — protocol description: a single `burn_orcfax(quantity)` tx
  with a `Burner` party (the Orcfax script address) and a `Recipient`
  party. Hard-coded Orcfax policy id, structural shape that mirrors the
  on-chain pattern (input from burner → burn → output to recipient). The
  `tracker` matcher only checks addresses + mint/burn policies, so the
  absence of redeemer/witness blocks in this `.tx3` does not block the
  match against the on-chain Plutus burn.
- `trix.toml` — `trix init`-shaped manifest.
- `.env.mainnet` — committed env file for the `mainnet` profile. `trix`
  reads it at build time and maps each `<NAME>=…` line to
  `profiles.mainnet.parties.<name>` in the produced TII (lowercased), so
  the tracker reads party addresses straight from the TII without any
  post-build patching. The two entries here are the Orcfax script
  address (`BURNER`) and the publisher address (`RECIPIENT`).
- `tracker.toml` — daemon config: endpoint defaults to
  `http://localhost:50051`, pinned `intersect` at the parent block of the
  target tx (slot `186188536`, hash `26993814…98ae6`),
  `mints_policy_id` pre-filter on the Orcfax policy, one `[[sources]]`
  pointing at the build-time TII output `./.tx3/tii/main.tii`.
- `run.sh` — runs `trix build -p mainnet` (regenerates the TII under
  `./.tx3/tii/`), sources `./.env` if present, splices `DMTR_API_KEY`
  and `DMTR_ENDPOINT` overrides into a temp copy of `tracker.toml`, and
  execs `cargo run -p tracker --release` against it. With no `.env` it
  uses the committed defaults (local server, no auth).

## Running it

1. Make sure your local utxorpc server is up on `localhost:50051` and is
   tracking Cardano mainnet far enough back to include slot `186188536`.
2. Start the tracker:
   ```sh
   ./run.sh
   ```
3. The daemon will log `subscribing to WatchTx` and start replaying from
   the parent block of the target. Within a couple of seconds (the
   `mints_policy_id` server-side filter keeps traffic minimal — only
   Orcfax-policy txs come over the wire, the rest arrive as `Idle` slot
   advances) you should see an `INFO matched` line for
   `1e31b362…b81a86`. Logs default to `tracker=info`; set
   `RUST_LOG=tracker=debug` to see every Apply, Idle, and resolved-inputs
   summary.
4. Inspect the resulting row:
   ```sh
   sqlite3 tracker.db 'SELECT source_name, tx_name, hex(tx_hash), block_slot FROM matches'
   sqlite3 tracker.db 'SELECT json_extract(lifted, "$.parties") FROM matches'
   sqlite3 tracker.db 'SELECT json_extract(lifted, "$.burns") FROM matches'
   ```
5. Restart `./run.sh`. The daemon resumes from the cursor stored in
   `tracker.db`; the `UNIQUE(tx_hash, source_name)` index makes the
   re-application a no-op.

## Caveats

- **History window** — the intersect is whatever your local server's WAL
  / DB allows. If the server rejects the intersect (stream closes within
  a second or two), pick a more recent burn-bearing slot via Koios or
  another short streaming probe.
- **Hosted endpoint override** — drop `DMTR_API_KEY=…` (and optionally
  `DMTR_ENDPOINT=https://…`) into `./.env` to retarget the demo at a
  hosted utxorpc. The endpoint must speak v1beta — older v1alpha
  endpoints (Demeter `utxorpc-v0` family) do not populate
  `TxOutput.original_cbor` and the matcher will not be able to resolve
  spent inputs from the WatchTx envelope alone.
- **`api_key` placement** — `tracker.toml` keeps the key commented out so
  the file is safe to commit. `run.sh` substitutes `DMTR_API_KEY` from
  the environment at startup; if you'd rather inline it, drop the
  `# api_key = …` line and edit it directly.
