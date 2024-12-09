data "archive_file" "dataform-export" {
  type        = "zip"
  source_dir  = "../dataform-export/"
  output_path = "./tmp/dataform-export.zip"
}

resource "google_storage_bucket_object" "dataform_export_build" {
  bucket = "gcf-v2-uploads-${local.project_number}-${local.region}"
  name   = "dataform-export/function-source.zip"
  source = data.archive_file.dataform-export.output_path
}

resource "google_cloudfunctions2_function" "dataform_export" {
  name     = "dataform-export"
  location = local.region
  build_config {
    runtime     = "nodejs20"
    entry_point = "dataform-export"
    source {
      storage_source {
        bucket     = google_storage_bucket_object.dataform_export_build.bucket
        object     = google_storage_bucket_object.dataform_export_build.name
        generation = google_storage_bucket_object.dataform_export_build.generation
      }
    }
  }
  service_config {
    max_instance_count    = 20
    available_cpu         = 2
    available_memory      = "2G"
    timeout_seconds       = 600
    service_account_email = local.function_identity
    ingress_settings      = "ALLOW_INTERNAL_ONLY"
  }
}

# Pub/Sub Topic to trigger Crawl Data Dataform workflow
resource "google_pubsub_topic" "bigquery_data_updated" {
  #checkov:skip=CKV_GCP_83:Ensure PubSub Topics are encrypted with Customer Supplied Encryption Keys (CSEK)
  name    = "bigquery-data-updated"
  project = local.project
}

# Logs sink for Dataform triggers
resource "google_logging_project_sink" "dataform_export_triggers" {
  name        = "dataform-export-triggers"
  destination = "pubsub.googleapis.com/projects/${local.project}/topics/bigquery-data-updated"
  filter      = <<EOT
-- PROD dataform
protoPayload.authenticationInfo.principalEmail="service-226352634162@gcp-sa-dataform.iam.gserviceaccount.com"
protoPayload.serviceData.jobCompletedEvent.job.jobConfiguration.labels.dataform_repository_id="crawl-data"

--successful query
protoPayload.resourceName=~"projects/httparchive/jobs/dataform-gcp-"
protoPayload.serviceData.jobCompletedEvent.job.jobStatus.state="DONE"
-protoPayload.serviceData.jobCompletedEvent.job.jobStatus.error.message:*

--check for trigger config
protoPayload.serviceData.jobCompletedEvent.job.jobConfiguration.query.query=~"/* {\"dataform_trigger\": "
EOT
  project     = local.project
}

# Topic Subscription for dataform_export function
resource "google_pubsub_subscription" "dataform_export" {
  ack_deadline_seconds         = 600
  enable_exactly_once_delivery = false
  enable_message_ordering      = false
  filter                       = null
  labels                       = {}
  message_retention_duration   = "604800s"
  name                         = google_cloudfunctions2_function.dataform_export.name
  project                      = local.project
  retain_acked_messages        = false
  topic                        = google_pubsub_topic.bigquery_data_updated.name
  expiration_policy {
    ttl = ""
  }
  push_config {
    attributes    = {}
    push_endpoint = google_cloudfunctions2_function.dataform_export.service_config[0].uri
    oidc_token {
      audience              = google_cloudfunctions2_function.dataform_export.service_config[0].uri
      service_account_email = local.function_identity
    }
  }
  retry_policy {
    maximum_backoff = "60s"
    minimum_backoff = "10s"
  }
}
