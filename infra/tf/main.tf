terraform {
  required_version = ">= 1.9.7"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = ">= 6.10.0"
    }
    google-beta = {
      source  = "hashicorp/google-beta"
      version = ">= 6.10.0"
    }
    archive = {
      source  = "hashicorp/archive"
      version = "2.6.0"
    }
  }

  backend "gcs" {
    bucket = "tfstate-httparchive"
    prefix = "prod"
  }
}

provider "google" {
  project               = local.project
  region                = local.region
  user_project_override = true
  billing_project       = local.project
}

locals {
  project        = "httparchive"
  project_number = "226352634162"
  region         = "us-central1"
  location       = "us"
}
