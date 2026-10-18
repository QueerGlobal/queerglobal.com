# Bootstrap (run once before the first protected deploy)

Creates resources that must exist before merge to `main`:

- GitHub **production** environment with required reviewers (main branch only)
- GitHub environment secret **DOPPLER_TOKEN** (Doppler service token created by bootstrap)
- Cloudflare **R2 bucket** and scoped **R2 API token** (state backend only)
- Cloudflare **deploy API token** (Workers on the account; routes/DNS on `grandkru.com` only)
- Doppler production secrets (`CLOUDFLARE_*`, `TF_STATE_*`, `AWS_*`)

Bootstrap uses **encrypted local state** in this directory (`terraform.tfstate`). It does
not use the R2 bucket it creates for its own state.

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

OpenTofu rejects `doppler_config == doppler_bootstrap_config` so the GitHub Actions service token cannot be pointed at the bootstrap config.

## State encryption and passphrase

OpenTofu 1.13+ encrypts bootstrap state and plan files with PBKDF2 + AES-GCM. Load the
passphrase from the bootstrap Doppler config (never commit it):

```bash
export TF_VAR_bootstrap_state_passphrase="$(
  doppler secrets get BOOTSTRAP_STATE_PASSPHRASE --plain \
    -p "$TF_VAR_doppler_project" \
    -c "$TF_VAR_doppler_bootstrap_config"
)"
```

The passphrase must be at least 16 characters.

## One-time apply

Run from a maintainer workstation with a Cloudflare **admin** token, a GitHub fine-grained PAT with **Administration (write)**, **Environments (write)**, and **Metadata (read)** on this repository, and a Doppler **management** token that can write the production config:

```bash
export CLOUDFLARE_API_TOKEN="..."   # admin token for bootstrap apply only
export TF_VAR_cloudflare_account_id="..."
export TF_VAR_github_token="..."
export TF_VAR_production_reviewer_usernames='["your-github-username"]'
export TF_VAR_doppler_management_token="..." # Doppler provider (writes secrets)
export TF_VAR_doppler_project="your-project"
export TF_VAR_doppler_config="prd"
export TF_VAR_doppler_bootstrap_config="bootstrap"
export TF_VAR_bootstrap_state_passphrase="$(
  doppler secrets get BOOTSTRAP_STATE_PASSPHRASE --plain \
    -p "$TF_VAR_doppler_project" \
    -c "$TF_VAR_doppler_bootstrap_config"
)"

tofu -chdir=infra/bootstrap init -backend=false
tofu -chdir=infra/bootstrap apply
```

No manual copying of outputs is required; secrets are written to Doppler via the
provider. Bootstrap also creates the Doppler service token wired to GitHub
`DOPPLER_TOKEN`.

## Rotate GitHub DOPPLER_TOKEN

Re-running a normal apply does **not** rotate the Doppler service token. From the repo root (with bootstrap credentials loaded):

```bash
make rotate-doppler-github-token
```

That runs `tofu -chdir=infra/bootstrap apply -replace=doppler_service_token.github_actions_production` after you type `rotate` to confirm.

Or run the replace yourself:

```bash
tofu -chdir=infra/bootstrap apply -replace=doppler_service_token.github_actions_production
```

## If bootstrap state or tokens leak

1. Rotate `BOOTSTRAP_STATE_PASSPHRASE` in the **bootstrap** Doppler config, re-init encryption if needed, and treat the old state file as compromised (destroy/recreate bootstrap-managed tokens if unsure).
2. In Cloudflare, revoke `queerglobal-grandkru-tfstate-r2` and `queerglobal-grandkru-deploy`
   (or the names you set), then run `tofu -chdir=infra/bootstrap apply` to mint replacements
   and update Doppler via the provider.
3. Run `make rotate-doppler-github-token` (or the `-replace` command above) to mint a new Doppler service token and refresh GitHub `DOPPLER_TOKEN`.
