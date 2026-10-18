terraform {
  required_version = ">= 1.6.0"

  # Local state only (terraform.tfstate in this directory). Do not store bootstrap
  # state in the R2 bucket this stack creates.

  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "5.28.0"
    }
    github = {
      source  = "integrations/github"
      version = "6.6.0"
    }
    doppler = {
      source  = "DopplerHQ/doppler"
      version = "1.17.0"
    }
  }
}

provider "cloudflare" {
  # CLOUDFLARE_API_TOKEN in the environment (bootstrap admin token).
}

provider "github" {
  owner = var.github_owner
  token = var.github_token
}

provider "doppler" {
  doppler_token = var.doppler_management_token
}
