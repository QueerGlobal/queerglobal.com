# Bootstrap (run once before the first protected deploy)

Creates resources that must exist before merge to `main`:

- GitHub **production** environment with required reviewers (main branch only)
- GitHub environment secret **DOPPLER_TOKEN** (Doppler service token created by bootstrap)
- Cloudflare **R2 bucket** and scoped **R2 API token** (state backend only)
- Cloudflare **deploy API token** (Workers on the account; routes/DNS on `grandkru.com` only)
- Doppler production secrets (`CLOUDFLARE_*`, `TF_STATE_*`, `AWS_*`)

Bootstrap state is **encrypted**, kept **local** under `infra/bootstrap/terraform.tfstate`, and backed up to the **bootstrap** Doppler config as `BOOTSTRAP_STATE_ENCRYPTED` after each successful apply. Never store bootstrap state in `prd` or the R2 bucket CI can write.

## Doppler configs

- **`prd` (or `doppler_config`)**: deploy secrets and the read-only service token used as GitHub `DOPPLER_TOKEN`. CI and production workflows read this config only.
- **`bootstrap` (or `doppler_bootstrap_config`)**: bootstrap-only secrets in a **separate Doppler environment**. Store **`BOOTSTRAP_STATE_PASSPHRASE`** and **`BOOTSTRAP_STATE_ENCRYPTED`** here. The deploy service token must **not** have access to this config.

Bootstrap apply fails if `doppler_config` equals `doppler_bootstrap_config` or is a branch of it (precondition on the deploy service token), and preflight fails if the deploy config sits in the bootstrap environment or shares an environment with the bootstrap config. Do not add secret references from the deploy config to the bootstrap config: Doppler resolves references at read time, so the CI token would receive the referenced value.

## Required API tokens

### Cloudflare (bootstrap apply only)

Create a **user or account API token** that can pass the bootstrap preflight capability probes:

- **Account API Tokens Write**: preflight reads the verified token's policies (`GET /accounts/{id}/tokens/{token_id}` or the user token equivalent, which needs API Tokens Read, included in Write) and requires an allow policy with this permission group on this account, with no deny policy overriding it, before any OpenTofu write.
- **Workers R2 Storage Write** on this account (creates the state bucket). Preflight can only prove read access (`GET /accounts/{id}/r2/buckets`); if write is missing, the first apply fails at bucket creation.
- **Zone Read** for **`grandkru.com`** on this account (`GET /zones?name=grandkru.com&account.id={id}` must return exactly that zone)

Run `node scripts/preflight-bootstrap-cloudflare.mjs` after exporting `CLOUDFLARE_API_TOKEN` and `TF_VAR_cloudflare_account_id`.

### GitHub (fine-grained PAT on this repository)

- **Administration**: Read and write
- **Environments**: Read and write (creates the production environment and `DOPPLER_TOKEN` secret)
- **Actions**: Read (provider reads environment and deployment branch policies after writes)
- **Metadata**: Read

### Doppler (management token for the Terraform provider)

Use a **personal token** (`dp.pt.…`) or **service account token** (`dp.sa.…`) with **Collaborator** or higher on the **`prd`** environment. A config service token (`dp.st.…`) cannot create `doppler_service_token` (`main.tf`).

## Hand inputs (only three)

Bootstrap never takes secrets on argv. The only values Mark types at run time are these three tokens (stdin or Doppler, not the command line):

1. **`CLOUDFLARE_API_TOKEN`**: bootstrap Cloudflare API token (see policies below).
2. **`TF_VAR_github_token`**: fine-grained GitHub PAT for this repository.
3. **`TF_VAR_doppler_management_token`**: Doppler management token for the Terraform provider.

Everything else is committed config or generated in code: production reviewers live in **`production-reviewers.auto.tfvars.json`** (OpenTofu auto-loads it). The bootstrap state passphrase is created on the first apply (strong random, never printed) and stored in the bootstrap Doppler config; later runs load it from there via `scripts/bootstrap-passphrase-env.sh`.

## Read-only preflight (before any Doppler or OpenTofu write)

Export project slugs, then verify tokens (read-only checks only):

```bash
export TF_VAR_doppler_project="your-project"
export TF_VAR_doppler_config="prd"
export TF_VAR_doppler_bootstrap_config="bootstrap"
export TF_VAR_cloudflare_account_id="..."

read -rs CLOUDFLARE_API_TOKEN
echo
export CLOUDFLARE_API_TOKEN

read -rs TF_VAR_github_token
echo
export TF_VAR_github_token

read -rs TF_VAR_doppler_management_token
echo
export TF_VAR_doppler_management_token

node scripts/preflight-bootstrap.mjs
```

Preflight order: Cloudflare capability probes (verify active, then R2, then zone), `GET /repos/QueerGlobal/queerglobal.com` (`permissions.admin`), Doppler project read with the management token, then the Doppler isolation check (`GET /v3/configs/config` for both configs: the deploy config must not be in the bootstrap environment or share an environment with the bootstrap config).

Bootstrap Node CLIs (`preflight-bootstrap.mjs` and `preflight-bootstrap-cloudflare.mjs`) send uncaught errors to Sentry when **`SENTRY_DSN`** is set in the environment. When unset, reporting is a no-op. Messages are scrubbed of known secret values and token-shaped strings before sending; payloads include only the scrubbed message and a `bootstrap-cli` tag.

## Automated tests

- **`npm test`**: Node unit tests only (stand-in API responses; no OpenTofu or network).
- **`npm run test:e2e`**: local bootstrap smoke scripts (`bootstrap-first-apply-e2e.sh`, `bootstrap-passphrase-rotation-e2e.sh`) after OpenTofu is installed. CI runs unit tests and e2e in separate steps.

## Bootstrap Doppler setup (after preflight)

Create the bootstrap Doppler environment and config (no passphrase yet; first apply generates it):

```bash
doppler environments create Bootstrap \
  -p "$TF_VAR_doppler_project" \
  --slug "$TF_VAR_doppler_bootstrap_config"
```

## State encryption, backup, and restore

OpenTofu 1.13+ encrypts bootstrap state and plan files with PBKDF2 + AES-GCM under key provider **`bootstrap`** (`versions.tf`). The key provider name stays **`bootstrap`** so the existing two-hop rotation flow still works.

On first bootstrap, set `BOOTSTRAP_FIRST_RUN=1` and run apply: `scripts/bootstrap-passphrase-env.sh` generates a strong passphrase, stores it in the bootstrap Doppler config (CI cannot read that config), and exports `TF_VAR_bootstrap_state_passphrase` without printing it. Later runs load the passphrase from Doppler the same way.

The passphrase must be at least 16 characters.

After each successful apply, `bash scripts/bootstrap-tofu-apply.sh` (or `bash scripts/bootstrap-state-backup.sh`) pipes the encrypted local state into Doppler. If backup fails, the run fails and the local state path is printed. If apply finished but the state file is missing, backup exits with an error (no silent skip).

```bash
cat infra/bootstrap/terraform.tfstate | doppler secrets set BOOTSTRAP_STATE_ENCRYPTED \
  -p "$TF_VAR_doppler_project" \
  -c "$TF_VAR_doppler_bootstrap_config"
```

On a fresh machine, `bash scripts/bootstrap-tofu-init.sh` restores from `BOOTSTRAP_STATE_ENCRYPTED` when the local file is missing. For the first bootstrap on a new machine with no backup yet, set `BOOTSTRAP_FIRST_RUN=1` so a missing Doppler backup does not abort init.

## Apply workflow (local state only)

```bash
export BOOTSTRAP_FIRST_RUN=1   # only on the first bootstrap on a new machine

bash scripts/bootstrap-tofu-apply.sh
```

The script always applies `infra/bootstrap` next to it and backs up that directory's state. There is no setting that points it at another directory; the tests copy the scripts and the stack into a temporary tree instead.

Or step by step (same order as the script; never skip preflight):

```bash
node scripts/preflight-bootstrap.mjs
bash scripts/bootstrap-tofu-init.sh
tofu -chdir=infra/bootstrap apply
bash scripts/bootstrap-state-backup.sh
```

No manual copying of Cloudflare or Doppler deploy secrets is required; the provider writes them. Bootstrap also creates the Doppler service token wired to GitHub `DOPPLER_TOKEN`.

## Passphrase rotation

Store the new passphrase in the bootstrap Doppler config as **`BOOTSTRAP_STATE_PASSPHRASE_NEXT`** (stdin, not argv), then load both passphrases:

```bash
openssl rand -base64 24 | doppler secrets set BOOTSTRAP_STATE_PASSPHRASE_NEXT \
  -p "$TF_VAR_doppler_project" \
  -c "$TF_VAR_doppler_bootstrap_config"

export TF_VAR_bootstrap_state_passphrase="$(
  doppler secrets get BOOTSTRAP_STATE_PASSPHRASE --plain \
    -p "$TF_VAR_doppler_project" \
    -c "$TF_VAR_doppler_bootstrap_config"
)"
export TF_VAR_bootstrap_state_passphrase_next="$(
  doppler secrets get BOOTSTRAP_STATE_PASSPHRASE_NEXT --plain \
    -p "$TF_VAR_doppler_project" \
    -c "$TF_VAR_doppler_bootstrap_config"
)"

bash scripts/bootstrap-passphrase-rotate.sh
```

Promote the new passphrase in Doppler (check `BOOTSTRAP_STATE_PASSPHRASE_NEXT` before any write, then back up so `BOOTSTRAP_STATE_ENCRYPTED` matches the passphrase that becomes current), then remove `BOOTSTRAP_STATE_PASSPHRASE_NEXT`:

```bash
(
  set -euo pipefail
  config="${TF_VAR_doppler_bootstrap_config:-bootstrap}"
  next_from_doppler="$(doppler secrets get BOOTSTRAP_STATE_PASSPHRASE_NEXT --plain -p "$TF_VAR_doppler_project" -c "$config")"
  if [ "$next_from_doppler" != "$TF_VAR_bootstrap_state_passphrase_next" ]; then
    echo "BOOTSTRAP_STATE_PASSPHRASE_NEXT does not match the rotation passphrase; not promoting." >&2
    exit 1
  fi
  bash scripts/bootstrap-state-backup.sh
  printf '%s' "$next_from_doppler" | doppler secrets set BOOTSTRAP_STATE_PASSPHRASE -p "$TF_VAR_doppler_project" -c "$config"
  doppler secrets delete BOOTSTRAP_STATE_PASSPHRASE_NEXT -p "$TF_VAR_doppler_project" -c "$config" --yes
)
```

Or set `BOOTSTRAP_ROTATE_PROMOTE_DOPPLER=1` when running `bash scripts/bootstrap-passphrase-rotate.sh`. After rotation succeeds, type **`promote`** when prompted; the script reads `BOOTSTRAP_STATE_PASSPHRASE_NEXT`, verifies it matches the new passphrase, backs up state, sets `BOOTSTRAP_STATE_PASSPHRASE`, then deletes `_NEXT`.

## Rotate GitHub DOPPLER_TOKEN

Re-running a normal apply does **not** rotate the Doppler service token. From the repo root (with bootstrap credentials loaded):

```bash
make rotate-doppler-github-token
```

That runs `bash scripts/bootstrap-tofu-apply.sh -replace=doppler_service_token.github_actions_production` after you type `rotate` to confirm, so preflight, restore and the state backup run around the apply.

## Lost bootstrap state (recovery)

If local state is lost but `BOOTSTRAP_STATE_ENCRYPTED` exists in the bootstrap Doppler config, run `bash scripts/bootstrap-tofu-init.sh` to restore automatically.

If both are lost but Cloudflare, GitHub, and Doppler resources still exist, recreate state with `tofu import` after init. Examples (adjust IDs from the live APIs):

```bash
tofu import cloudflare_r2_bucket.tf_state "$ACCOUNT_ID/$BUCKET_NAME"
tofu import cloudflare_account_token.tf_state_r2 "$R2_TOKEN_ID"
tofu import cloudflare_account_token.deploy_workers "$DEPLOY_TOKEN_ID"
tofu import github_repository_environment.production "$REPO:production"
tofu import github_repository_environment_deployment_policy.production_main "$REPO:production:main"
tofu import doppler_service_token.github_actions_production "$PROJECT/$CONFIG/$TOKEN_SLUG"
tofu import github_actions_environment_secret.doppler_token "$REPO:production:DOPPLER_TOKEN"
```

Import each `doppler_secret.*` by Doppler secret name if needed, then run `tofu plan` until clean.

## If bootstrap state or tokens leak

These steps do **not** assume the leaked Cloudflare or GitHub tokens still work.

1. **Passphrase rotation:** set `BOOTSTRAP_STATE_PASSPHRASE_NEXT` in the bootstrap Doppler config, restore local state from `BOOTSTRAP_STATE_ENCRYPTED` if needed (`bash scripts/bootstrap-tofu-init.sh`), run `bash scripts/bootstrap-passphrase-rotate.sh`, then `bash scripts/bootstrap-state-backup.sh`, and promote `BOOTSTRAP_STATE_PASSPHRASE_NEXT` to `BOOTSTRAP_STATE_PASSPHRASE`.
2. **Cloudflare:** revoke compromised tokens in the dashboard. Create a **new** bootstrap Cloudflare token (same policies as preflight), export it as `CLOUDFLARE_API_TOKEN`, then run `bash scripts/bootstrap-tofu-apply.sh` (preflight, restore, apply, backup) to mint replacements and refresh Doppler deploy secrets.
3. **GitHub Doppler deploy token:** run `make rotate-doppler-github-token` with a valid bootstrap GitHub PAT and management token.

## Scripted checks

```bash
npm run test:e2e
```
