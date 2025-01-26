

data "archive_file" "dataform-export" {
  type        = "zip"
  source_dir  = "../${var.function_name}/"
  output_path = "./tmp/${var.function_name}.zip"
}

resource "google_storage_bucket_object" "dataform_export_build" {
  bucket = "gcf-v2-uploads-${var.project_number}-${var.region}"
  name   = "${var.function_name}_${data.archive_file.dataform-export.id}.zip"
  source = data.archive_file.dataform-export.output_path
}

resource "google_cloudfunctions2_function" "dataform_export" {
  name     = var.function_name
  location = var.region
  build_config {
    runtime     = "nodejs20"
    entry_point = var.function_name
    source {
      storage_source {
        bucket     = google_storage_bucket_object.dataform_export_build.bucket
        object     = google_storage_bucket_object.dataform_export_build.name
        generation = google_storage_bucket_object.dataform_export_build.generation
      }
    }
  }
  service_config {
    max_instance_count    = 2
    available_cpu         = 1
    available_memory      = "256M"
    service_account_email = var.function_identity
    ingress_settings      = "ALLOW_INTERNAL_ONLY"
  }
}

# Pub/Sub Topic to trigger Crawl Data Dataform workflow
resource "google_pubsub_topic" "bigquery_data_updated" {
  #checkov:skip=CKV_GCP_83:Ensure PubSub Topics are encrypted with Customer Supplied Encryption Keys (CSEK)
  name    = "bigquery-data-updated"
  project = var.project
}

# Logs sink for Dataform triggers
resource "google_logging_project_sink" "dataform_export_triggers" {
  name        = "dataform-export-triggers"
  destination = "pubsub.googleapis.com/projects/${var.project}/topics/bigquery-data-updated"
  filter      = <<EOT
-- dataform
protoPayload.authenticationInfo.principalEmail="service-226352634162@gcp-sa-dataform.iam.gserviceaccount.com"
protoPayload.serviceData.jobCompletedEvent.job.jobConfiguration.labels.dataform_repository_id=~"crawl-data"
protoPayload.resourceName=~"projects/httparchive/jobs/dataform-gcp-"

--successful query
protoPayload.serviceData.jobCompletedEvent.job.jobStatus.state="DONE"
-protoPayload.serviceData.jobCompletedEvent.job.jobStatus.error.message:*

--check for trigger config
protoPayload.serviceData.jobCompletedEvent.job.jobConfiguration.query.query=~"/* {\"dataform_trigger\": "
EOT
  project     = var.project
}

# Topic Subscription for dataform_export function
resource "google_pubsub_subscription" "dataform_export" {
  ack_deadline_seconds         = 60
  enable_exactly_once_delivery = false
  enable_message_ordering      = false
  filter                       = null
  labels                       = {}
  message_retention_duration   = "3600s"
  name                         = google_cloudfunctions2_function.dataform_export.name
  project                      = var.project
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
      service_account_email = var.function_identity
    }
  }
  retry_policy {
    maximum_backoff = "60s"
    minimum_backoff = "10s"
  }
}
