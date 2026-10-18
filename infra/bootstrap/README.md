# Bootstrap (run once before the first protected deploy)

Creates resources that must exist before merge to `main`:

- GitHub **production** environment with required reviewers (main only)
- GitHub environment secret **DOPPLER_TOKEN**
- Cloudflare **R2 bucket** and scoped **R2 API token** (state backend only)
- Cloudflare **deploy API token** (Workers and DNS, no R2 permissions)
- Doppler production secrets (`CLOUDFLARE_*`, `TF_STATE_*`, `AWS_*`)

Bootstrap uses **local state** in this directory (`terraform.tfstate`). It does not
use the R2 bucket it creates for its own state.

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

tofu -chdir=infra/bootstrap init -backend=false
tofu -chdir=infra/bootstrap apply
```

No manual copying of outputs is required; secrets are written to Doppler via the
provider. Only `DOPPLER_TOKEN` is stored in GitHub.
