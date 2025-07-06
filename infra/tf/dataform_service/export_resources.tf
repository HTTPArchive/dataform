resource "google_bigquery_connection" "cloud-resources" {
  connection_id = "cloud-resources"
  location      = var.location
  cloud_resource {}
}

resource "google_project_iam_member" "bigquery-connection-cloud-resources" {
  for_each = toset(["roles/run.invoker"])

  project = var.project
  role    = each.value
  member  = "serviceAccount:${google_bigquery_connection.cloud-resources.cloud_resource[0].service_account_id}"
}

resource "google_bigquery_routine" "run_export_job" {
  dataset_id      = "reports"
  routine_id      = "run_export_job"
  routine_type    = "SCALAR_FUNCTION"
  definition_body = ""
  description     = <<EOT
Export data from Google BigQuery.
Example payload JSON:
  {
    "destination": "firestore",
    "config": {
      "database": "tech-report-api-dev",
      "collection": "adoption",
      "type": "report",
      "date": "2025-01-01"
    },
    "query": "SELECT STRING(date) AS date, * EXCEPT(date) FROM reports.tech_report_adoption WHERE date = '2025-01-01'"
  }
EOT

  arguments {
    name      = "payload"
    data_type = "{\"typeKind\" :  \"JSON\"}"
  }
  return_type = "{\"typeKind\" :  \"INT64\"}"

  remote_function_options {
    endpoint          = "${google_cloud_run_v2_service.dataform_service.uri}"
    connection        = google_bigquery_connection.cloud-resources.id
    max_batching_rows = "1"
  }
}
