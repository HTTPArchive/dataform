resource "google_alloydb_cluster" "default" {
  provider   = google-beta
  cluster_id = "default"
  location   = var.region
  project    = var.project

  cluster_type     = "PRIMARY"
  database_version = "POSTGRES_17"

  psc_config {
    psc_enabled = true
  }

  dataplex_config {
    enabled = true
  }

  lifecycle {
    prevent_destroy = true
    ignore_changes = [
      subscription_type,
      automated_backup_policy,
      continuous_backup_config,
      encryption_config
    ]
  }
}

resource "google_alloydb_instance" "primary" {
  provider      = google-beta
  cluster       = google_alloydb_cluster.default.name
  instance_id   = "primary"
  instance_type = "PRIMARY"

  machine_config {
    cpu_count    = 8
    machine_type = "n2-highmem-8"
  }

  database_flags = {
    "alloydb.iam_authentication"                           = "on"
    "bigquery_fdw.enabled"                                 = "on"
    "google_columnar_engine.auto_columnarization_schedule" = "EVERY 7 DAYS"
    "google_columnar_engine.enable_auto_columnarization"   = "on"
    "google_columnar_engine.enable_columnar_scan"          = "on"
    "google_columnar_engine.enabled"                       = "on"
    "google_columnar_engine.memory_size_in_mb"             = "4800"
    "google_columnar_engine.refresh_threshold_percentage"  = "50"
    "google_columnar_engine.refresh_threshold_scan_count"  = "5"
    "google_job_scheduler.maintenance_cpu_percentage"      = "20"
    "google_job_scheduler.max_parallel_workers_per_job"    = "2"
    "password.enforce_complexity"                          = "on"
  }

  client_connection_config {
    require_connectors = false
    ssl_config {
      ssl_mode = "ENCRYPTED_ONLY"
    }
  }

  network_config {
    enable_public_ip = true
  }

  lifecycle {
    prevent_destroy = true
  }
}

# AlloyDB creates a unique service account per cluster dynamically:
# c-[PROJECT_NUMBER]-[FIRST_8_CHARS_OF_CLUSTER_UID]@gcp-sa-alloydb.iam.gserviceaccount.com
locals {
  alloydb_sa = "c-${var.project_number}-${substr(google_alloydb_cluster.default.uid, 0, 8)}@gcp-sa-alloydb.iam.gserviceaccount.com"
}

# Grant BigQuery access to the AlloyDB service account
resource "google_project_iam_member" "alloydb_bq_data_viewer" {
  project = var.project
  role    = "roles/bigquery.dataViewer"
  member  = "serviceAccount:${local.alloydb_sa}"
}

resource "google_project_iam_member" "alloydb_bq_read_session_user" {
  project = var.project
  role    = "roles/bigquery.readSessionUser"
  member  = "serviceAccount:${local.alloydb_sa}"
}

/*
# ==============================================================================
# AlloyDB BigQuery Foreign Data Wrapper Setup Script
# ==============================================================================
# Run this SQL script directly in your AlloyDB instance (e.g., via psql) to 
# onboard the flattened BigQuery report tables as foreign tables in Postgres.
#
# -- 1. Enable the BigQuery FDW extension
# CREATE EXTENSION IF NOT EXISTS alloydb_bigquery_fdw;
# 
# -- 2. Create the BigQuery foreign server
# CREATE SERVER IF NOT EXISTS bigquery_server
#   FOREIGN DATA WRAPPER bigquery_fdw
#   OPTIONS (
#       project_id 'httparchive'
#   );
# 
# -- 3. Grant usage to your working user (replace 'max@httparchive.org' as needed)
# GRANT USAGE ON FOREIGN SERVER bigquery_server TO "max@httparchive.org";
# 
# -- 4. Import the flat tables into your public schema
# IMPORT FOREIGN SCHEMA reports
#   LIMIT TO (
#     tech_report_geos,
#     tech_report_ranks,
#     tech_report_technologies_flat,
#     tech_report_categories_flat,
#     tech_report_adoption_flat,
#     tech_report_core_web_vitals_flat,
#     tech_report_lighthouse_flat,
#     tech_report_page_weight_flat
#   )
#   FROM SERVER bigquery_server
#   INTO public;
# ==============================================================================
*/
