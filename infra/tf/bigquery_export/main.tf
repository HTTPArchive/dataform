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
    parallelism = 1
    task_count  = 1  # Ensure single task execution

    template {
      timeout         = "10800s"  # 3 hours
      service_account = var.function_identity
      max_retries     = 0   # No retries

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
        env {
          name  = "NODE_OPTIONS"
          value = "--expose-gc --max-old-space-size=6144"  # 6GB heap limit with GC
        }

        env {
          name  = "MEMORY_WARNING_THRESHOLD_MB"
          value = "4915"  # 80% of max heap size = 6144MB
        }

        env {
          name  = "LOG_LEVEL"
          value = "info"
        }
      }
    }
  }
}
