# Documentation:
# https://docs.mastheadata.com/saas-manual-resource-creation-google-cloud-+-bigquery

# 1. Create Pub/Sub resources
resource "google_pubsub_topic" "masthead_topic" {
  project = local.project
  name    = "masthead-topic"
}

resource "google_pubsub_subscription" "masthead_agent_subscription" {
  project              = local.project
  ack_deadline_seconds = 60
  expiration_policy {
    ttl = "2678400s"
  }
  message_retention_duration = "604800s"
  name                       = "masthead-agent-subscription"
  topic                      = "projects/${local.project}/topics/masthead-topic"
}

# 2. Create Logs Router
resource "google_logging_project_sink" "masthead_agent_sink" {
  destination = "pubsub.googleapis.com/projects/${local.project}/topics/masthead-topic"
  filter      = <<EOT
  protoPayload.methodName="google.cloud.bigquery.v2.JobService.InsertJob" OR "google.cloud.bigquery.v2.TableService.InsertTable" OR "google.cloud.bigquery.v2.JobService.Query" OR
    resource.type="bigquery_dataset" OR "bigquery_project" OR
    (resource.type="bigquery_table" AND protoPayload.methodName!="google.cloud.bigquery.storage.v1.BigQueryWrite.AppendRows") OR
    (resource.type="bigquery_table" AND protoPayload.methodName="google.cloud.bigquery.storage.v1.BigQueryWrite.AppendRows" AND sample(insertId, 0.0001))
  EOT
  name        = "masthead-agent-sink"
}


resource "google_project_iam_member" "masthead_pubsub_publisherer_member" {
  role    = "roles/pubsub.publisher"
  member  = "serviceAccount:cloud-logs@system.gserviceaccount.com"
  project = local.project
}

# 3. Grant Masthead Service Account roles
resource "google_project_iam_custom_role" "masthead_bq_meta_reader" {
  project     = local.project
  description = "Masthead BigQuery assets metadata reader"
  permissions = ["bigquery.datasets.get", "bigquery.tables.get", "bigquery.tables.list"]
  role_id     = "masthead_bq_meta_reader"
  stage       = "GA"
  title       = "masthead_bq_meta_reader"
}

resource "google_project_iam_binding" "masthead_bq_meta_reader_binding" {
  role    = google_project_iam_custom_role.masthead_bq_meta_reader.id
  members = ["serviceAccount:masthead-data@masthead-prod.iam.gserviceaccount.com"]
  project = local.project
}

resource "google_project_iam_member" "masthead_pubsub_subscriber_member" {
  role    = "roles/pubsub.subscriber"
  member  = "serviceAccount:masthead-data@masthead-prod.iam.gserviceaccount.com"
  project = local.project
}

# 4. Grant Masthead Service Account to quickly onboard from retrospective data
resource "google_project_iam_binding" "private_logs_viewer_binding" {
  role    = "roles/logging.privateLogViewer"
  members = ["serviceAccount:retro-data@masthead-prod.iam.gserviceaccount.com"]
  project = local.project
}
