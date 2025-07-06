data "google_pubsub_topic" "dataform_crawl_complete" {
  name = "crawl-complete"
}

resource "google_pubsub_subscription" "dataform_crawl_complete" {
  ack_deadline_seconds         = 600
  enable_exactly_once_delivery = false
  enable_message_ordering      = false
  filter                       = null
  labels                       = {}
  message_retention_duration   = "3600s"
  name                         = "dataform-service-crawl-complete"
  retain_acked_messages        = false
  topic                        = data.google_pubsub_topic.dataform_crawl_complete.id
  expiration_policy {
    ttl = ""
  }
  push_config {
    attributes    = {}
    push_endpoint = "${google_cloud_run_v2_service.dataform_service.uri}/trigger"
    oidc_token {
      audience              = google_cloud_run_v2_service.dataform_service.uri
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
  attempt_deadline = "180s"
  region  = var.region
  description      = null
  name             = "bq-poller-crux-ready"
  paused           = false
  schedule         = "0 8,12,16 8-14 * *"
  time_zone        = "Etc/UTC"
  http_target {
    body = base64encode(local.crux_ready_scheduler_body)
    headers = {
      Content-Type = "application/json"
    }
    http_method = "POST"
    uri         = "${google_cloud_run_v2_service.dataform_service.uri}/trigger"
    oidc_token {
      audience              = google_cloud_run_v2_service.dataform_service.uri
      service_account_email = var.function_identity
    }
  }
}
