terraform {
  required_version = ">= 1.9.7"

  required_providers {
    archive = {
      source  = "hashicorp/archive"
      version = ">= 2.6.0"
    }
    google = {
      source  = "hashicorp/google"
      version = ">= 6.13.0"
    }
  }
}

data "archive_file" "zip" {
  type        = "zip"
  source_dir  = "../${var.function_name}/"
  output_path = "./tmp/${var.function_name}.zip"
}

resource "google_storage_bucket_object" "source" {
  bucket = "gcf-v2-uploads-${var.project_number}-${var.region}"
  name   = "${var.function_name}_${data.archive_file.zip.id}.zip"
  source = data.archive_file.zip.output_path
}

resource "google_cloudfunctions2_function" "dataform_export" {
  name     = var.function_name
  location = var.region
  build_config {
    runtime     = "nodejs20"
    entry_point = var.function_name
    source {
      storage_source {
        bucket     = google_storage_bucket_object.source.bucket
        object     = google_storage_bucket_object.source.name
        generation = google_storage_bucket_object.source.generation
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

resource "google_bigquery_routine" "run_export_job" {
  dataset_id = "reports"
  routine_id = "run_export_job"
  routine_type = "SCALAR_FUNCTION"
  definition_body = ""
  description = "Export data from Google BigQuery.\nExample payload JSON: {\"dataform_trigger\": \"tech_report_complete\", \"date\": \"${pastMonth}\", \"name\": \"adoption\", \"type\": \"report\"}"

  arguments {
    name      = "payload"
    data_type = "{\"typeKind\" :  \"JSON\"}"
  }
  return_type = "{\"typeKind\" :  \"INT64\"}"

  remote_function_options {
    endpoint          = google_cloudfunctions2_function.dataform_export.https_trigger_url
    connection        = "${var.region}.remote-functions"
    max_batching_rows = "1"
  }
}
