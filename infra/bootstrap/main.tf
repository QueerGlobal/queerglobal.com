data "cloudflare_account_api_token_permission_groups_list" "r2_bucket_item_read" {
  account_id = var.cloudflare_account_id
  name       = "Workers R2 Storage Bucket Item Read"
}

data "cloudflare_account_api_token_permission_groups_list" "r2_bucket_item_write" {
  account_id = var.cloudflare_account_id
  name       = "Workers R2 Storage Bucket Item Write"
}

locals {
  r2_bucket_resource = "com.cloudflare.edge.r2.bucket.${var.cloudflare_account_id}_default_${var.tf_state_bucket_name}"
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

resource "github_repository_environment" "production" {
  repository  = var.github_repository
  environment = var.production_environment_name

  reviewers {
    users = var.production_reviewer_user_ids
  }

  deployment_branch_policy {
    protected_branches     = true
    custom_branch_policies = false
  }
}

resource "github_actions_environment_secret" "doppler_token" {
  repository      = var.github_repository
  environment     = github_repository_environment.production.environment
  secret_name     = "DOPPLER_TOKEN"
  plaintext_value = var.doppler_token
}
