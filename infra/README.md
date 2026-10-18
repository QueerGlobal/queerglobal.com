# OpenTofu: queerglobal.grandkru.com

This stack deploys the coming-soon Worker (`public/` assets) and attaches the
custom domain `queerglobal.grandkru.com` in the `grandkru.com` zone.

Production deploys run from `.github/workflows/deploy-production.yml` after
merge to `main`, with GitHub Environment `production` approval.

## Secrets and variables

Inject these with [Doppler](https://www.doppler.com/) (preferred) or your
secret store. Do not commit account IDs or API tokens to this repo.

| Name | Used by |
|------|---------|
| `CLOUDFLARE_API_TOKEN` | OpenTofu Cloudflare provider, rollback script, R2 bucket bootstrap |
| `CLOUDFLARE_ACCOUNT_ID` | Deploy workflow, rollback script, R2 endpoint hostname |
| `TF_VAR_cloudflare_account_id` | Same value as `CLOUDFLARE_ACCOUNT_ID` for OpenTofu |
| `DOPPLER_TOKEN` | GitHub Actions (production environment secret) |
| `TF_STATE_BUCKET`, `TF_STATE_KEY`, `TF_STATE_REGION` | Remote state bucket and object key |
| `TF_STATE_ENDPOINT` | S3 API endpoint (Cloudflare R2) |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | Credentials for the S3-compatible state backend |

Optional OpenTofu variables (defaults in `variables.tf`):

- `worker_name` (default `queerglobal-grandkru`)
- `hostname` (default `queerglobal.grandkru.com`)
- `zone_name` (default `grandkru.com`)

## Remote state (Cloudflare R2)

State is stored remotely so GitHub Actions and anyone running deploys use the
same state file.

**Doppler (production config)** should define:

1. `TF_STATE_BUCKET`: R2 bucket name dedicated to OpenTofu state.
2. `TF_STATE_KEY`: object key (default in CI:
   `queerglobal-grandkru/terraform.tfstate`).
3. `TF_STATE_REGION`: use `auto` for R2.
4. `TF_STATE_ENDPOINT`:
   `https://<CLOUDFLARE_ACCOUNT_ID>.r2.cloudflarestorage.com`
5. `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY`: R2 API token with
   read/write on that bucket (Cloudflare dashboard: R2, Manage R2 API Tokens).

**Bucket creation:** the GitHub deploy workflow runs
`scripts/ensure-tf-state-bucket.mjs` before `tofu init` (idempotent). To run
the same step locally:

```bash
npm install
doppler run -- node scripts/ensure-tf-state-bucket.mjs
```

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
tofu fmt -check -recursive infra/
```

## Manual apply (break-glass)

Only when CI is unavailable and you have approval:

```bash
doppler run -- tofu -chdir=infra apply
```

Do not attach `queerglobal.com` from this stack.

## Manual Worker rollback

In GitHub Actions, run **Deploy production** via **Run workflow**, provide
`rollback_version_id`, and approve the `production` environment. That runs
`scripts/worker-rollback.mjs` without applying OpenTofu.
