terraform {
  required_version = ">= 1.9.7"

  required_providers {
    docker = {
      source  = "kreuzwerker/docker"
      version = ">= 3.6.2"
    }
    google = {
      source  = "hashicorp/google"
      version = ">= 6.13.0"
    }
    external = {
      source  = "hashicorp/external"
      version = ">= 2.3.5"
    }
  }
}

provider "google" {
  project = var.project
}

resource "google_cloud_run_v2_service" "dataform_service" {
  name                = var.function_name
  location            = var.region
  deletion_protection = false

  template {
    containers {
      image = docker_registry_image.registry_image.name

      resources {
        limits = {
          cpu    = "1"
          memory = "512Mi"
        }
        cpu_idle = true
      }
    }

    service_account                  = var.function_identity
    timeout                          = "60s"
    max_instance_request_concurrency = 80
  }

  traffic {
    type    = "TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST"
    percent = 100
  }
}

resource "google_cloud_run_service_iam_member" "member" {
  location = google_cloud_run_v2_service.dataform_service.location
  service  = google_cloud_run_v2_service.dataform_service.name
  role     = "roles/run.invoker"
  member   = "serviceAccount:${var.function_identity}"
}
