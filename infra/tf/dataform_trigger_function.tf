locals {
  function_identity = "cloud-function@httparchive.iam.gserviceaccount.com"
}

data "archive_file" "default" {
  type        = "zip"
  source_dir  = "../dataform-trigger/"
  output_path = "/tmp/function-source.zip"
}

resource "google_storage_bucket_object" "object" {
  bucket = "gcf-v2-sources-${local.project_number}-${local.region}"
  name   = "${var.FUNCTION_NAME}/function-source.zip"
  source = data.archive_file.default.output_path
}

resource "google_cloudfunctions2_function" "default" {
  name     = var.FUNCTION_NAME
  location = local.region
  build_config {
    runtime     = "nodejs20"
    entry_point = var.FUNCTION_NAME
    source {
      storage_source {
        bucket = google_storage_bucket_object.object.bucket
        object = google_storage_bucket_object.object.name
      }
    }
  }
  service_config {
    max_instance_count    = 1
    available_memory      = "256M"
    timeout_seconds       = 60
    service_account_email = local.function_identity
    ingress_settings      = "ALLOW_INTERNAL_ONLY"
  }

}

locals {
  function_uri = google_cloudfunctions2_function.default.service_config[0].uri
}

resource "google_cloud_run_service_iam_member" "member" {
  location = google_cloudfunctions2_function.default.location
  service  = google_cloudfunctions2_function.default.name
  role     = "roles/run.invoker"
  member   = "serviceAccount:${local.function_identity}"
}

# Pub/Sub Subscription to trigger Crawl Data Dataform workflow
/*import {
  id = "projects/${local.project}/subscriptions/dataformTrigger"
  to = google_pubsub_subscription.dataformTrigger
}*/

resource "google_pubsub_subscription" "dataform_crawl_complete" {
  ack_deadline_seconds         = 60
  enable_exactly_once_delivery = false
  enable_message_ordering      = false
  filter                       = null
  labels                       = {}
  message_retention_duration   = "604800s"
  name                         = "${var.FUNCTION_NAME}-crawl-complete"
  project                      = local.project
  retain_acked_messages        = false
  topic                        = "projects/${local.project}/topics/crawl-complete"
  expiration_policy {
    ttl = ""
  }
  push_config {
    attributes    = {}
    push_endpoint = local.function_uri
    oidc_token {
      audience              = local.function_uri
      service_account_email = local.function_identity
    }
  }
  retry_policy {
    maximum_backoff = "60s"
    minimum_backoff = "10s"
  }
}

# Cloud Scheduler Job to trigger CWV Tech Report Dataform workflow
locals {
  cwv_tech_report_scheduler_body = <<EOF
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
    body = base64encode(local.cwv_tech_report_scheduler_body)
    headers = {
      Content-Type = "application/json"
    }
    http_method = "POST"
    uri         = local.function_uri
    oidc_token {
      audience              = local.function_uri
      service_account_email = local.function_identity
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
