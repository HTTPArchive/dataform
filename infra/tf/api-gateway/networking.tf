resource "google_compute_global_address" "default" {
  #count = var.environment == "prod" ? 1 : 0
  count = 0

  project      = var.project
  name         = "httparchive-api-gateway-address"
  address_type = "EXTERNAL"
  ip_version   = "IPV4"
}

resource "google_compute_global_forwarding_rule" "https" {
  #count = var.environment == "prod" ? 1 : 0
  count = 0

  provider              = google-beta
  project               = var.project
  name                  = "httparchive-api-gateway-https"
  target                = google_compute_target_https_proxy.default[count.index].self_link
  ip_address            = google_compute_global_address.default[count.index].id
  port_range            = "443"
  load_balancing_scheme = "EXTERNAL_MANAGED"
}

resource "google_compute_managed_ssl_certificate" "default" {
  #count = var.environment == "prod" ? 1 : 0
  count = 0

  name = "httparchive-api-gateway-ssl"
  managed {
    domains = ["api.httparchive.org"]
  }
  
}

resource "google_compute_target_https_proxy" "default" {
  #count = var.environment == "prod" ? 1 : 0
  count = 0

  provider         = google-beta
  project          = var.project
  name             = "httparchive-api-gateway-https-proxy"
  url_map          = google_compute_url_map.default[count.index].id
  ssl_certificates = [google_compute_managed_ssl_certificate.default[count.index].id]  
}

resource "google_compute_region_network_endpoint_group" "function_neg" {
  #count = var.environment == "prod" ? 1 : 0
  count = 0

  provider              = google-beta
  name                  = "httparchive-api-gateway-function-neg"
  network_endpoint_type = "SERVERLESS"
  project               = var.project
  region                = var.region

  serverless_deployment {
    platform = "apigateway.googleapis.com"
    resource = google_api_gateway_gateway.gateway.gateway_id
  }
  
}

resource "google_compute_backend_service" "backend_neg" {
  #count = var.environment == "prod" ? 1 : 0
  count = 0

  provider              = google-beta
  name                  = "httparchive-api-gateway-backend-neg"
  project               = var.project
  load_balancing_scheme = "EXTERNAL_MANAGED"
  protocol              = "HTTP"
  backend {
      group = google_compute_region_network_endpoint_group.function_neg[count.index].self_link
    }
  
}

resource "google_compute_url_map" "default" {
  #count = var.environment == "prod" ? 1 : 0
  count = 0
  
  provider        = google-beta
  project         = var.project
  name            = "httparchive-api-gateway-url-map"
  default_service = google_compute_backend_service.backend_neg[count.index].self_link
}