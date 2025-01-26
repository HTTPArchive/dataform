terraform {
  required_version = ">= 1.9.7"

  required_providers {
    archive = {
      source  = "hashicorp/archive"
      version = "2.6.0"
    }
    google = {
      source  = "hashicorp/google"
      version = ">= 6.13.0"
    }
    google-beta = {
      source  = "hashicorp/google-beta"
      version = ">= 6.13.0"
    }
  }
}

data "archive_file" "zip" {
  type        = "zip"
  source_dir  = "../${var.function_name}/"
  output_path = "./tmp/${var.function_name}.zip"
}

resource "google_storage_bucket_object" "source" {
  bucket = "gcf-v2-uploads-${var.project_number}-${var.region}"
  name   = "${var.function_name}_${data.archive_file.zip.id}.zip"
  source = data.archive_file.zip.output_path
}

resource "google_cloudfunctions2_function" "dataform_trigger" {
  name     = "dataform-trigger"
  location = var.region
  build_config {
    runtime     = "nodejs20"
    entry_point = "dataform-trigger"
    source {
      storage_source {
        bucket     = google_storage_bucket_object.source.bucket
        object     = google_storage_bucket_object.source.name
        generation = google_storage_bucket_object.source.generation
      }
    }
  }
  service_config {
    max_instance_count    = 1
    available_memory      = "256M"
    timeout_seconds       = 600
    service_account_email = var.function_identity
    ingress_settings      = "ALLOW_INTERNAL_ONLY"
  }
}

locals {
  function_uri = google_cloudfunctions2_function.dataform_trigger.service_config[0].uri
}

resource "google_cloud_run_service_iam_member" "member" {
  location = google_cloudfunctions2_function.dataform_trigger.location
  service  = google_cloudfunctions2_function.dataform_trigger.name
  role     = "roles/run.invoker"
  member   = "serviceAccount:${var.function_identity}"
}

resource "google_pubsub_subscription" "dataform_crawl_complete" {
  ack_deadline_seconds         = 600
  enable_exactly_once_delivery = false
  enable_message_ordering      = false
  filter                       = null
  labels                       = {}
  message_retention_duration   = "3600s"
  name                         = "dataform-trigger-crawl-complete"
  project                      = var.project
  retain_acked_messages        = false
  topic                        = "projects/${var.project}/topics/crawl-complete"
  expiration_policy {
    ttl = ""
  }
  push_config {
    attributes    = {}
    push_endpoint = local.function_uri
    oidc_token {
      audience              = local.function_uri
      service_account_email = var.function_identity
    }
  }
  retry_policy {
    maximum_backoff = "600s"
    minimum_backoff = "600s"
  }
}

# Cloud Scheduler Job to trigger CWV Tech Report Dataform workflow
locals {
  crux_ready_scheduler_body = <<EOF
{
  "message": {
    "name": "crux_ready"
  }
}
EOF
}

resource "google_cloud_scheduler_job" "bq-poller-crux-ready" {
  provider         = google-beta
  attempt_deadline = "180s"
  description      = null
  name             = "bq-poller-crux-ready"
  paused           = false
  project          = var.project
  region           = var.region
  schedule         = "0 */8 8-14 * *"
  time_zone        = "Etc/UTC"
  http_target {
    body = base64encode(local.crux_ready_scheduler_body)
    headers = {
      Content-Type = "application/json"
    }
    http_method = "POST"
    uri         = local.function_uri
    oidc_token {
      audience              = local.function_uri
      service_account_email = var.function_identity
    }
  }
  retry_config {
    max_backoff_duration = "3600s"
    max_doublings        = 5
    max_retry_duration   = "0s"
    min_backoff_duration = "5s"
    retry_count          = 0
  }
}
