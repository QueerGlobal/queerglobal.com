output "tf_state_bucket_name" {
  value       = cloudflare_r2_bucket.tf_state.name
  description = "R2 bucket for OpenTofu state (TF_STATE_BUCKET in Doppler)."
}

output "tf_state_endpoint" {
  value       = "https://${var.cloudflare_account_id}.r2.cloudflarestorage.com"
  description = "S3-compatible endpoint (TF_STATE_ENDPOINT in Doppler)."
}

output "r2_access_key_id" {
  value       = cloudflare_account_token.tf_state_r2.id
  description = "R2 access key ID (AWS_ACCESS_KEY_ID in Doppler)."
  sensitive   = true
}

output "r2_secret_access_key" {
  value       = cloudflare_account_token.tf_state_r2.value
  description = "R2 secret access key (AWS_SECRET_ACCESS_KEY in Doppler)."
  sensitive   = true
}

output "github_production_environment" {
  value       = github_repository_environment.production.environment
  description = "GitHub Actions environment with required reviewers."
}
