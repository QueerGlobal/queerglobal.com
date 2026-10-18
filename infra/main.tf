data "cloudflare_zone" "grandkru" {
  filter = {
    name = var.zone_name
  }
}

resource "cloudflare_workers_script" "coming_soon" {
  account_id         = var.cloudflare_account_id
  script_name        = var.worker_name
  compatibility_date = var.compatibility_date
  main_module        = "worker.mjs"
  content_file       = "${path.module}/worker.mjs"
  content_sha256     = filesha256("${path.module}/worker.mjs")

  assets = {
    directory = "${path.module}/../public"
    config = {
      html_handling      = "auto-trailing-slash"
      not_found_handling = "404-page"
    }
  }
}

resource "cloudflare_workers_custom_domain" "coming_soon" {
  account_id = var.cloudflare_account_id
  hostname   = var.hostname
  service    = cloudflare_workers_script.coming_soon.script_name
  zone_id    = data.cloudflare_zone.grandkru.id
  zone_name  = var.zone_name
}
