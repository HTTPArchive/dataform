/*import {
  id = "projects/${local.project}/locations/${local.location}/dataExchanges/${local.data_exchange_id}"
  to = google_bigquery_analytics_hub_data_exchange.default
}

import {
  id = "projects/${local.project}/locations/${local.location}/dataExchanges/${local.data_exchange_id}/listings/${local.listing_id}"
  to = google_bigquery_analytics_hub_listing.default
}*/

resource "google_bigquery_analytics_hub_data_exchange" "default" {
  data_exchange_id = "httparchive"
  location         = local.location
  display_name     = "HTTP Archive"
  description      = "The HTTP Archive is an open source project that tracks how the web is built. Historical data is provided to show how the web is constantly evolving, and the project is frequently used for research by the web community, scholars and industry leaders."
  primary_contact  = "https://httparchive.org/"
  sharing_environment_config  {
    default_exchange_config  {
    }
  }
}

resource "google_bigquery_analytics_hub_data_exchange_iam_member" "member" {
  project = local.project
  location = local.location
  data_exchange_id = google_bigquery_analytics_hub_data_exchange.default.data_exchange_id
  role = "roles/analyticshub.viewer"
  member = "allUsers"
}

resource "google_bigquery_analytics_hub_listing" "crawl" {
  data_exchange_id = google_bigquery_analytics_hub_data_exchange.default.data_exchange_id
  listing_id       = "crawl"
  location         = local.location
  project          = local.project
  display_name     = "Web Crawls"
  categories       = ["CATEGORY_SCIENCE_AND_RESEARCH"]
  bigquery_dataset {
    dataset = "projects/${local.project_number}/datasets/crawl"
  }
  request_access   = "https://har.fyi/guides/getting-started/#setting-up-bigquery-to-access-the-http-archive"
  description      = "A comprehensive dataset tracking how the web is built. We regularly crawl top websites, capturing detailed resource metadata, web platform API usage, and execution traces. This dataset offers in-depth insights into web performance, trends, and technologies."
  documentation    = file("attachments/documentation.md")
  icon             = filebase64("attachments/icon.png")
  data_provider {
    name            = "HTTP Archive"
    primary_contact = "https://httparchive.org/"
  }
}

resource "google_bigquery_analytics_hub_listing_iam_member" "member" {
  project = local.project
  location = local.location
  data_exchange_id = google_bigquery_analytics_hub_data_exchange.default.data_exchange_id
  listing_id = google_bigquery_analytics_hub_listing.crawl.listing_id
  role = "roles/analyticshub.viewer"
  member = "allUsers"
}
