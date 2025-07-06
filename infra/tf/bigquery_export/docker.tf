
# Get current Google Cloud access token
data "google_client_config" "default" {}

# Configure Docker provider with Artifact Registry authentication
provider "docker" {
  registry_auth {
    address  = "${var.region}-docker.pkg.dev"
    username = "oauth2accesstoken"
    password = data.google_client_config.default.access_token
  }
}

# Calculate hash of source files to determine if rebuild is needed
locals {
  source_files = fileset(path.root, "../${var.function_name}/*")
  source_hash  = substr(sha1(join("", [for f in local.source_files : filesha1(f)])), 0, 8)
}

# Build Docker image
resource "docker_image" "function_image" {
  name = "${var.region}-docker.pkg.dev/${var.project}/dataform/${var.function_name}:${local.source_hash}"

  build {
    context    = "../${var.function_name}/"
    dockerfile = "Dockerfile"
    platform   = "linux/amd64"
  }
}

resource "docker_registry_image" "registry_image" {
  name = docker_image.function_image.name
}
