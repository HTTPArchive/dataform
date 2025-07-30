terraform {
  required_version = ">= 1.9.7"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = ">= 6.13.0"
    }
  }
}

resource "google_project_iam_member" "function_identity" {
  for_each = toset(["roles/bigquery.jobUser", "roles/dataform.serviceAgent", "roles/run.invoker", "roles/run.jobsExecutorWithOverrides", "roles/datastore.user", "roles/storage.objectUser"])

  project = var.project
  role    = each.value
  member  = "serviceAccount:${var.function_identity}"
}

resource "google_bigquery_dataset_iam_member" "cloud_function_dataset_reader_role" {
  for_each = toset(var.edit_datasets)

  dataset_id = each.value
  role       = "roles/bigquery.dataViewer"
  member     = "serviceAccount:${var.function_identity}"
}
