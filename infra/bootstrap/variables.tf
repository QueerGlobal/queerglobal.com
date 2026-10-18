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

variable "doppler_management_token" {
  type        = string
  description = "Doppler personal/team token with write access (Terraform doppler provider)."
  sensitive   = true
}

variable "doppler_project" {
  type        = string
  description = "Doppler project slug for production secrets."
}

variable "doppler_config" {
  type        = string
  description = "Doppler config slug (for example prd)."
  default     = "prd"
}

variable "deploy_api_token_name" {
  type        = string
  description = "Cloudflare API token name for deploys (Workers only, no R2)."
  default     = "queerglobal-grandkru-deploy"
}

variable "tf_state_object_key" {
  type        = string
  description = "OpenTofu state object key for the main stack."
  default     = "queerglobal-grandkru/terraform.tfstate"
}

variable "zone_name" {
  type        = string
  description = "Cloudflare zone for Workers custom domains (deploy token zone scope)."
  default     = "grandkru.com"
}

variable "bootstrap_state_passphrase" {
  type        = string
  sensitive   = true
  description = "Encrypts local bootstrap state (min 16 characters). TF_VAR_bootstrap_state_passphrase from Doppler; never commit."
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
