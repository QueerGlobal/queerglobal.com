# Bootstrap (run once before the first protected deploy)

Creates resources that must exist before merge to `main`:

- GitHub **production** environment with required reviewers (main branch only)
- GitHub environment secret **DOPPLER_TOKEN** (Doppler service token created by bootstrap)
- Cloudflare **R2 bucket** and scoped **R2 API token** (state backend only)
- Cloudflare **deploy API token** (Workers on the account; routes/DNS on `grandkru.com` only)
- Doppler production secrets (`CLOUDFLARE_*`, `TF_STATE_*`, `AWS_*`, `BOOTSTRAP_TF_STATE_KEY`)

Bootstrap state is **encrypted** and stored in the same R2 bucket under `BOOTSTRAP_TF_STATE_KEY` (default `queerglobal-grandkru/bootstrap.tfstate`) after the first apply and migration.

## Doppler configs

- **`prd` (or `doppler_config`)**: deploy secrets and the read-only service token used as GitHub `DOPPLER_TOKEN`. CI and production workflows read this config only.
- **`bootstrap` (or `doppler_bootstrap_config`)**: bootstrap-only secrets in a **separate Doppler environment**. Store **`BOOTSTRAP_STATE_PASSPHRASE`** here. The deploy service token must **not** have access to this config.

Create the bootstrap Doppler environment and config before the first apply (each config belongs to one environment):

```bash
export TF_VAR_doppler_project="your-project"
export TF_VAR_doppler_config="prd"
export TF_VAR_doppler_bootstrap_config="bootstrap"

doppler environments create Bootstrap \
  -p "$TF_VAR_doppler_project" \
  --slug "$TF_VAR_doppler_bootstrap_config"

doppler secrets set BOOTSTRAP_STATE_PASSPHRASE="$(openssl rand -base64 24)" \
  -p "$TF_VAR_doppler_project" \
  -c "$TF_VAR_doppler_bootstrap_config"
```

Bootstrap apply fails if `doppler_config == doppler_bootstrap_config` (precondition on the deploy service token) so GitHub Actions cannot receive a token scoped to bootstrap secrets.

## Required API tokens

### Cloudflare (bootstrap apply only)

Create a **user or account API token** with at least:

- **Account API Tokens Write** (creates `cloudflare_account_token` resources in `main.tf`)
- **Account API Tokens Read** (lists permission groups in `main.tf` data sources)
- **Workers R2 Storage Write** (creates the state bucket in `main.tf`)
- **Zone Read** on **`grandkru.com`** (resolves the zone for deploy token policies)

Run `node scripts/preflight-bootstrap-cloudflare.mjs` (or `node scripts/preflight-bootstrap.mjs`) after exporting `CLOUDFLARE_API_TOKEN` and `TF_VAR_cloudflare_account_id` to verify the token before any write.

### GitHub (fine-grained PAT on this repository)

- **Administration**: Read and write
- **Environments**: Read and write (creates the production environment and `DOPPLER_TOKEN` secret)
- **Actions**: Read (provider reads environment and deployment branch policies after writes)
- **Metadata**: Read

### Doppler (management token for the Terraform provider)

Use a **personal token** (`dp.pt.…`) or **service account token** (`dp.sa.…`) with **Collaborator** or higher on the **`prd`** environment. A config service token (`dp.st.…`) cannot create `doppler_service_token` (`main.tf`).

## State encryption and passphrase

OpenTofu 1.13+ encrypts bootstrap state and plan files with PBKDF2 + AES-GCM. Load the passphrase from the bootstrap Doppler config (never commit it):

```bash
export TF_VAR_bootstrap_state_passphrase="$(
  doppler secrets get BOOTSTRAP_STATE_PASSPHRASE --plain \
    -p "$TF_VAR_doppler_project" \
    -c "$TF_VAR_doppler_bootstrap_config"
)"
```

The passphrase must be at least 16 characters.

## Apply workflow (local state, then R2)

### 1. First apply (local backend)

```bash
export CLOUDFLARE_API_TOKEN="..."   # bootstrap Cloudflare token (see above)
export TF_VAR_cloudflare_account_id="..."
export TF_VAR_github_token="..."
export TF_VAR_production_reviewer_usernames='["your-github-username"]'
export TF_VAR_doppler_management_token="..." # dp.pt. or dp.sa.
export TF_VAR_doppler_project="your-project"
export TF_VAR_doppler_config="prd"
export TF_VAR_doppler_bootstrap_config="bootstrap"
export TF_VAR_bootstrap_state_passphrase="$(
  doppler secrets get BOOTSTRAP_STATE_PASSPHRASE --plain \
    -p "$TF_VAR_doppler_project" \
    -c "$TF_VAR_doppler_bootstrap_config"
)"

node scripts/preflight-bootstrap.mjs
bash scripts/bootstrap-tofu-init.sh
tofu -chdir=infra/bootstrap apply
```

### 2. Migrate bootstrap state to R2 (once)

After the first apply, Doppler **`prd`** holds `TF_STATE_*` and scoped `AWS_*` credentials. Migrate encrypted state into the bucket (credentials stay in the environment, not in backend files):

```bash
doppler run \
  -p "$TF_VAR_doppler_project" -c "$TF_VAR_doppler_config" \
  --only-secrets TF_STATE_BUCKET,TF_STATE_ENDPOINT,TF_STATE_REGION,AWS_ACCESS_KEY_ID,AWS_SECRET_ACCESS_KEY,BOOTSTRAP_TF_STATE_KEY -- \
  bash -ec '
    export BOOTSTRAP_TF_STATE_KEY="${BOOTSTRAP_TF_STATE_KEY:-queerglobal-grandkru/bootstrap.tfstate}"
    export BOOTSTRAP_STATE_MIGRATE=1
    bash scripts/bootstrap-tofu-init.sh
  '
```

Remove local `infra/bootstrap/terraform.tfstate*` after a successful migration. Later applies are idempotent against remote state:

```bash
doppler run \
  -p "$TF_VAR_doppler_project" -c "$TF_VAR_doppler_config" \
  --only-secrets TF_STATE_BUCKET,TF_STATE_ENDPOINT,TF_STATE_REGION,AWS_ACCESS_KEY_ID,AWS_SECRET_ACCESS_KEY,BOOTSTRAP_TF_STATE_KEY -- \
  bash scripts/bootstrap-tofu-init.sh
tofu -chdir=infra/bootstrap apply
```

No manual copying of Cloudflare or Doppler deploy secrets is required; the provider writes them. Bootstrap also creates the Doppler service token wired to GitHub `DOPPLER_TOKEN`.

## Rotate GitHub DOPPLER_TOKEN

Re-running a normal apply does **not** rotate the Doppler service token. From the repo root (with bootstrap credentials loaded):

```bash
make rotate-doppler-github-token
```

That runs `tofu -chdir=infra/bootstrap apply -replace=doppler_service_token.github_actions_production` after you type `rotate` to confirm.

## Lost bootstrap state (recovery)

If remote bootstrap state is lost but Cloudflare, GitHub, and Doppler resources still exist, recreate state with `tofu import` after `bash scripts/bootstrap-tofu-init.sh` against R2. Examples (adjust IDs from the live APIs):

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

1. **Passphrase rotation (do not only change Doppler and restart):** set the new passphrase in Doppler, then run apply with both passphrases so OpenTofu can decrypt with the old key and re-encrypt with the new one:
   ```bash
   export TF_VAR_bootstrap_state_passphrase="$NEW_PASSPHRASE"
   export TF_VAR_bootstrap_state_passphrase_previous="$OLD_PASSPHRASE"
   tofu -chdir=infra/bootstrap apply
   ```
   After a successful apply, unset `TF_VAR_bootstrap_state_passphrase_previous` and apply once more. Encryption uses a fallback key provider (`versions.tf`) during rotation.
2. In Cloudflare, revoke `queerglobal-grandkru-tfstate-r2` and `queerglobal-grandkru-deploy`
   (or the names you set), then run `tofu -chdir=infra/bootstrap apply` to mint replacements
   and update Doppler via the provider.
3. Run `make rotate-doppler-github-token` (or the `-replace` command above) to mint a new Doppler service token and refresh GitHub `DOPPLER_TOKEN`.
