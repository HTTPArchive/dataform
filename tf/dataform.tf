locals {
  dataform_service_account_email = "service-226352634162@gcp-sa-dataform.iam.gserviceaccount.com"
}

import {
  provider = google-beta
  id = "projects/${local.project}/locations/${local.region}/repositories/crawl-data"
  to = google_dataform_repository.production
}

resource "google_dataform_repository" "production" {
  provider                                   = google-beta
  display_name                               = null
  kms_key_name                               = null
  labels                                     = {}
  name                                       = "crawl-data"
  npmrc_environment_variables_secret_version = null
  project                                    = local.project
  region                                     = local.region
  service_account                            = null
  git_remote_settings {
    authentication_token_secret_version = "projects/${local.project_number}/secrets/GitHub_max-ostapenko_dataform_PAT/versions/latest"
    default_branch                      = "main"
    url                                 = "https://github.com/HTTPArchive/dataform.git"
  }
  workspace_compilation_overrides {
    default_database = null
    schema_suffix    = "dev"
    table_prefix     = "dev"
  }
}

resource "google_dataform_repository_release_config" "production" {
  provider      = google-beta
  cron_schedule = null
  git_commitish = "main"
  name          = "production"
  project       = local.project
  region        = local.region
  repository    = "crawl-data"
  time_zone     = "Etc/UTC"
}


# BigQuery IAM roles for Dataform
locals {
  datasets = [
    "all",
    "core_web_vitals",
    "blink_features",
    "sample_data"
  ]
}

resource "google_bigquery_dataset_iam_member" "data_editor_role" {
  for_each = toset(local.datasets)

  dataset_id = each.value
  role       = "roles/bigquery.dataEditor"
  member     = "serviceAccount:${local.dataform_service_account_email}"
}

resource "google_project_iam_member" "bigquery_user" {
  project = local.project
  role    = "roles/bigquery.user"
  member  = "serviceAccount:${local.dataform_service_account_email}"
}
