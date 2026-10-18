mock_provider "cloudflare" {}
mock_provider "github" {}
mock_provider "doppler" {}

override_data {
  target = data.cloudflare_zone.grandkru
  values = {
    id = "mock-grandkru-zone-id"
  }
}

override_data {
  target = data.cloudflare_account_api_token_permission_groups_list.r2_bucket_item_read
  values = {
    result = [{
      id            = "mock-pg-r2-read"
      name          = "Workers R2 Storage Bucket Item Read"
      category      = "Workers"
      is_selectable = true
      scopes        = []
    }]
  }
}

override_data {
  target = data.cloudflare_account_api_token_permission_groups_list.r2_bucket_item_write
  values = {
    result = [{
      id            = "mock-pg-r2-write"
      name          = "Workers R2 Storage Bucket Item Write"
      category      = "Workers"
      is_selectable = true
      scopes        = []
    }]
  }
}

override_data {
  target = data.cloudflare_account_api_token_permission_groups_list.workers_scripts_write
  values = {
    result = [{
      id            = "mock-pg-workers-scripts-write"
      name          = "Workers Scripts Write"
      category      = "Workers"
      is_selectable = true
      scopes        = []
    }]
  }
}

override_data {
  target = data.cloudflare_account_api_token_permission_groups_list.workers_routes_write
  values = {
    result = [{
      id            = "mock-pg-workers-routes-write"
      name          = "Workers Routes Write"
      category      = "Workers"
      is_selectable = true
      scopes        = []
    }]
  }
}

override_data {
  target = data.cloudflare_account_api_token_permission_groups_list.zone_read
  values = {
    result = [{
      id            = "mock-pg-zone-read"
      name          = "Zone Read"
      category      = "Zone"
      is_selectable = true
      scopes        = []
    }]
  }
}

override_data {
  target = data.cloudflare_account_api_token_permission_groups_list.dns_write
  values = {
    result = [{
      id            = "mock-pg-dns-write"
      name          = "DNS Write"
      category      = "Zone"
      is_selectable = true
      scopes        = []
    }]
  }
}

override_data {
  target = data.github_user.production_reviewer["octocat"]
  values = {
    id = 1
  }
}

run "plan_mock" {
  command = plan

  plan_options {
    refresh = false
  }

  variables {
    cloudflare_account_id         = "00000000000000000000000000000001"
    github_token                  = "ghp_mock_bootstrap_token_000000000000"
    doppler_management_token      = "dp.st.mock_management_token_000000000000"
    doppler_project               = "queerglobal"
    production_reviewer_usernames = ["octocat"]
    bootstrap_state_passphrase    = "mock-bootstrap-passphrase"
  }
}

run "apply_mock" {
  command = apply

  plan_options {
    refresh = false
  }

  variables {
    cloudflare_account_id         = "00000000000000000000000000000001"
    github_token                  = "ghp_mock_bootstrap_token_000000000000"
    doppler_management_token      = "dp.st.mock_management_token_000000000000"
    doppler_project               = "queerglobal"
    production_reviewer_usernames = ["octocat"]
    bootstrap_state_passphrase    = "mock-bootstrap-passphrase"
  }
}
