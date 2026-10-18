terraform {
  required_version = ">= 1.13.1"

  encryption {
    key_provider "pbkdf2" "bootstrap_v2" {
      passphrase = var.bootstrap_state_passphrase
    }

    key_provider "pbkdf2" "bootstrap" {
      passphrase = var.bootstrap_state_passphrase_previous != "" ? var.bootstrap_state_passphrase_previous : var.bootstrap_state_passphrase
    }

    method "aes_gcm" "bootstrap" {
      keys = key_provider.pbkdf2.bootstrap_v2
    }

    method "aes_gcm" "bootstrap_previous" {
      keys = key_provider.pbkdf2.bootstrap
    }

    state {
      method   = method.aes_gcm.bootstrap
      enforced = true
      fallback {
        method = method.aes_gcm.bootstrap_previous
      }
    }

    plan {
      method   = method.aes_gcm.bootstrap
      enforced = true
      fallback {
        method = method.aes_gcm.bootstrap_previous
      }
    }
  }
}
