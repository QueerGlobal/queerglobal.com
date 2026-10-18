terraform {
  required_version = ">= 1.13.1"

  backend "s3" {
    # Configure at init time (see infra/README.md). Example:
    #   tofu init -backend-config=backend.hcl
  }

  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "5.28.0"
    }
  }
}

provider "cloudflare" {
  # CLOUDFLARE_API_TOKEN in the environment (Doppler in CI).
}
