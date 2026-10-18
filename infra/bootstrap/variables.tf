variable "cloudflare_account_id" {
  type        = string
  description = "Cloudflare account ID for R2 and Workers."
}

variable "github_owner" {
  type        = string
  description = "GitHub organization or user that owns the repository."
  default     = "QueerGlobal"
}

variable "github_repository" {
  type        = string
  description = "Repository name (without owner)."
  default     = "queerglobal.com"
}

variable "github_token" {
  type        = string
  description = "GitHub PAT with administration:write and secrets for the repository."
  sensitive   = true
}

variable "production_environment_name" {
  type        = string
  description = "GitHub Actions environment name for production deploys."
  default     = "production"
}

variable "production_reviewer_user_ids" {
  type        = list(number)
  description = "GitHub user IDs allowed to approve production deployments."
}

variable "doppler_token" {
  type        = string
  description = "Doppler service token for the production config (stored in GitHub environment secret DOPPLER_TOKEN)."
  sensitive   = true
}

variable "tf_state_bucket_name" {
  type        = string
  description = "R2 bucket name for OpenTofu remote state."
  default     = "queerglobal-grandkru-tfstate"
}

variable "r2_api_token_name" {
  type        = string
  description = "Display name for the scoped R2 API token written to Doppler manually from bootstrap output."
  default     = "queerglobal-grandkru-tfstate-r2"
}
