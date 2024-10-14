terraform {
  required_version = ">= 1.9.7"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = ">= 6.7.0"
    }
    google-beta = {
      source  = "hashicorp/google-beta"
      version = ">= 6.7.0"
    }
    archive = {
      source  = "hashicorp/archive"
      version = "2.6.0"
    }

  }

  backend "gcs" {
    bucket = "tfstate-prod-httparchive"
  }
}

provider "google" {
  project = local.project
  region  = local.region
}
