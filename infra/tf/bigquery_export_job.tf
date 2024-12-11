resource "google_cloud_run_v2_job" "bigquery_export" {
  name     = "bigquery-export"
  location = local.region

  template {
    template {
      containers {
        image = "gcr.io/${local.project}/bigquery-export:latest"
        resources {
          limits = {
            cpu    = "4"
            memory = "4Gi"
          }
        }
        env {
          name  = "EXPORT_CONFIG"
          value = ""
        }
      }
      timeout         = "3600s"
      service_account = local.function_identity
    }
  }
}

