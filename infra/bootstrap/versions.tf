terraform {
  required_version = ">= 1.6.0"

  backend "s3" {
    # Same remote backend as infra/; use key queerglobal-grandkru/bootstrap.tfstate at init.
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
  }
}

provider "cloudflare" {
  # CLOUDFLARE_API_TOKEN in the environment (bootstrap admin token).
}

provider "github" {
  owner = var.github_owner
  token = var.github_token
}
