resource "doppler_secret" "cloudflare_api_token" {
  project = var.doppler_project
  config  = var.doppler_config
  name    = "CLOUDFLARE_API_TOKEN"
  value   = cloudflare_account_token.deploy_workers.value
}

resource "doppler_secret" "cloudflare_account_id" {
  project = var.doppler_project
  config  = var.doppler_config
  name    = "CLOUDFLARE_ACCOUNT_ID"
  value   = var.cloudflare_account_id
}

resource "doppler_secret" "tf_state_bucket" {
  project = var.doppler_project
  config  = var.doppler_config
  name    = "TF_STATE_BUCKET"
  value   = cloudflare_r2_bucket.tf_state.name
}

resource "doppler_secret" "tf_state_key" {
  project = var.doppler_project
  config  = var.doppler_config
  name    = "TF_STATE_KEY"
  value   = var.tf_state_object_key
}

resource "doppler_secret" "tf_state_region" {
  project = var.doppler_project
  config  = var.doppler_config
  name    = "TF_STATE_REGION"
  value   = "auto"
}

resource "doppler_secret" "tf_state_endpoint" {
  project = var.doppler_project
  config  = var.doppler_config
  name    = "TF_STATE_ENDPOINT"
  value   = local.tf_state_endpoint
}

resource "doppler_secret" "aws_access_key_id" {
  project = var.doppler_project
  config  = var.doppler_config
  name    = "AWS_ACCESS_KEY_ID"
  value   = cloudflare_account_token.tf_state_r2.id
}

resource "doppler_secret" "aws_secret_access_key" {
  project = var.doppler_project
  config  = var.doppler_config
  name    = "AWS_SECRET_ACCESS_KEY"
  value   = local.r2_secret_access_key
}
