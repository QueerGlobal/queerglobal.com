data "cloudflare_zone" "grandkru" {
  filter = {
    name = var.zone_name
  }
}

data "cloudflare_account_api_token_permission_groups_list" "r2_bucket_item_read" {
  account_id = var.cloudflare_account_id
  name       = "Workers R2 Storage Bucket Item Read"
}

data "cloudflare_account_api_token_permission_groups_list" "r2_bucket_item_write" {
  account_id = var.cloudflare_account_id
  name       = "Workers R2 Storage Bucket Item Write"
}

data "cloudflare_account_api_token_permission_groups_list" "workers_scripts_write" {
  account_id = var.cloudflare_account_id
  name       = "Workers Scripts Write"
}

data "cloudflare_account_api_token_permission_groups_list" "workers_routes_write" {
  account_id = var.cloudflare_account_id
  name       = "Workers Routes Write"
}

data "cloudflare_account_api_token_permission_groups_list" "zone_read" {
  account_id = var.cloudflare_account_id
  name       = "Zone Read"
}

data "cloudflare_account_api_token_permission_groups_list" "dns_write" {
  account_id = var.cloudflare_account_id
  name       = "DNS Write"
}

locals {
  r2_bucket_resource      = "com.cloudflare.edge.r2.bucket.${var.cloudflare_account_id}_default_${var.tf_state_bucket_name}"
  deploy_account_resource = "com.cloudflare.api.account.${var.cloudflare_account_id}"
  deploy_zone_resource    = "com.cloudflare.api.account.zone.${data.cloudflare_zone.grandkru.id}"
  tf_state_endpoint       = "https://${var.cloudflare_account_id}.r2.cloudflarestorage.com"
  r2_secret_access_key    = sha256(cloudflare_account_token.tf_state_r2.value)
}

resource "cloudflare_r2_bucket" "tf_state" {
  account_id = var.cloudflare_account_id
  name       = var.tf_state_bucket_name
}

resource "cloudflare_account_token" "tf_state_r2" {
  name       = var.r2_api_token_name
  account_id = var.cloudflare_account_id

  policies = [{
    effect = "allow"
    permission_groups = [
      { id = data.cloudflare_account_api_token_permission_groups_list.r2_bucket_item_read.result[0].id },
      { id = data.cloudflare_account_api_token_permission_groups_list.r2_bucket_item_write.result[0].id },
    ]
    resources = jsonencode({
      (local.r2_bucket_resource) = "*"
    })
  }]
}

resource "cloudflare_account_token" "deploy_workers" {
  name       = var.deploy_api_token_name
  account_id = var.cloudflare_account_id

  policies = [
    {
      effect = "allow"
      permission_groups = [
        { id = data.cloudflare_account_api_token_permission_groups_list.workers_scripts_write.result[0].id },
      ]
      resources = jsonencode({
        (local.deploy_account_resource) = "*"
      })
    },
    {
      effect = "allow"
      permission_groups = [
        { id = data.cloudflare_account_api_token_permission_groups_list.workers_routes_write.result[0].id },
        { id = data.cloudflare_account_api_token_permission_groups_list.zone_read.result[0].id },
        { id = data.cloudflare_account_api_token_permission_groups_list.dns_write.result[0].id },
      ]
      resources = jsonencode({
        (local.deploy_zone_resource) = "*"
      })
    },
  ]
}

data "github_user" "production_reviewer" {
  for_each = toset(var.production_reviewer_usernames)
  username = each.value
}

locals {
  production_reviewer_user_ids = [
    for username in var.production_reviewer_usernames :
    tonumber(data.github_user.production_reviewer[username].id)
  ]
}

resource "github_repository_environment" "production" {
  repository  = var.github_repository
  environment = var.production_environment_name

  can_admins_bypass = false

  reviewers {
    users = local.production_reviewer_user_ids
  }

  deployment_branch_policy {
    protected_branches     = false
    custom_branch_policies = true
  }
}

resource "github_repository_environment_deployment_policy" "production_main" {
  repository     = var.github_repository
  environment    = github_repository_environment.production.environment
  branch_pattern = "main"
}

# Scoped to var.doppler_config only (validated != doppler_bootstrap_config). access is read.
resource "doppler_service_token" "github_actions_production" {
  project = var.doppler_project
  config  = var.doppler_config
  name    = "github-actions-${var.production_environment_name}"
  access  = "read"
}

resource "github_actions_environment_secret" "doppler_token" {
  repository      = var.github_repository
  environment     = github_repository_environment.production.environment
  secret_name     = "DOPPLER_TOKEN"
  plaintext_value = doppler_service_token.github_actions_production.key
}
