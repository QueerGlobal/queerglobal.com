output "tf_state_bucket_name" {
  value       = cloudflare_r2_bucket.tf_state.name
  description = "R2 bucket for OpenTofu state (also written to Doppler TF_STATE_BUCKET)."
}

output "tf_state_endpoint" {
  value       = local.tf_state_endpoint
  description = "S3-compatible endpoint (also written to Doppler TF_STATE_ENDPOINT)."
}

output "r2_access_key_id" {
  value       = cloudflare_account_token.tf_state_r2.id
  description = "R2 access key ID (also written to Doppler AWS_ACCESS_KEY_ID)."
  sensitive   = true
}

output "r2_secret_access_key" {
  value       = local.r2_secret_access_key
  description = "R2 secret access key as sha256(token.value) per Cloudflare R2 docs."
  sensitive   = true
}

output "github_production_environment" {
  value       = github_repository_environment.production.environment
  description = "GitHub Actions environment with required reviewers."
}

output "doppler_config_written" {
  value       = "${var.doppler_project}/${var.doppler_config}"
  description = "Doppler project/config that received bootstrap secrets."
}
