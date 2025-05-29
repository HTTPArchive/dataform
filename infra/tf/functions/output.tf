output "google_bigquery_connection-remote_functions-id" {
  description = "The connection ID for the remote functions BigQuery connection."
  value       = google_bigquery_connection.remote-functions.id
}

output "remote_functions_connection_service_account_id" {
  description = "The service account ID associated with the remote functions BigQuery connection."
  value       = google_bigquery_connection.remote-functions.cloud_resource[0].service_account_id
}
