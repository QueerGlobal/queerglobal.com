# Bootstrap (run once before the first protected deploy)

Creates resources that must exist before merge to `main`:

- GitHub **production** environment with required reviewers (main branch only)
- GitHub environment secret **DOPPLER_TOKEN**
- Cloudflare **R2 bucket** and scoped **R2 API token** (state backend only)
- Cloudflare **deploy API token** (Workers on the account; routes/DNS on `grandkru.com` only)
- Doppler production secrets (`CLOUDFLARE_*`, `TF_STATE_*`, `AWS_*`)

Bootstrap uses **encrypted local state** in this directory (`terraform.tfstate`). It does
not use the R2 bucket it creates for its own state.

## State encryption and passphrase

OpenTofu 1.8+ encrypts bootstrap state and plan files with PBKDF2 + AES-GCM. Provide a
passphrase via environment variable (never commit it):

```bash
export TF_VAR_bootstrap_state_passphrase="$(doppler secrets get BOOTSTRAP_STATE_PASSPHRASE --plain)"
```

Store `BOOTSTRAP_STATE_PASSPHRASE` in Doppler (or another secret manager). It must be at
least 16 characters.

## One-time apply

Run from a maintainer workstation with a Cloudflare **admin** token, a GitHub PAT
(`administration:write`, `secrets` on this repository), and a Doppler **management**
token that can write the production config:

```bash
export CLOUDFLARE_API_TOKEN="..."   # admin token for bootstrap apply only
export TF_VAR_cloudflare_account_id="..."
export TF_VAR_github_token="..."
export TF_VAR_production_reviewer_user_ids='[1234567]'
export TF_VAR_doppler_token="..."              # service token -> GitHub DOPPLER_TOKEN
export TF_VAR_doppler_management_token="..." # Doppler provider (writes secrets)
export TF_VAR_doppler_project="your-project"
export TF_VAR_doppler_config="prd"
export TF_VAR_bootstrap_state_passphrase="$(doppler secrets get BOOTSTRAP_STATE_PASSPHRASE --plain)"

tofu -chdir=infra/bootstrap init -backend=false
tofu -chdir=infra/bootstrap apply
```

No manual copying of outputs is required; secrets are written to Doppler via the
provider. Only `DOPPLER_TOKEN` is stored in GitHub.

## If bootstrap state or tokens leak

1. Rotate `BOOTSTRAP_STATE_PASSPHRASE`, re-init encryption if needed, and treat the old
   state file as compromised (destroy/recreate bootstrap-managed tokens if unsure).
2. In Cloudflare, revoke `queerglobal-grandkru-tfstate-r2` and `queerglobal-grandkru-deploy`
   (or the names you set), then run `tofu -chdir=infra/bootstrap apply` to mint replacements
   and update Doppler via the provider.
3. Rotate the Doppler production service token and update GitHub `DOPPLER_TOKEN` (bootstrap
   apply or GitHub environment secret UI).
