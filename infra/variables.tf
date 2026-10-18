variable "cloudflare_account_id" {
  type        = string
  description = "Cloudflare account ID (set via TF_VAR_cloudflare_account_id or Doppler)."

  validation {
    condition     = length(var.cloudflare_account_id) > 0
    error_message = "cloudflare_account_id is required."
  }
}

variable "worker_name" {
  type        = string
  description = "Workers script name."
  default     = "queerglobal-grandkru"
}

variable "hostname" {
  type        = string
  description = "Custom domain hostname for the coming-soon Worker."
  default     = "queerglobal.grandkru.com"
}

variable "zone_name" {
  type        = string
  description = "Cloudflare zone that contains the custom domain."
  default     = "grandkru.com"
}

variable "compatibility_date" {
  type        = string
  description = "Workers compatibility date for new versions."
  default     = "2026-10-09"
}
