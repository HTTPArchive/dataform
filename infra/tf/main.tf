terraform {
  required_version = ">= 1.9.7"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = ">= 6.40.0"
    }
    google-beta = {
      source  = "hashicorp/google-beta"
      version = ">= 6.40.0"
    }
  }

  backend "gcs" {
    bucket = "tfstate-httparchive"
    prefix = "dataform/prod"
  }
}

provider "google" {
  project               = local.project
  region                = local.region
  user_project_override = true
  billing_project       = local.project
}

locals {
  function_identity = "cloud-function@httparchive.iam.gserviceaccount.com"
}


module "bigquery_export" {
  source = "./bigquery_export"

  project           = local.project
  region            = local.region
  function_identity = local.function_identity
  function_name     = "bigquery-export"
}

module "functions" {
  source            = "./functions"
  project           = local.project
  function_identity = local.function_identity
  edit_datasets     = local.edit_datasets
}

module "dataform_service" {
  source = "./dataform_service"

  project           = local.project
  region            = local.region
  location          = local.location
  function_identity = local.function_identity
  function_name     = "dataform-service"
}

module "masthead_agent" {
  source = "github.com/masthead-data/terraform-google-masthead-agent?ref=httparchive"
  # version = "~> 0.1.3"

  project_id = local.project

  # Enable only specific modules
  enable_modules = {
    bigquery      = true
    dataform      = true
    dataplex      = true
    analytics_hub = true
  }

  # Custom labels for resource management
  labels = {
    team = "dataops"
  }
}
