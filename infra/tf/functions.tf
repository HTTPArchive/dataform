locals {
  function_identity = "cloud-function@httparchive.iam.gserviceaccount.com"
}

resource "google_project_iam_member" "project" {
  for_each = toset(["roles/bigquery.jobUser", "roles/dataform.serviceAgent", "roles/run.invoker", "roles/run.jobsExecutorWithOverrides"])

  project = local.project
  role    = each.value
  member  = "serviceAccount:${local.function_identity}"
}

resource "google_bigquery_dataset_iam_member" "cloud_function_dataset_reader_role" {
  for_each = toset(local.edit_datasets)

  dataset_id = each.value
  role       = "roles/bigquery.dataViewer"
  member     = "serviceAccount:${local.function_identity}"
}

resource "google_bigquery_connection" "connection" {
   connection_id = "my-connection"
   location      = "US"
   friendly_name = "👋"
   description   = "a riveting description"
   cloud_resource {}
}

resource "google_bigquery_connection" "procedures" {
   connection_id = "procedures"
   location      = "US"
   spark {
   }
}

resource "google_project_iam_member" "bigquery-remote-functions-identity" {
  project = local.project
  role    = "roles/run.invoker"
  member  = "serviceAccount:bqcx-226352634162-1s4t@gcp-sa-bigquery-condel.iam.gserviceaccount.com"
}
