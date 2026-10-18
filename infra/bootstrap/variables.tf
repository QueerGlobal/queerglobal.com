variable "cloudflare_account_id" {
  type        = string
  description = "Cloudflare account ID for R2 and Workers."

  validation {
    condition     = can(regex("^[0-9a-f]{32}$", var.cloudflare_account_id))
    error_message = "cloudflare_account_id must be a 32-character lowercase hex string."
  }
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
  description = "GitHub fine-grained PAT: Administration (write), Environments (write), Actions (read), Metadata (read) on this repository."
  sensitive   = true

  validation {
    condition     = length(var.github_token) > 0
    error_message = "github_token is required."
  }
}

variable "production_environment_name" {
  type        = string
  description = "GitHub Actions environment name for production deploys."
  default     = "production"
}

variable "production_reviewer_usernames" {
  type        = list(string)
  description = "GitHub usernames allowed to approve production deployments."

  validation {
    condition = length(var.production_reviewer_usernames) > 0 && alltrue([
      for username in var.production_reviewer_usernames : length(trimspace(username)) > 0
    ])
    error_message = "production_reviewer_usernames must include at least one non-empty username."
  }
}

variable "doppler_management_token" {
  type        = string
  description = "Doppler personal token (dp.pt.) or service account token (dp.sa.) with Collaborator or higher on the prd environment (creates doppler_service_token)."
  sensitive   = true

  validation {
    condition     = length(var.doppler_management_token) > 0
    error_message = "doppler_management_token is required."
  }
}

variable "doppler_project" {
  type        = string
  description = "Doppler project slug for production secrets."

  validation {
    condition     = length(var.doppler_project) > 0
    error_message = "doppler_project is required."
  }
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
  description = "Encrypts bootstrap state. Load from Doppler doppler_bootstrap_config (BOOTSTRAP_STATE_PASSPHRASE); never commit or store in the deploy config."

  validation {
    condition     = length(var.bootstrap_state_passphrase) >= 16
    error_message = "bootstrap_state_passphrase must be at least 16 characters."
  }
}

variable "bootstrap_state_passphrase_previous" {
  type        = string
  sensitive   = true
  default     = ""
  description = "During passphrase rotation only: previous passphrase for encryption fallback (min 16 characters when set)."

  validation {
    condition     = var.bootstrap_state_passphrase_previous == "" || length(var.bootstrap_state_passphrase_previous) >= 16
    error_message = "bootstrap_state_passphrase_previous must be empty or at least 16 characters."
  }
}

variable "bootstrap_state_object_key" {
  type        = string
  description = "OpenTofu remote state object key for this bootstrap stack in R2."
  default     = "queerglobal-grandkru/bootstrap.tfstate"
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
