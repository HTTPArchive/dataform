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
  member     = "serviceAccount:${local.service_account_email}"
}

resource "google_project_iam_member" "bigquery_user" {
  project = local.project
  role    = "roles/bigquery.user"
  member  = "serviceAccount:${local.service_account_email}"
}
