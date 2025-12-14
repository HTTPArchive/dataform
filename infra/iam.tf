# Cloud Run service account
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

# Dataform service account
resource "google_bigquery_dataset_iam_member" "dataform_dataset_editor_role" {
  for_each = toset(var.edit_datasets)

  dataset_id = each.value
  role       = "roles/bigquery.dataEditor"
  member     = "serviceAccount:${var.dataform_service_account_email}"
}

resource "google_project_iam_member" "dataform_default_roles" {
  for_each = toset(var.dataform_service_account_roles)

  project = var.project
  role    = each.value
  member  = "serviceAccount:${var.dataform_service_account_email}"
}

resource "google_secret_manager_secret_iam_member" "dataform_secret_access" {
  secret_id = "projects/${var.project_number}/secrets/GitHub_max-ostapenko_dataform_PAT"
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${var.dataform_service_account_email}"
}
