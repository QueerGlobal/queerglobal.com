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
  description = "GitHub fine-grained PAT: Administration (write), Environments (write), Metadata (read) on this repository."
  sensitive   = true
}

variable "production_environment_name" {
  type        = string
  description = "GitHub Actions environment name for production deploys."
  default     = "production"
}

variable "production_reviewer_usernames" {
  type        = list(string)
  description = "GitHub usernames allowed to approve production deployments."
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
  description = "Doppler config slug for deploy secrets (for example prd). The GitHub Actions service token is read-only on this config."
  default     = "prd"
}

variable "doppler_bootstrap_config" {
  type        = string
  description = "Doppler config for bootstrap-only secrets (for example bootstrap). Must not be readable by the deploy service token on doppler_config."
  default     = "bootstrap"
}

variable "deploy_api_token_name" {
  type        = string
  description = "Cloudflare API token name for deploys (Workers on the account; routes/DNS on the zone)."
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
  description = "Encrypts local bootstrap state. Load from Doppler doppler_bootstrap_config (BOOTSTRAP_STATE_PASSPHRASE); never commit or store in the deploy config."

  validation {
    condition     = length(var.bootstrap_state_passphrase) >= 16
    error_message = "bootstrap_state_passphrase must be at least 16 characters."
  }
}

variable "tf_state_bucket_name" {
  type        = string
  description = "R2 bucket name for OpenTofu remote state."
  default     = "queerglobal-grandkru-tfstate"
}

variable "r2_api_token_name" {
  type        = string
  description = "Display name for the scoped R2 API token (also written to Doppler by bootstrap)."
  default     = "queerglobal-grandkru-tfstate-r2"
}
