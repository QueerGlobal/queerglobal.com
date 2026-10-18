mock_provider "cloudflare" {}

run "plan_mock" {
  command = plan

  plan_options {
    refresh = false
  }

  variables {
    cloudflare_account_id = "00000000000000000000000000000001"
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
}
