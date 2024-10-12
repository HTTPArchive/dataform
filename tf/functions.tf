import {
  provider = google-beta
  id = "projects/${local.project}/locations/us-east4/jobs/bq-poller-cwv-tech-report"
  to = google_cloud_scheduler_job.bq-poller-cwv-tech-report
}


locals {
  scheduler_body = <<EOF
{
  "message": {
    "name": "cwv_tech_report"
  }
}
EOF
}

resource "google_cloud_scheduler_job" "bq-poller-cwv-tech-report" {
  provider         = google-beta
  attempt_deadline = "180s"
  description      = null
  name             = "bq-poller-cwv-tech-report"
  paused           = false
  project          = local.project
  region           = "us-east4"
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
      service_account_email = "scheduler@httparchive.iam.gserviceaccount.com"
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

data "archive_file" "dataformTriggerSrc" {
  type        = "zip"
  source_dir  = "../src/"
  output_path = "temp/dataformTrigger/function-source.zip"
}

resource "google_storage_bucket_object" "object" {
  name   = "function-source.zip"
  bucket = "gcf-v2-sources-226352634162-us-central1"
  source = data.archive_file.dataformTriggerSrc.output_path
}

import {
  provider = google-beta
  id = "projects/${local.project}/locations/${local.region}/functions/dataformTrigger"
  to = google_cloudfunctions2_function.dataformTrigger
}

resource "google_cloudfunctions2_function" "dataformTrigger" {
  provider     = google-beta
  description  = null
  kms_key_name = null
  labels       = {}
  location     = local.region
  name         = "dataformTrigger"
  project      = local.project
  build_config {
    docker_repository     = "projects/httparchive/locations/us-central1/repositories/gcf-artifacts"
    entry_point           = "dataformTrigger"
    environment_variables = {}
    runtime               = "nodejs20"
    service_account       = null
    worker_pool           = null
    automatic_update_policy {
    }
    source {
      storage_source {
        bucket     = "gcf-v2-sources-226352634162-us-central1"
        generation = 1725969315499844
        object     = "dataformTrigger/function-source.zip"
      }
    }
  }
  service_config {
    all_traffic_on_latest_revision = true
    available_cpu                  = "167m"
    available_memory               = "256Mi"
    environment_variables = {
      LOG_EXECUTION_ID = "true"
    }
    ingress_settings                 = "ALLOW_ALL"
    max_instance_count               = 1
    max_instance_request_concurrency = 1
    min_instance_count               = 0
    service                          = "projects/${local.project}/locations/${local.region}/services/dataformtrigger"
    service_account_email            = "cloud-function@httparchive.iam.gserviceaccount.com"
    timeout_seconds                  = 60
    vpc_connector                    = null
    vpc_connector_egress_settings    = null
  }
}

resource "google_cloud_run_service_iam_member" "member" {
  location = google_cloudfunctions2_function.dataformTrigger.location
  service  = google_cloudfunctions2_function.dataformTrigger.name
  role     = "roles/run.invoker"
  member   = "serviceAccount:scheduler@httparchive.iam.gserviceaccount.com"
}
