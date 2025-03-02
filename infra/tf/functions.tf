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

resource "google_bigquery_connection" "spark-procedures" {
  connection_id = "spark-procedures"
  location      = local.location
  spark {}
}

resource "google_bigquery_connection" "remote-functions" {
  connection_id = "remote-functions"
  location      = local.location
  cloud_resource {}
}

resource "google_project_iam_member" "bigquery-remote-functions-connector" {
  project = local.project
  role    = "roles/run.invoker"
  member  = "serviceAccount:${google_bigquery_connection.remote-functions.cloud_resource[0].service_account_id}"
}
