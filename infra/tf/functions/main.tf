resource "google_project_iam_member" "project" {
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

resource "google_bigquery_connection" "remote-functions" {
  connection_id = "remote-functions"
  location      = var.location
  cloud_resource {}
}

resource "google_project_iam_member" "bigquery-remote-functions-connector" {
  project = var.project
  role    = "roles/run.invoker"
  member  = "serviceAccount:${google_bigquery_connection.remote-functions.cloud_resource[0].service_account_id}"
}

data "google_project" "project" {
  project_id = var.project
}
