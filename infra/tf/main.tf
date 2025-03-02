terraform {
  required_version = ">= 1.9.7"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = ">= 6.13.0"
    }
    google-beta = {
      source  = "hashicorp/google-beta"
      version = ">= 6.13.0"
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

module "dataform_export" {
  source = "./dataform_export"

  project_number    = local.project_number
  region            = local.region
  function_identity = "cloud-function@httparchive.iam.gserviceaccount.com"
  function_name     = "dataform-export"
  remote_functions_connection  = google_bigquery_connection.remote-functions.id
}

module "dataform_trigger" {
  source = "./dataform_trigger"

  project           = local.project
  project_number    = local.project_number
  region            = local.region
  function_identity = "cloud-function@httparchive.iam.gserviceaccount.com"
  function_name     = "dataform-trigger"
}

module "bigquery_export" {
  source = "./bigquery_export"

  project           = local.project
  region            = local.region
  location          = local.location
  function_identity = "cloud-function@httparchive.iam.gserviceaccount.com"
  function_name     = "bigquery-export"
}

module "masthead" {
  source = "./masthead"

  project = local.project
}
