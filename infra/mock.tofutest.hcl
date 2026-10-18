mock_provider "cloudflare" {}

run "plan_mock" {
  command = plan

  plan_options {
    refresh = false
  }

  variables {
    cloudflare_account_id = "00000000000000000000000000000001"
  }

  assert {
    condition     = cloudflare_workers_custom_domain.coming_soon.hostname == "queerglobal.grandkru.com"
    error_message = "Custom domain hostname must be queerglobal.grandkru.com."
  }
}

run "apply_mock" {
  command = apply

  plan_options {
    refresh = false
  }

  variables {
    cloudflare_account_id = "00000000000000000000000000000001"
  }

  assert {
    condition     = cloudflare_workers_custom_domain.coming_soon.hostname == "queerglobal.grandkru.com"
    error_message = "Custom domain hostname must be queerglobal.grandkru.com."
  }
}

run "reject_empty_account_id" {
  command = plan

  plan_options {
    refresh = false
  }

  variables {
    cloudflare_account_id = ""
  }

  expect_failures = [
    var.cloudflare_account_id,
  ]
}
