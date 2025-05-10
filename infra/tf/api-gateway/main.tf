######################################
# API Gateway
######################################
# Used to expose Internal resources to external sources, such as web applications
# See https://cloud.google.com/api-gateway/docs for more information
# The API used by the Gateway
resource "google_api_gateway_api" "api" {
  provider     = google-beta # API Gateway is still in beta
  api_id       = "api-gw-${var.environment}"
  display_name = "The ${var.environment} API Gateway"
  project      = var.project
}
# A Configuration, consisting of an OpenAPI specification
resource "google_api_gateway_api_config" "api_config" {
  provider             = google-beta # API Gateway is still in beta
  api                  = google_api_gateway_api.api.api_id
  api_config_id_prefix = "api"
  project              = var.project
  display_name         = "The ${var.environment} Config"
  openapi_documents {
    document {
      path     = "spec.yaml"             # File name is simply sugar to show on GCP
      contents = filebase64("spec.yaml") # This is based on *who* is call the module! 
    }
  }
  gateway_config {
    backend_config {
      google_service_account = var.service_account_email
    }
  }
}
# The actual API Gateway
resource "google_api_gateway_gateway" "gateway" {
  provider     = google-beta
  project      = var.project
  region       = var.region
  api_config   = google_api_gateway_api_config.api_config.id
  gateway_id   = "${var.environment}-gw"
  display_name = "${var.environment} Api Gateway"
  labels = {
    owner       = "tech_report_api"
    environment = var.environment
  }
  depends_on = [google_api_gateway_api_config.api_config]
  lifecycle {
    replace_triggered_by = [
      google_api_gateway_api_config.api_config
    ]
  }
}
