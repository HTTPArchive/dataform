/*import {
  provider = google-beta
  id       = "projects/${local.project}/locations/${local.region}/repositories/crawl-data"
  to       = google_dataform_repository.production
}*/

# BigQuery IAM roles for Dataform
locals {
  dataform_service_account_email = "service-226352634162@gcp-sa-dataform.iam.gserviceaccount.com"

  edit_datasets = [
    "blink_features",
    "core_web_vitals",
    "crawl",
    "sample_data",
    "wappalyzer",
    // Legacy
    "all",
    "lighthouse",
    "pages",
    "requests",
    "response_bodies",
    "summary_pages",
    "summary_requests",
    "technologies",
  ]

  dataform_service_account_roles = [
    "roles/bigquery.jobUser",
    "roles/dataform.serviceAgent",
  ]
}

resource "google_bigquery_dataset_iam_member" "dataform_dataset_editor_role" {
  for_each = toset(local.edit_datasets)

  dataset_id = each.value
  role       = "roles/bigquery.dataEditor"
  member     = "serviceAccount:${local.dataform_service_account_email}"
}

resource "google_project_iam_member" "dataform_default_roles" {
  for_each = toset(local.dataform_service_account_roles)

  project = local.project
  role    = each.value
  member  = "serviceAccount:${local.dataform_service_account_email}"
}

resource "google_secret_manager_secret_iam_member" "dataform_secret_access" {
  secret_id = "projects/${local.project_number}/secrets/GitHub_max-ostapenko_dataform_PAT"
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${local.dataform_service_account_email}"
}

resource "google_dataform_repository" "crawl_data" {
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
    authentication_token_secret_version = "${google_secret_manager_secret_iam_member.dataform_secret_access.secret_id}/versions/latest"
    default_branch                      = "main"
    url                                 = "https://github.com/HTTPArchive/dataform.git"
  }
  workspace_compilation_overrides {
    default_database = local.project
    schema_suffix    = "dev"
    table_prefix     = "dev"
  }
}

resource "google_dataform_repository_release_config" "crawl_data_production" {
  provider      = google-beta
  name          = "production"
  project       = local.project
  region        = local.region
  repository    = google_dataform_repository.crawl_data.name
  git_commitish = "main"
  time_zone     = "Etc/UTC"
  cron_schedule = null
}
