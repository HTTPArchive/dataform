terraform {
  required_version = ">= 1.11.4"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "7.13.0"
    }
    google-beta = {
      source  = "hashicorp/google-beta"
      version = "7.13.0"
    }
  }

  backend "gcs" {
    bucket = "tfstate-httparchive"
    prefix = "dataform/prod"
  }
}

provider "google" {
  project               = var.project
  region                = var.region
  user_project_override = true
  billing_project       = var.project
}


module "bigquery_export" {
  source = "./bigquery-export"

  project           = var.project
  region            = var.region
  function_identity = var.function_identity
  function_name     = "bigquery-export"
}

module "dataform_service" {
  source = "./dataform-service"

  project           = var.project
  region            = var.region
  location          = var.location
  function_identity = var.function_identity
  function_name     = "dataform-service"
}

module "masthead_agent" {
  source = "github.com/masthead-data/terraform-google-masthead-agent?ref=httparchive"
  # source  = "masthead-data/masthead-agent/google"
  # version = "~> 0.1.3"

  project_id = var.project

  enable_privatelogviewer_role = false
  enable_apis                  = false

  # Enable only specific modules
  enable_modules = {
    bigquery      = true
    dataform      = true
    dataplex      = true
    analytics_hub = true
  }
}
