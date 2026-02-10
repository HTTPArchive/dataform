variable "project" {
  description = "GCP project ID"
  type        = string
  default     = "httparchive"
}

variable "project_number" {
  description = "GCP project number"
  type        = string
  default     = "226352634162"
}

variable "region" {
  description = "GCP region"
  type        = string
  default     = "us-central1"
}

variable "location" {
  description = "GCP location"
  type        = string
  default     = "us"
}

variable "function_identity" {
  default = "cloud-function@httparchive.iam.gserviceaccount.com"
  type    = string
}

variable "dataform_service_account_email" {
  default = "service-226352634162@gcp-sa-dataform.iam.gserviceaccount.com"
  type    = string
}

variable "edit_datasets" {
  default = [
    "crawl",
    "sample_data",
    "wappalyzer",

    // Reports
    "blink_features",
    "reports",

    // Flattened tables for F1
    "f1",

    // Service
    "dataform_assertions",
  ]
  type = list(string)
}

variable "dataform_service_account_roles" {
  type = list(string)
  default = [
    "roles/bigquery.user",
    "roles/bigquery.connectionUser",
    "roles/bigquery.dataViewer",
    "roles/bigquery.resourceAdmin",
  ]
}
