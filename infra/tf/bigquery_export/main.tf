terraform {
  required_version = ">= 1.9.7"

  required_providers {
    archive = {
      source  = "hashicorp/archive"
      version = ">= 2.6.0"
    }
    google = {
      source  = "hashicorp/google"
      version = ">= 6.13.0"
    }
  }
}

resource "google_cloud_run_v2_job" "bigquery_export" {
  name     = var.function_name
  location = var.region

  deletion_protection = false

  template {
    parallelism = 5
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
      max_retries     = 1
    }
  }
}

