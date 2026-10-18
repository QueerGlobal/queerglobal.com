terraform {
  required_version = ">= 1.13.1"

  backend "s3" {
    # Configure at init (see infra/bootstrap/README.md and scripts/bootstrap-tofu-init.sh).
  }

  encryption {
    key_provider "pbkdf2" "bootstrap" {
      passphrase = var.bootstrap_state_passphrase
    }

    key_provider "pbkdf2" "bootstrap_previous" {
      passphrase = var.bootstrap_state_passphrase_previous != "" ? var.bootstrap_state_passphrase_previous : var.bootstrap_state_passphrase
    }

    method "aes_gcm" "bootstrap" {
      keys = key_provider.pbkdf2.bootstrap
    }

    method "aes_gcm" "bootstrap_previous" {
      keys = key_provider.pbkdf2.bootstrap_previous
    }

    state {
      method = method.aes_gcm.bootstrap
      fallback {
        method = method.aes_gcm.bootstrap_previous
      }
    }

    plan {
      method = method.aes_gcm.bootstrap
      fallback {
        method = method.aes_gcm.bootstrap_previous
      }
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
