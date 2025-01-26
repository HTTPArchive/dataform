resource "google_cloud_run_v2_job" "bigquery_export" {
  name     = var.function_name
  location = var.region

  deletion_protection = false

  template {
    template {
      containers {
        image = "${var.location}.gcr.io/${var.project}/cloud-run/${var.function_name}:latest"
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
      service_account = var.function_identity
    }
  }
}

