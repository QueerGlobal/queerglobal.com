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
| `CLOUDFLARE_API_TOKEN` | OpenTofu Cloudflare provider |
| `CLOUDFLARE_ACCOUNT_ID` | Deploy workflow, rollback script |
| `TF_VAR_cloudflare_account_id` | Same value as `CLOUDFLARE_ACCOUNT_ID` for OpenTofu |
| `DOPPLER_TOKEN` | GitHub Actions (production environment secret) |
| `TF_STATE_BUCKET`, `TF_STATE_KEY`, `TF_STATE_REGION` | Optional S3 remote state (see below) |

Optional OpenTofu variables (defaults in `variables.tf`):

- `worker_name` (default `queerglobal-grandkru`)
- `hostname` (default `queerglobal.grandkru.com`)
- `zone_name` (default `grandkru.com`)

## Remote state

State is stored remotely so CI and operators share one source of truth. Create
an S3 bucket (or compatible store) and pass backend settings at init:

```bash
cat > backend.hcl <<'EOF'
bucket = "YOUR_TF_STATE_BUCKET"
key    = "queerglobal-grandkru/terraform.tfstate"
region = "YOUR_AWS_REGION"
EOF

export CLOUDFLARE_API_TOKEN="..."
export TF_VAR_cloudflare_account_id="..."

tofu -chdir=infra init -backend-config=backend.hcl
tofu -chdir=infra plan
```

In GitHub Actions, the deploy workflow runs `tofu init` with the same
`-backend-config` values from Doppler (`TF_STATE_*`).

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
