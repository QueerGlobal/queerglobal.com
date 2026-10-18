# OpenTofu: queerglobal.grandkru.com

This stack deploys the coming-soon Worker (`public/` assets) and attaches the
custom domain `queerglobal.grandkru.com` in the `grandkru.com` zone.

Production deploys run from `.github/workflows/deploy-production.yml` after
merge to `main`, with GitHub Environment `production` approval.

## Bootstrap (required before first merge)

Run [bootstrap/](bootstrap/README.md) once to create:

- GitHub **production** environment with required reviewers
- GitHub environment secret **DOPPLER_TOKEN** (only secret stored in GitHub)
- Cloudflare **R2 bucket** and scoped **R2 API token** for OpenTofu state

The deploy workflow refuses to run if the production environment has no
reviewers (`scripts/verify-production-environment.mjs`).

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
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | Scoped R2 credentials from bootstrap outputs |

OpenTofu reads `cloudflare_account_id` from `TF_VAR_cloudflare_account_id`,
which CI sets from `CLOUDFLARE_ACCOUNT_ID` in Doppler.

Optional OpenTofu variables (defaults in `variables.tf`):

- `worker_name` (default `queerglobal-grandkru`)
- `hostname` (default `queerglobal.grandkru.com`)
- `zone_name` (default `grandkru.com`)

## Remote state (Cloudflare R2)

State is stored remotely so GitHub Actions and anyone running deploys use the
same state file.

**Doppler (production config)** should define:

1. `TF_STATE_BUCKET`: R2 bucket name (from bootstrap output).
2. `TF_STATE_KEY`: object key (default in CI:
   `queerglobal-grandkru/terraform.tfstate`).
3. `TF_STATE_REGION`: use `auto` for R2.
4. `TF_STATE_ENDPOINT`:
   `https://<CLOUDFLARE_ACCOUNT_ID>.r2.cloudflarestorage.com`
5. `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY`: scoped R2 token from
   bootstrap (not account-wide R2 write).

The GitHub deploy workflow exports `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`
from Doppler and writes `endpoint` plus R2 skip flags into `/tmp/backend.hcl`
when `TF_STATE_ENDPOINT` is set. See `backend.hcl.example`.

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
export TF_VAR_cloudflare_account_id="..."

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
```

## Manual apply (break-glass)

Only when CI is unavailable and you have approval:

```bash
doppler run --only-secrets CLOUDFLARE_API_TOKEN,CLOUDFLARE_ACCOUNT_ID,TF_STATE_BUCKET,TF_STATE_KEY,TF_STATE_REGION,TF_STATE_ENDPOINT,AWS_ACCESS_KEY_ID,AWS_SECRET_ACCESS_KEY -- \
  bash -ec '
    export TF_VAR_cloudflare_account_id="$CLOUDFLARE_ACCOUNT_ID"
    export AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY
    cat > /tmp/backend.hcl <<EOF
bucket = "$TF_STATE_BUCKET"
key    = "${TF_STATE_KEY:-queerglobal-grandkru/terraform.tfstate}"
region = "${TF_STATE_REGION:-auto}"
endpoint = "$TF_STATE_ENDPOINT"
skip_credentials_validation = true
skip_metadata_api_check = true
skip_region_validation = true
EOF
    tofu -chdir=infra init -backend-config=/tmp/backend.hcl
    tofu -chdir=infra plan -out=/tmp/tfplan
    tofu -chdir=infra apply /tmp/tfplan
  '
```

Do not attach `queerglobal.com` from this stack.

## Manual Worker rollback

In GitHub Actions, run **Deploy production** via **Run workflow**:

- `rollback_version_id`: Cloudflare Workers version UUID (fast Worker rollback)
- `rollback_release_tag`: Git tag from a prior deploy (OpenTofu redeploy)

Approve the `production` environment for either job.
