# OpenTofu: queerglobal.grandkru.com

This stack deploys the coming-soon Worker (`public/` assets) and attaches the
custom domain `queerglobal.grandkru.com` in the `grandkru.com` zone.

Production deploys run from `.github/workflows/deploy-production.yml` after
merge to `main`, with GitHub Environment `production` approval.

## Bootstrap (required before first merge)

Run [bootstrap/](bootstrap/README.md) once to create:

- GitHub **production** environment with required reviewers, **main-only** branch policy, and **no admin bypass**
- GitHub environment secret **DOPPLER_TOKEN** (only secret stored in GitHub)
- Cloudflare **R2 bucket**, scoped **R2 API token**, and **deploy API token**
- Doppler **production** secrets (`CLOUDFLARE_*`, `TF_STATE_*`, `AWS_*`)

The deploy workflow refuses to run if the production environment has no
reviewers, allows admins to bypass protection, or is not limited to **main** only
(`scripts/verify-production-environment.mjs`).

## Secrets and variables (Doppler)

Inject these with [Doppler](https://www.doppler.com/) (preferred) or your
secret store. Do not commit account IDs or API tokens to this repo.

| Name | Used by |
|------|---------|
| `CLOUDFLARE_API_TOKEN` | OpenTofu Cloudflare provider, rollback script |
| `CLOUDFLARE_ACCOUNT_ID` | Deploy workflow, rollback script, R2 endpoint hostname |
| `DOPPLER_TOKEN` | GitHub Actions only (set by bootstrap; not in Doppler) |
| `TF_STATE_BUCKET`, `TF_STATE_KEY`, `TF_STATE_REGION` | Remote state bucket and object key |
| `TF_STATE_ENDPOINT` | S3 API endpoint (Cloudflare R2) |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | Scoped R2 credentials (bootstrap writes to Doppler) |

OpenTofu reads `cloudflare_account_id` from `TF_VAR_cloudflare_account_id`,
which CI sets from `CLOUDFLARE_ACCOUNT_ID` in Doppler.

Optional OpenTofu variables (defaults in `variables.tf`):

- `worker_name` (default `queerglobal-grandkru`)
- `hostname` (default `queerglobal.grandkru.com`)
- `zone_name` (default `grandkru.com`)

## Remote state (Cloudflare R2)

State is stored remotely so GitHub Actions and anyone running deploys use the
same state file.

Bootstrap writes these into the Doppler production config:

1. `TF_STATE_BUCKET`: R2 bucket name.
2. `TF_STATE_KEY`: object key (default `queerglobal-grandkru/terraform.tfstate`).
3. `TF_STATE_REGION`: `auto` for R2.
4. `TF_STATE_ENDPOINT`:
   `https://<CLOUDFLARE_ACCOUNT_ID>.r2.cloudflarestorage.com`
5. `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY`: scoped R2 token (not account-wide R2 write).

The GitHub deploy workflow loads them from Doppler and writes `backend.hcl` for OpenTofu init.
See `backend.hcl.example`.

Local init with the same backend:

```bash
export AWS_ACCESS_KEY_ID="..."
export AWS_SECRET_ACCESS_KEY="..."
export TF_STATE_BUCKET="..."
export TF_STATE_KEY="queerglobal-grandkru/terraform.tfstate"
export TF_STATE_REGION="auto"
export TF_STATE_ENDPOINT="https://YOUR_ACCOUNT_ID.r2.cloudflarestorage.com"

cat > backend.hcl <<EOF
bucket = "$TF_STATE_BUCKET"
key    = "$TF_STATE_KEY"
region = "$TF_STATE_REGION"
endpoint = "$TF_STATE_ENDPOINT"
skip_credentials_validation = true
skip_metadata_api_check = true
skip_region_validation = true
EOF

export CLOUDFLARE_API_TOKEN="..."
eval "$(node scripts/bootstrap-export-committed-env.mjs)"

tofu -chdir=infra init -backend-config=backend.hcl
tofu -chdir=infra plan
```

Local validation without remote state:

```bash
tofu -chdir=infra init -backend=false
tofu -chdir=infra validate
tofu -chdir=infra/bootstrap init -backend=false
tofu -chdir=infra/bootstrap validate
tofu fmt -check -recursive infra/
export TF_VAR_bootstrap_state_passphrase='mock-bootstrap-passphrase-for-ci'
tofu -chdir=infra test
tofu -chdir=infra/bootstrap test
```

## Production apply (CI)

Normal deploys run **OpenTofu plan** then **apply** in GitHub Actions: `run-infra-tofu-plan.sh` writes a plan and stamps it with `GITHUB_RUN_ID`; `run-infra-tofu-apply.sh` refuses to apply unless the stamp matches the current run. The deploy job requires the **production** environment (manual approval).

## No local apply

There is no break-glass apply script. `scripts/run-infra-tofu-apply.sh` applies only a plan that `scripts/run-infra-tofu-plan.sh` wrote and stamped earlier in the same workflow run, inside a job that needs the **production** environment approval. Run without that stamped plan, it refuses before calling OpenTofu.

The stamp stops the scripts from being used outside the gated workflow by mistake. It is not a security boundary: anyone holding the production credentials could run OpenTofu directly. The real boundary is that those credentials live only in the Doppler `prd` config, read by the `DOPPLER_TOKEN` in the protected **production** environment. If GitHub Actions is unavailable, production changes wait until it is back, unless Mark approves a specific manual change.

Do not attach `queerglobal.com` from this stack.

## Manual Worker rollback and release redeploy

In GitHub Actions, run **Deploy production** via **Run workflow** and approve the **production** environment for the rollback or redeploy job:

- `rollback_version_id`: Cloudflare Workers version UUID (fast Worker rollback). Runs `npm test` in a dedicated job first, then rollback after approval.
- `rollback_release_tag`: Git tag from a prior deploy (OpenTofu redeploy). Skips the push **test** job because release tags are created only after deploy smoke and recheck passed for that tag; the workflow comment documents this. Plan/apply still use the CI plan stamp, and smoke/recheck run after redeploy.
