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

Cloudflare-only check, with the token read from the bootstrap Doppler config (see "Where the tokens live"):

```bash
bash scripts/bootstrap-run.sh node scripts/preflight-bootstrap-cloudflare.mjs
```

Preflight derives `TF_VAR_cloudflare_account_id` from the token (read-only zone lookup); do not export or type an account id by hand.

### GitHub (fine-grained PAT on this repository)

- **Administration**: Read and write
- **Environments**: Read and write (creates the production environment and `DOPPLER_TOKEN` secret)
- **Actions**: Read (provider reads environment and deployment branch policies after writes)
- **Metadata**: Read

### Doppler (management token for the Terraform provider)

Use a **personal token** (`dp.pt.…`) or **service account token** (`dp.sa.…`) with **Collaborator** or higher on the **`prd`** environment. A config service token (`dp.st.…`) cannot create `doppler_service_token` (`main.tf`).

## Where the tokens live (only three, all in Doppler)

The three bootstrap tokens are stored once in the **bootstrap** Doppler config and never typed into, or exported from, a shell. Paste each one into the Doppler dashboard (project from `bootstrap-project.auto.tfvars.json`, bootstrap config) under these names:

1. **`CLOUDFLARE_API_TOKEN`**: bootstrap Cloudflare API token (see policies above).
2. **`BOOTSTRAP_GITHUB_TOKEN`**: fine-grained GitHub PAT for this repository.
3. **`BOOTSTRAP_DOPPLER_MANAGEMENT_TOKEN`**: Doppler management token for the Terraform provider.

Every bootstrap command runs through `bash scripts/bootstrap-run.sh <command>`. It uses `doppler run` to load only those three secrets into the one command it starts, maps them to `CLOUDFLARE_API_TOKEN`, `TF_VAR_github_token` and `TF_VAR_doppler_management_token` there, and refuses to start if any is missing or empty, or if one is already set in your shell. Nothing is left in your shell and no token is on argv. The deploy service token cannot read the bootstrap config, so CI never sees these tokens.

Everything else is committed config or generated in code: production reviewers live in **`production-reviewers.auto.tfvars.json`** (OpenTofu auto-loads it). The bootstrap state passphrase is created on the first apply (strong random, never printed) and stored in the bootstrap Doppler config; later runs load it from there via `scripts/bootstrap-passphrase-env.sh`.

## Read-only preflight (before any Doppler or OpenTofu write)

Doppler project and config slugs live in **`bootstrap-project.auto.tfvars.json`** (OpenTofu auto-loads it). Preflight derives **`TF_VAR_cloudflare_account_id`** from the bootstrap Cloudflare token via a read-only zone lookup; you do not type account id or Doppler slugs at run time.

Verify tokens (read-only checks only):

```bash
bash scripts/bootstrap-run.sh node scripts/preflight-bootstrap.mjs
```

Preflight order: Cloudflare capability probes (verify active, then R2, then zone), `GET /repos/QueerGlobal/queerglobal.com` (`permissions.admin`), Doppler project read with the management token, then the Doppler isolation check (`GET /v3/configs/config` for both configs: the deploy config must not be in the bootstrap environment or share an environment with the bootstrap config).

Bootstrap Node CLIs (`preflight-bootstrap.mjs` and `preflight-bootstrap-cloudflare.mjs`) send uncaught errors to Sentry when **`SENTRY_DSN`** is set in the environment. When unset, reporting is a no-op. Messages are scrubbed of known secret values and token-shaped strings before sending; payloads include only the scrubbed message and a `bootstrap-cli` tag.

## Automated tests

- **`npm test`**: Node unit tests only (stand-in API responses; no OpenTofu or network).
- **`npm run test:e2e`**: local bootstrap smoke scripts (`bootstrap-first-apply-e2e.sh`, `bootstrap-passphrase-rotation-e2e.sh`) after OpenTofu is installed. CI runs unit tests and e2e in separate steps.

## Bootstrap Doppler setup (before storing the tokens)

The tokens need a home before preflight can read them, so this is the one step that runs first. It uses your own Doppler login, writes nothing outside Doppler, and creates the bootstrap environment and config empty (no passphrase yet; first apply generates it). The slugs come from the committed file; nothing is typed:

```bash
eval "$(node scripts/bootstrap-export-committed-env.mjs --slugs-only)"
doppler environments create Bootstrap \
  -p "$TF_VAR_doppler_project" \
  --slug "$TF_VAR_doppler_bootstrap_config"
```

Then store the three tokens in that config (see "Where the tokens live") and run preflight.

## State encryption, backup, and restore

OpenTofu 1.13+ encrypts bootstrap state and plan files with PBKDF2 + AES-GCM under key provider **`bootstrap`** (`versions.tf`). The key provider name stays **`bootstrap`** so the existing two-hop rotation flow still works.

On first bootstrap, run apply with `BOOTSTRAP_FIRST_RUN=1` on that one command (see "Apply workflow"): `scripts/bootstrap-passphrase-env.sh` generates a strong passphrase, stores it in the bootstrap Doppler config (CI cannot read that config), and exports `TF_VAR_bootstrap_state_passphrase` without printing it. Later runs load the passphrase from Doppler the same way.

The passphrase must be at least 16 characters.

After each successful apply, `bash scripts/bootstrap-tofu-apply.sh` runs `scripts/bootstrap-state-backup.sh`, which pipes the encrypted local state into `BOOTSTRAP_STATE_ENCRYPTED` on stdin. If backup fails, the run fails and the local state path is printed. If the state file is missing, backup exits with an error instead of skipping.

On a fresh machine, `bash scripts/bootstrap-tofu-init.sh` restores from `BOOTSTRAP_STATE_ENCRYPTED` when the local file is missing. For the first bootstrap on a new machine with no backup yet, set `BOOTSTRAP_FIRST_RUN=1` so a missing Doppler backup does not abort init.

## Apply workflow (local state only)

First bootstrap on a new machine (the flag applies to this one command only):

```bash
BOOTSTRAP_FIRST_RUN=1 bash scripts/bootstrap-run.sh bash scripts/bootstrap-tofu-apply.sh
```

Every later run:

```bash
bash scripts/bootstrap-run.sh bash scripts/bootstrap-tofu-apply.sh
```

The script runs preflight, restore, apply and backup in that order, always on `infra/bootstrap` next to it. There is no setting that points it at another directory and no separate manual apply path; the tests copy the scripts and the stack into a temporary tree instead.

No manual copying of Cloudflare or Doppler deploy secrets is required; the provider writes them. Bootstrap also creates the Doppler service token wired to GitHub `DOPPLER_TOKEN`.

## Passphrase rotation

Generate the new passphrase in code and store it in the bootstrap Doppler config as **`BOOTSTRAP_STATE_PASSPHRASE_NEXT`** (stdin, never printed, never on argv), then run rotation in a child process so passphrases never sit in your interactive shell:

```bash
eval "$(node scripts/bootstrap-export-committed-env.mjs --slugs-only)"
node scripts/bootstrap-generate-passphrase.mjs | doppler secrets set BOOTSTRAP_STATE_PASSPHRASE_NEXT \
  -p "$TF_VAR_doppler_project" \
  -c "$TF_VAR_doppler_bootstrap_config"

BOOTSTRAP_ROTATE_PROMOTE_DOPPLER=1 bash scripts/bootstrap-run.sh bash scripts/bootstrap-passphrase-rotate-run.sh
```

Rotation refuses to start if `BOOTSTRAP_STATE_PASSPHRASE_NEXT` is missing, empty or equal to the current passphrase, or if `BOOTSTRAP_FIRST_RUN` is set, and it keeps tracing off even under `bash -x`. With `BOOTSTRAP_ROTATE_PROMOTE_DOPPLER=1`, type **`promote`** when prompted after rotation succeeds: the script reads `BOOTSTRAP_STATE_PASSPHRASE_NEXT` from Doppler again, verifies it matches the passphrase the state was re-encrypted with, backs up state so `BOOTSTRAP_STATE_ENCRYPTED` matches the passphrase that becomes current, sets `BOOTSTRAP_STATE_PASSPHRASE` from that Doppler copy on stdin, then deletes `_NEXT`. Leave the flag off to promote later from the Doppler dashboard instead.

## Rotate GitHub DOPPLER_TOKEN

Re-running a normal apply does **not** rotate the Doppler service token. From the repo root (the target loads the bootstrap tokens through `scripts/bootstrap-run.sh`):

```bash
make rotate-doppler-github-token
```

That runs `bash scripts/bootstrap-run.sh bash scripts/bootstrap-tofu-apply.sh -replace=doppler_service_token.github_actions_production` after you type `rotate` to confirm, so preflight, restore and the state backup run around the apply.

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

1. **Passphrase rotation:** restore local state from `BOOTSTRAP_STATE_ENCRYPTED` if needed (`bash scripts/bootstrap-tofu-init.sh`), then follow "Passphrase rotation" above with `BOOTSTRAP_ROTATE_PROMOTE_DOPPLER=1`, which backs up state and promotes the new passphrase in the same run.
2. **Cloudflare:** revoke compromised tokens in the dashboard. Create a **new** bootstrap Cloudflare token (same policies as preflight), replace `CLOUDFLARE_API_TOKEN` in the bootstrap Doppler config from the dashboard, then run `bash scripts/bootstrap-run.sh bash scripts/bootstrap-tofu-apply.sh` (preflight, restore, apply, backup) to mint replacements and refresh Doppler deploy secrets.
3. **GitHub Doppler deploy token:** replace `BOOTSTRAP_GITHUB_TOKEN` or `BOOTSTRAP_DOPPLER_MANAGEMENT_TOKEN` in the bootstrap Doppler config first if either leaked, then run `make rotate-doppler-github-token`.

## Scripted checks

```bash
npm run test:e2e
```
