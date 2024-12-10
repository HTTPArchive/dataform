

data "archive_file" "dataform-trigger" {
  type        = "zip"
  source_dir  = "../dataform-trigger/"
  output_path = "./tmp/dataform-trigger.zip"
}

resource "google_storage_bucket_object" "dataform_trigger_build" {
  bucket = "gcf-v2-uploads-${local.project_number}-${local.region}"
  name   = "dataform-trigger/function-source.zip"
  source = data.archive_file.dataform-trigger.output_path
}

resource "google_cloudfunctions2_function" "default" {
  name     = "dataform-trigger"
  location = local.region
  build_config {
    runtime     = "nodejs20"
    entry_point = "dataform-trigger"
    source {
      storage_source {
        bucket     = google_storage_bucket_object.dataform_trigger_build.bucket
        object     = google_storage_bucket_object.dataform_trigger_build.name
        generation = google_storage_bucket_object.dataform_trigger_build.generation
      }
    }
  }
  service_config {
    max_instance_count    = 1
    available_memory      = "256M"
    timeout_seconds       = 600
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
  ack_deadline_seconds         = 600
  enable_exactly_once_delivery = false
  enable_message_ordering      = false
  filter                       = null
  labels                       = {}
  message_retention_duration   = "3600s"
  name                         = "dataform-trigger-crawl-complete"
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
  crux_ready_scheduler_body = <<EOF
{
  "message": {
    "name": "crux_ready"
  }
}
EOF
}

/*import {
  provider = google-beta
  id       = "projects/${local.project}/locations/us-central1/jobs/bq-poller-crux-ready"
  to       = google_cloud_scheduler_job.bq-poller-crux-ready
}*/

resource "google_cloud_scheduler_job" "bq-poller-crux-ready" {
  provider         = google-beta
  attempt_deadline = "180s"
  description      = null
  name             = "bq-poller-crux-ready"
  paused           = false
  project          = local.project
  region           = local.region
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
