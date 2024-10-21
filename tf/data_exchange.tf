locals {
  data_exchange_id = "http_archive_1927d6debea"
  listing_id       = "http_archive_crawls_1927d748827"
}

/*import {
  id = "projects/${local.project}/locations/${local.location}/dataExchanges/${local.data_exchange_id}"
  to = google_bigquery_analytics_hub_data_exchange.default
}

import {
  id = "projects/${local.project}/locations/${local.location}/dataExchanges/${local.data_exchange_id}/listings/${local.listing_id}"
  to = google_bigquery_analytics_hub_listing.default
}*/

resource "google_bigquery_analytics_hub_data_exchange" "default" {
  data_exchange_id = local.data_exchange_id
  description      = null
  display_name     = "HTTP Archive"
  location         = "us"
  primary_contact  = null
  project          = local.project
}

resource "google_bigquery_analytics_hub_listing" "default" {
  categories       = ["CATEGORY_SCIENCE_AND_RESEARCH"]
  data_exchange_id = local.data_exchange_id
  description      = "A comprehensive dataset tracking how the web is built. We regularly crawl top websites, capturing detailed resource metadata, web platform API usage, and execution traces. This dataset offers in-depth insights into web performance, trends, and technologies."
  display_name     = "Web Performance and Platform Trends"
  documentation    = file("attachments/documentation.md")
  icon             = filebase64("attachments/icon.png")
  listing_id       = local.listing_id
  location         = local.location
  project          = local.project
  primary_contact  = null
  request_access   = null
  bigquery_dataset {
    dataset = "projects/${local.project_number}/datasets/all"
  }
  data_provider {
    name            = "HTTP Archive"
    primary_contact = "https://httparchive.org/"
  }
  publisher {
    name            = "HTTP Archive"
    primary_contact = "https://httparchive.org/"
  }
}
