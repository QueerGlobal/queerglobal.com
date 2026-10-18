# queerglobal.com

Coming-soon / mission page for QueerGlobal.

**Deploy target:** `queerglobal.grandkru.com` (Grand Kru Cloudflare). Not
deployed yet, and not linked from anywhere public until it is reviewed and
working.

QueerGlobal's own DNS is not in Grand Kru's hands, so work is finished on
this Grand Kru subdomain first. It is not `activism.grandkru.com/queerglobal`.
Do not change `queerglobal.com` DNS.

The page is served from `public/`. The previous Adobe XD export lives in
`archive/xd-export/` and is not served.

The intended product app is [qg-frontend-v2](https://github.com/QueerGlobal/qg-frontend-v2).
Contributor docs are in [qg-docs](https://github.com/QueerGlobal/qg-docs).

## Local preview

```bash
npm install
npm run dev
```

Then open the printed `localhost` URL. You should see the coming-soon page
with the mission, `info@queerglobal.com`, Project docs, and the app repo.

Optional: set `CLOUDFLARE_ACCOUNT_ID` in the environment when using Wrangler
against a remote account (local dev usually does not need it).

## Deploy (Mark, Grand Kru Cloudflare)

Production deploys are automated. After merge to `main`, the
[Deploy production](.github/workflows/deploy-production.yml) workflow runs in
the GitHub **production** environment (manual approval required). It uses
OpenTofu in `infra/` to publish the Worker and attach
`queerglobal.grandkru.com`, then smoke-tests the live site.

Secrets are not stored in this repository. **Only `DOPPLER_TOKEN` is synced to
GitHub** (via the bootstrap stack). All other production values live in Doppler
and are fetched at deploy time:

| Doppler secret / variable | Purpose |
|---------------------------|---------|
| `CLOUDFLARE_API_TOKEN` | OpenTofu provider and rollback API calls |
| `CLOUDFLARE_ACCOUNT_ID` | Account for Workers and custom domain |
| `TF_STATE_BUCKET` | Remote OpenTofu state bucket (from bootstrap) |
| `TF_STATE_ENDPOINT` | S3 API endpoint (required for Cloudflare R2) |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | Scoped R2 credentials for state (from bootstrap) |

Bootstrap also writes `TF_STATE_KEY` and `TF_STATE_REGION` to Doppler; CI uses
the same defaults (`queerglobal-grandkru/terraform.tfstate`, `auto`).

Run [infra/bootstrap](infra/bootstrap/README.md) once before the first merge so
the protected **production** environment, `DOPPLER_TOKEN`, R2 bucket, scoped R2
token, and Workers-only deploy token exist in Doppler.

The Cloudflare account ID and workers.dev subdomain name are intentionally
omitted from committed files. They may still appear in older git history.

### Production smoke test

After each deploy, CI requests `https://queerglobal.grandkru.com` and
requires:

- HTTP status **200**
- HTML containing the document title **`Queer Global: coming soon`**

The same check is implemented in `scripts/check-production-site.mjs` (`npm run
check:coming-soon`). It retries with backoff for about five minutes (configurable
via `CHECK_PRODUCTION_*` env vars) so TLS on a new custom domain can finish
provisioning. The workflow runs the check again after a 15-minute wait and
confirms `activism.grandkru.com` still does not show the coming-soon page.

If the smoke test or recheck fails after a successful OpenTofu apply, the
workflow rolls back the Worker to the version captured immediately before
deploy (or skips Worker rollback on the first deploy when no prior Worker
existed).

### Release tags and rollback

Each successful deploy pushes a Git tag `release/<run>-<sha>`. To redeploy a
previous release, run **Deploy production** via **Run workflow**, set
`rollback_release_tag` to the earlier tag (for example
`release/42-abc1234`), and approve the production environment.

Manual Worker version rollback (without checking out a tag) uses the
`rollback_version_id` workflow input with a Cloudflare Workers version UUID.

**First deploy, smoke or recheck failed:** there is no previous Worker version
to roll back to. Remove the new stack:

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
    tofu -chdir=infra destroy -auto-approve \
      -target=cloudflare_workers_custom_domain.coming_soon \
      -target=cloudflare_workers_script.coming_soon
  '
```

### Notes for running this

1. **OpenTofu** creates the Worker (static assets from `public/`) and the
   `queerglobal.grandkru.com` custom domain on the `grandkru.com` zone. Do
   not add a conflicting CNAME for `queerglobal` before apply: an existing
   CNAME blocks Custom Domains.

2. Do **not** point `queerglobal.com` or `www.queerglobal.com` at this
   Worker. Do **not** add `/queerglobal` on `activism-grandkru-hub`.

### OpenTofu remote state (R2)

Production deploys store state in a single remote bucket so GitHub Actions and
anyone running deploys use the same state file. The bootstrap stack creates the
bucket and a scoped R2 API token; copy those outputs into Doppler (`TF_STATE_*`,
`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`). The deploy workflow passes them
to OpenTofu init.

Besides bootstrap, Doppler secrets, and GitHub environment approval, no other
manual infrastructure steps are required. See [infra/README.md](infra/README.md).

Break-glass manual apply (when CI is unavailable): see [infra/README.md](infra/README.md).

## Later

Once the page is deployed, reviewed, and working, it can be linked from
public surfaces (org profile, repo READMEs). When apex DNS access arrives,
add `queerglobal.com` and `www.queerglobal.com` as additional Custom Domains
on the same Worker.
