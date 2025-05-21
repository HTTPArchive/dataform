# BigQuery IAM roles for Dataform
locals {
  dataform_service_account_email = "service-226352634162@gcp-sa-dataform.iam.gserviceaccount.com"

  edit_datasets = [
    "crawl",
    "sample_data",
    "wappalyzer",

    // Blink features
    "blink_features",

    // Reports
    "core_web_vitals", // TODO: Remove after tech report migration
    "reports",

    // Flattened tables for F1
    "f1",

    // Service
    "dataform_assertions",
  ]

  dataform_service_account_roles = [
    "roles/bigquery.user",
    "roles/bigquery.connectionUser",
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
