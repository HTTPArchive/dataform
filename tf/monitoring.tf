/*import {
  id = "projects/httparchive/alertPolicies/3950167380893746326"
  to = google_monitoring_alert_policy.dataform_trigger
}*/

resource "google_monitoring_alert_policy" "dataform_trigger" {
  combiner              = "OR"
  display_name          = "Dataform Trigger Function Error"
  enabled               = true
  notification_channels = ["projects/${local.project}/notificationChannels/5647028675917298338"]
  project               = local.project
  severity              = "CRITICAL"
  user_labels           = {}
  alert_strategy {
    auto_close = "604800s"
    notification_rate_limit {
      period = "3600s"
    }
  }
  conditions {
    display_name = "Log match condition"
    condition_matched_log {
      filter           = <<EOF
resource.type="cloud_function"
resource.labels.function_name="dataformTrigger"
severity=ERROR
EOF
      label_extractors = {}
    }
  }
  documentation {
    content   = "Function source: https://github.com/HTTPArchive/dataform/tree/main/src"
    mime_type = "text/markdown"
    subject   = null
  }
}

/*import {
  id = "projects/httparchive/alertPolicies/7137542315653007241"
  to = google_monitoring_alert_policy.dataform_workflow
}*/

resource "google_monitoring_alert_policy" "dataform_workflow" {
  combiner              = "OR"
  display_name          = "Dataform Workflow Invocation Failed"
  enabled               = true
  notification_channels = ["projects/${local.project}/notificationChannels/5647028675917298338"]
  project               = local.project
  severity              = "CRITICAL"
  user_labels           = {}
  alert_strategy {
    auto_close = "604800s"
    notification_rate_limit {
      period = "3600s"
    }
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
