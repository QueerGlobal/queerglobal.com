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

Bootstrap apply fails if `doppler_config == doppler_bootstrap_config` (precondition on the deploy service token) so GitHub Actions cannot receive a token scoped to bootstrap secrets.

## Required API tokens

### Cloudflare (bootstrap apply only)

Create a **user or account API token** with **allow** policies for:

- **Account API Tokens Write** on this account
- **Workers R2 Storage Write** on this account
- **Zone Read** on **`grandkru.com`**

Run `node scripts/preflight-bootstrap-cloudflare.mjs` after exporting `CLOUDFLARE_API_TOKEN` and `TF_VAR_cloudflare_account_id`.

### GitHub (fine-grained PAT on this repository)

- **Administration**: Read and write
- **Environments**: Read and write (creates the production environment and `DOPPLER_TOKEN` secret)
- **Actions**: Read (provider reads environment and deployment branch policies after writes)
- **Metadata**: Read

### Doppler (management token for the Terraform provider)

Use a **personal token** (`dp.pt.…`) or **service account token** (`dp.sa.…`) with **Collaborator** or higher on the **`prd`** environment. A config service token (`dp.st.…`) cannot create `doppler_service_token` (`main.tf`).

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

export TF_VAR_production_reviewer_usernames='["your-github-username"]'

node scripts/preflight-bootstrap.mjs
```

Preflight order: Cloudflare token policies, `GET /repos/QueerGlobal/queerglobal.com` (`permissions.admin`), Doppler project read with the management token.

## Bootstrap Doppler setup (after preflight)

Create the bootstrap Doppler environment and config, then set the state encryption passphrase (stdin, not argv):

```bash
doppler environments create Bootstrap \
  -p "$TF_VAR_doppler_project" \
  --slug "$TF_VAR_doppler_bootstrap_config"

openssl rand -base64 24 | doppler secrets set BOOTSTRAP_STATE_PASSPHRASE \
  -p "$TF_VAR_doppler_project" \
  -c "$TF_VAR_doppler_bootstrap_config"
```

## State encryption, backup, and restore

OpenTofu 1.13+ encrypts bootstrap state and plan files with PBKDF2 + AES-GCM (`versions.tf`). The current passphrase is on key provider **`bootstrap_v2`** (primary method `bootstrap`); during rotation the previous passphrase stays on provider **`bootstrap`** (fallback method `bootstrap_previous`) until you remove it. Before each rotation apply, remove `infra/bootstrap/terraform.tfstate.backup` so OpenTofu does not try to decrypt a stale backup with the new passphrase.

Load the current passphrase from the bootstrap Doppler config:

```bash
export TF_VAR_bootstrap_state_passphrase="$(
  doppler secrets get BOOTSTRAP_STATE_PASSPHRASE --plain \
    -p "$TF_VAR_doppler_project" \
    -c "$TF_VAR_doppler_bootstrap_config"
)"
```

The passphrase must be at least 16 characters.

After each successful apply, `bash scripts/bootstrap-tofu-apply.sh` (or `bash scripts/bootstrap-state-backup.sh`) pipes the encrypted local state into Doppler:

```bash
cat infra/bootstrap/terraform.tfstate | doppler secrets set BOOTSTRAP_STATE_ENCRYPTED \
  -p "$TF_VAR_doppler_project" \
  -c "$TF_VAR_doppler_bootstrap_config"
```

On a fresh machine, `bash scripts/bootstrap-tofu-init.sh` restores from `BOOTSTRAP_STATE_ENCRYPTED` when the local file is missing.

## Apply workflow (local state only)

```bash
export TF_VAR_bootstrap_state_passphrase="$(
  doppler secrets get BOOTSTRAP_STATE_PASSPHRASE --plain \
    -p "$TF_VAR_doppler_project" \
    -c "$TF_VAR_doppler_bootstrap_config"
)"

bash scripts/bootstrap-tofu-apply.sh
```

Or manually:

```bash
bash scripts/bootstrap-tofu-init.sh
tofu -chdir=infra/bootstrap apply
bash scripts/bootstrap-state-backup.sh
```

No manual copying of Cloudflare or Doppler deploy secrets is required; the provider writes them. Bootstrap also creates the Doppler service token wired to GitHub `DOPPLER_TOKEN`.

## Passphrase rotation

1. Set the **new** passphrase in Doppler (`BOOTSTRAP_STATE_PASSPHRASE`).
2. Apply with both passphrases so OpenTofu decrypts with the **`bootstrap`** fallback (old passphrase) and re-encrypts with **`bootstrap_v2`** (new passphrase):

```bash
export TF_VAR_bootstrap_state_passphrase="$NEW_PASSPHRASE"
export TF_VAR_bootstrap_state_passphrase_previous="$OLD_PASSPHRASE"
tofu -chdir=infra/bootstrap apply
bash scripts/bootstrap-state-backup.sh
```

3. Remove the fallback: unset `TF_VAR_bootstrap_state_passphrase_previous`, apply once more, and back up state again. Optionally trim `versions.tf` to drop the unused `bootstrap` key provider after rotation is complete.

## Rotate GitHub DOPPLER_TOKEN

Re-running a normal apply does **not** rotate the Doppler service token. From the repo root (with bootstrap credentials loaded):

```bash
make rotate-doppler-github-token
```

That runs `tofu -chdir=infra/bootstrap apply -replace=doppler_service_token.github_actions_production` after you type `rotate` to confirm.

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

1. **Passphrase rotation:** set a new `BOOTSTRAP_STATE_PASSPHRASE` in the bootstrap Doppler config. Restore local state from `BOOTSTRAP_STATE_ENCRYPTED` if needed (`bash scripts/bootstrap-tofu-init.sh`). Apply with `TF_VAR_bootstrap_state_passphrase` (new) and `TF_VAR_bootstrap_state_passphrase_previous` (old), then back up with `bash scripts/bootstrap-state-backup.sh`. Unset the previous passphrase and apply again to drop the fallback provider.
2. **Cloudflare:** revoke compromised tokens in the dashboard. Create a **new** bootstrap Cloudflare token (same policies as preflight), export it as `CLOUDFLARE_API_TOKEN`, run preflight, then `tofu -chdir=infra/bootstrap apply` to mint replacements and refresh Doppler deploy secrets.
3. **GitHub Doppler deploy token:** run `make rotate-doppler-github-token` (or the `-replace` command above) with a valid bootstrap GitHub PAT and management token.

## Scripted checks

```bash
bash scripts/bootstrap-first-apply-e2e.sh
bash scripts/bootstrap-passphrase-rotation-e2e.sh
```
