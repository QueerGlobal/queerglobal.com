terraform {
  required_version = ">= 1.13.1"

  # Local state only (terraform.tfstate in this directory). Do not store bootstrap
  # state in the R2 bucket this stack creates.

  encryption {
    key_provider "pbkdf2" "bootstrap" {
      passphrase = var.bootstrap_state_passphrase
    }

    method "aes_gcm" "bootstrap" {
      keys = key_provider.pbkdf2.bootstrap
    }

    state {
      method   = method.aes_gcm.bootstrap
      enforced = true
    }

    plan {
      method   = method.aes_gcm.bootstrap
      enforced = true
    }
  }

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
