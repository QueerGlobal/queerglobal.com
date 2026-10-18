# Bootstrap (run once before the first protected deploy)

Creates resources that must exist before merge to `main`:

- GitHub **production** environment with required reviewers
- GitHub environment secret **DOPPLER_TOKEN**
- Cloudflare **R2 bucket** and a scoped **R2 API token** for OpenTofu state only

Run from a maintainer workstation with a Cloudflare admin token and a GitHub PAT
(`administration:write`, `secrets` on this repository):

```bash
export CLOUDFLARE_API_TOKEN="..."
export TF_VAR_cloudflare_account_id="..."
export TF_VAR_github_token="..."
export TF_VAR_production_reviewer_user_ids='[1234567]'   # GitHub numeric user IDs
export TF_VAR_doppler_token="..."                        # Doppler production service token

tofu -chdir=infra/bootstrap init -backend-config=../backend.hcl
tofu -chdir=infra/bootstrap plan
tofu -chdir=infra/bootstrap apply
```

Copy the sensitive outputs into Doppler (`TF_STATE_*`, `AWS_ACCESS_KEY_ID`,
`AWS_SECRET_ACCESS_KEY`). The deploy workflow reads them via Doppler; only
`DOPPLER_TOKEN` is stored in GitHub.

Use a separate state key, for example `queerglobal-grandkru/bootstrap.tfstate`,
in the same backend bucket as the main stack.
