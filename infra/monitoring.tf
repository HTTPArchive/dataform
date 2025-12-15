resource "google_monitoring_alert_policy" "dataform_service_error" {
  combiner              = "OR"
  display_name          = "Dataform Service Error"
  enabled               = true
  notification_channels = ["projects/${var.project}/notificationChannels/5647028675917298338"]
  project               = var.project
  severity              = "CRITICAL"
  user_labels           = {}
  alert_strategy {
    notification_prompts = ["OPENED"]
    notification_rate_limit {
      period = "3600s"
    }
    auto_close = "604800s"
  }
  conditions {
    display_name = "Log match condition"
    condition_matched_log {
      filter           = <<EOF
resource.type="cloud_run_revision"
resource.labels.service_name="dataform-service"
severity=ERROR
EOF
      label_extractors = {}
    }
  }
  documentation {
    content = "Function source: https://github.com/HTTPArchive/dataform/tree/main/infra/dataform-service"
  }
}

resource "google_monitoring_alert_policy" "bigquery_export_error" {
  combiner              = "OR"
  display_name          = "BigQuery Export Error"
  enabled               = true
  notification_channels = ["projects/${var.project}/notificationChannels/5647028675917298338"]
  project               = var.project
  severity              = "CRITICAL"
  user_labels           = {}
  alert_strategy {
    notification_prompts = ["OPENED"]
    notification_rate_limit {
      period = "3600s"
    }
    auto_close = "604800s"
  }
  conditions {
    display_name = "Log match condition"
    condition_matched_log {
      filter           = <<EOF
resource.type="cloud_run_job"
resource.labels.job_name="bigquery-export"
severity=ERROR
EOF
      label_extractors = {}
    }
  }
  documentation {
    content = "Function source: https://github.com/HTTPArchive/dataform/tree/main/infra/bigquery-export"
  }
}

resource "google_monitoring_alert_policy" "dataform_workflow" {
  combiner              = "OR"
  display_name          = "Dataform Workflow Invocation Failed"
  enabled               = true
  notification_channels = ["projects/${var.project}/notificationChannels/5647028675917298338"]
  project               = var.project
  severity              = "CRITICAL"
  documentation {
    content = "Workflows source: https://github.com/HTTPArchive/dataform/tree/main/"
  }
  user_labels = {}
  alert_strategy {
    notification_prompts = ["OPENED"]
    notification_rate_limit {
      period = "3600s"
    }
    auto_close = "604800s"
  }
  conditions {
    display_name = "Log match condition"
    condition_matched_log {
      filter           = <<EOF
resource.type="dataform.googleapis.com/Repository"
jsonPayload.@type="type.googleapis.com/google.cloud.dataform.logging.v1.WorkflowInvocationCompletionLogEntry"
jsonPayload.terminalState="FAILED"
resource.labels.repository_id="crawl-data"
EOF
      label_extractors = {}
    }
  }
}
