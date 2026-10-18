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
    doppler_config                = "prd"
    doppler_bootstrap_config      = "bootstrap"
    production_reviewer_usernames = ["octocat"]
    bootstrap_state_passphrase    = "mock-bootstrap-passphrase"
  }

  assert {
    condition     = github_repository_environment.production.can_admins_bypass == false
    error_message = "Production environment must not allow admin bypass."
  }

  assert {
    condition = (
      github_repository_environment.production.deployment_branch_policy[0].custom_branch_policies == true &&
      github_repository_environment.production.deployment_branch_policy[0].protected_branches == false
    )
    error_message = "Production environment must use custom branch policies with protected_branches disabled."
  }

  assert {
    condition     = github_repository_environment_deployment_policy.production_main.branch_pattern == "main"
    error_message = "Deployment branch policy must be limited to main."
  }

  assert {
    condition     = github_actions_environment_secret.doppler_token.secret_name == "DOPPLER_TOKEN"
    error_message = "GitHub environment secret must be named DOPPLER_TOKEN."
  }

  assert {
    condition     = github_actions_environment_secret.doppler_token.plaintext_value == doppler_service_token.github_actions_production.key
    error_message = "DOPPLER_TOKEN must reference the Doppler service token key."
  }

  assert {
    condition     = doppler_service_token.github_actions_production.config == var.doppler_config
    error_message = "Deploy service token must target doppler_config only."
  }

  assert {
    condition     = doppler_service_token.github_actions_production.access == "read"
    error_message = "Deploy service token must be read-only."
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
    doppler_config                = "prd"
    doppler_bootstrap_config      = "bootstrap"
    production_reviewer_usernames = ["octocat"]
    bootstrap_state_passphrase    = "mock-bootstrap-passphrase"
  }

  assert {
    condition     = github_repository_environment.production.can_admins_bypass == false
    error_message = "Production environment must not allow admin bypass."
  }

  assert {
    condition     = github_repository_environment_deployment_policy.production_main.branch_pattern == "main"
    error_message = "Deployment branch policy must be limited to main."
  }

  assert {
    condition     = github_actions_environment_secret.doppler_token.secret_name == "DOPPLER_TOKEN"
    error_message = "GitHub environment secret must be named DOPPLER_TOKEN."
  }

  assert {
    condition     = github_actions_environment_secret.doppler_token.plaintext_value == doppler_service_token.github_actions_production.key
    error_message = "DOPPLER_TOKEN must reference the Doppler service token key."
  }

  assert {
    condition     = doppler_service_token.github_actions_production.config == var.doppler_config
    error_message = "Deploy service token must target doppler_config only."
  }

  assert {
    condition     = doppler_service_token.github_actions_production.access == "read"
    error_message = "Deploy service token must be read-only."
  }
}

run "reject_equal_doppler_configs" {
  command = plan

  plan_options {
    refresh = false
  }

  variables {
    cloudflare_account_id         = "00000000000000000000000000000001"
    github_token                  = "ghp_mock_bootstrap_token_000000000000"
    doppler_management_token      = "dp.st.mock_management_token_000000000000"
    doppler_project               = "queerglobal"
    doppler_config                = "prd"
    doppler_bootstrap_config      = "prd"
    production_reviewer_usernames = ["octocat"]
    bootstrap_state_passphrase    = "mock-bootstrap-passphrase"
  }

  expect_failures = [
    check.doppler_deploy_config_isolated_from_bootstrap,
  ]
}

run "reject_short_passphrase" {
  command = plan

  plan_options {
    refresh = false
  }

  variables {
    cloudflare_account_id         = "00000000000000000000000000000001"
    github_token                  = "ghp_mock_bootstrap_token_000000000000"
    doppler_management_token      = "dp.st.mock_management_token_000000000000"
    doppler_project               = "queerglobal"
    doppler_config                = "prd"
    doppler_bootstrap_config      = "bootstrap"
    production_reviewer_usernames = ["octocat"]
    bootstrap_state_passphrase    = "short"
  }

  expect_failures = [
    var.bootstrap_state_passphrase,
  ]
}
