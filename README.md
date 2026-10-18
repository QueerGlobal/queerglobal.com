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

Secrets are not stored in this repository. Configure them in Doppler and sync
to the GitHub `production` environment (see [infra/README.md](infra/README.md)):

| Secret / variable | Purpose |
|-------------------|---------|
| `DOPPLER_TOKEN` | GitHub Actions: fetch config at deploy time |
| `CLOUDFLARE_API_TOKEN` | OpenTofu provider and rollback API calls |
| `CLOUDFLARE_ACCOUNT_ID` | Account for Workers and custom domain |
| `TF_VAR_cloudflare_account_id` | Same value as `CLOUDFLARE_ACCOUNT_ID` for OpenTofu |
| `TF_STATE_BUCKET`, `TF_STATE_KEY`, `TF_STATE_REGION` | Remote OpenTofu state bucket and object key |
| `TF_STATE_ENDPOINT` | S3 API endpoint (required for Cloudflare R2) |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | R2 (or S3) credentials for the state backend |

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
provisioning. If the smoke test still fails after a successful OpenTofu apply,
the workflow rolls back the Worker to the version captured immediately before
deploy (or skips rollback on the first deploy when no prior Worker existed).

### Notes for running this

1. **OpenTofu** creates the Worker (static assets from `public/`) and the
   `queerglobal.grandkru.com` custom domain on the `grandkru.com` zone. Do
   not add a conflicting CNAME for `queerglobal` before apply: an existing
   CNAME blocks Custom Domains.

2. Confirm the workers.dev preview URL printed by Wrangler or shown in the
   Cloudflare dashboard (Workers and Pages, then your Worker, then the
   workers.dev subdomain shown for the account).

3. If apply succeeds but the hostname is missing (token lacks zone write, or
   a leftover CNAME exists):

   - Cloudflare dashboard: Workers and Pages, then `queerglobal-grandkru`, then
     Settings, then Domains and Routes, then Add, then Custom Domain, then
     `queerglobal.grandkru.com`
   - If a leftover CNAME exists on `queerglobal` in the `grandkru.com` zone,
     delete it first, then add the Custom Domain so Cloudflare can create the
     record.

4. Do **not** point `queerglobal.com` or `www.queerglobal.com` at this
   Worker. Do **not** add `/queerglobal` on `activism-grandkru-hub`.

### OpenTofu remote state (R2)

Production deploys store state in a single remote bucket so CI and operators
share one source of truth. Configure these in Doppler (synced to the GitHub
`production` environment); the deploy workflow passes them to OpenTofu init:

| Variable | Purpose |
|----------|---------|
| `TF_STATE_BUCKET` | Bucket name (for example an R2 bucket in Grand Kru Cloudflare) |
| `TF_STATE_KEY` | State object key (default `queerglobal-grandkru/terraform.tfstate`) |
| `TF_STATE_REGION` | Backend region (`auto` for R2) |
| `TF_STATE_ENDPOINT` | R2 S3 endpoint: `https://<CLOUDFLARE_ACCOUNT_ID>.r2.cloudflarestorage.com` |
| `AWS_ACCESS_KEY_ID` | R2 access key ID (S3-compatible API) |
| `AWS_SECRET_ACCESS_KEY` | R2 secret access key |

Create the bucket once (idempotent):

```bash
doppler run -- node scripts/ensure-tf-state-bucket.mjs
```

That is the only manual infrastructure step besides Doppler secrets and GitHub
environment approval. See [infra/README.md](infra/README.md) for backend.hcl
details.

Break-glass manual apply (when CI is unavailable): see [infra/README.md](infra/README.md).

## Later

Once the page is deployed, reviewed, and working, it can be linked from
public surfaces (org profile, repo READMEs). When apex DNS access arrives,
add `queerglobal.com` and `www.queerglobal.com` as additional Custom Domains
on the same Worker.
