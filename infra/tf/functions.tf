locals {
  function_identity = "cloud-function@httparchive.iam.gserviceaccount.com"
}

resource "google_project_iam_member" "project" {
  for_each = toset(["roles/bigquery.jobUser", "roles/dataform.serviceAgent", "roles/run.invoker"])

  project = local.project
  role    = each.value
  member  = "serviceAccount:${local.function_identity}"
}
