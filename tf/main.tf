terraform {
  required_version = ">= 1.9.7"
  required_providers {
    google = ">= 6.6.0"
  }

  backend "gcs" {
    bucket = "tfstate-prod-httparchive"
  }
}

provider "google" {
  project = local.project
  region  = local.region
}
