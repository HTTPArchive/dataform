resource "google_cloud_run_v2_service_iam_member" "member" {
  name   = "projects/httparchive/locations/us-central1/services/dataformtrigger"
  role   = "roles/run.invoker"
  member = "serviceAccount:cloud-function@httparchive.iam.gserviceaccount.com"
}

# Pub/Sub Subscription to trigger Crawl Data Dataform workflow
/*import {
  id = "projects/${local.project}/subscriptions/dataformTrigger"
  to = google_pubsub_subscription.dataformTrigger
}*/

resource "google_pubsub_subscription" "dataformTrigger" {
  ack_deadline_seconds         = 60
  enable_exactly_once_delivery = false
  enable_message_ordering      = false
  filter                       = null
  labels                       = {}
  message_retention_duration   = "604800s"
  name                         = "dataformTrigger"
  project                      = local.project
  retain_acked_messages        = false
  topic                        = "projects/${local.project}/topics/crawl-complete"
  expiration_policy {
    ttl = ""
  }
  push_config {
    attributes    = {}
    push_endpoint = "https://${local.region}-${local.project}.cloudfunctions.net/dataformTrigger"
    oidc_token {
      audience              = "https://${local.region}-${local.project}.cloudfunctions.net/dataformTrigger"
      service_account_email = "cloud-function@httparchive.iam.gserviceaccount.com"
    }
  }
  retry_policy {
    maximum_backoff = "60s"
    minimum_backoff = "10s"
  }
}

# Cloud Scheduler Job to trigger CWV Tech Report Dataform workflow
locals {
  scheduler_body = <<EOF
{
  "message": {
    "name": "cwv_tech_report"
  }
}
EOF
}

/*import {
  provider = google-beta
  id       = "projects/${local.project}/locations/us-east4/jobs/bq-poller-cwv-tech-report"
  to       = google_cloud_scheduler_job.bq-poller-cwv-tech-report
}*/

resource "google_cloud_scheduler_job" "bq-poller-cwv-tech-report" {
  provider         = google-beta
  attempt_deadline = "180s"
  description      = null
  name             = "bq-poller-cwv-tech-report"
  paused           = false
  project          = local.project
  region           = local.region
  schedule         = "0 */7 8-14 * *"
  time_zone        = "Etc/UTC"
  http_target {
    body = base64encode(local.scheduler_body)
    headers = {
      Content-Type = "application/json"
    }
    http_method = "POST"
    uri         = "https://${local.region}-${local.project}.cloudfunctions.net/dataformTrigger"
    oidc_token {
      audience              = "https://${local.region}-${local.project}.cloudfunctions.net/dataformTrigger"
      service_account_email = "cloud-function@httparchive.iam.gserviceaccount.com"
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
