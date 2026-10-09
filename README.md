# queerglobal.com

Coming-soon / mission page for QueerGlobal.

**Public URL:** https://queerglobal.grandkru.com

Until QueerGlobal's own DNS is in Grand Kru's hands, anything that would
launch on `queerglobal.com` launches on `queerglobal.grandkru.com` instead.
This Worker is that home. It is not `activism.grandkru.com/queerglobal`.
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

## Deploy (Mark — Grand Kru Cloudflare)

No Cloudflare token is in this agent environment, so the custom domain is
not attached yet. Account `120d0baf442854f3f9b21e237688ae98` already hosts
other `*.grandkru.com` Workers (`activism`, `nodatacenter`, …).

1. From this branch (merge is not required):

   ```bash
   npm install
   npx wrangler deploy
   ```

   Wrangler will publish Worker `queerglobal-grandkru` and, because
   `custom_domain = true`, create the DNS record + certificate for
   `queerglobal.grandkru.com` on the `grandkru.com` zone. Do not add a
   CNAME first — an existing CNAME blocks Custom Domains.

2. Confirm the workers.dev preview from wrangler output (other Workers on
   this account use `*.mark-120.workers.dev`, so expect something like
   `https://queerglobal-grandkru.mark-120.workers.dev`).

3. If `wrangler deploy` publishes the Worker but skips the hostname
   (token lacks zone write, or `queerglobal.grandkru.com` already has a
   CNAME):

   - Cloudflare dashboard → Workers & Pages → `queerglobal-grandkru` →
     Settings → Domains & Routes → Add → Custom Domain →
     `queerglobal.grandkru.com`
   - If a leftover CNAME exists on `queerglobal` in the `grandkru.com`
     zone, delete it first, then add the Custom Domain so Cloudflare can
     create the record.

4. Do **not** point `queerglobal.com` or `www.queerglobal.com` at this
   Worker. Do **not** add `/queerglobal` on `activism-grandkru-hub`.

## Moving to queerglobal.com later

When apex DNS access arrives, add `queerglobal.com` and `www.queerglobal.com`
as additional Custom Domains on the same Worker and update the canonical URL
in `public/index.html`. Nothing else needs to change.
