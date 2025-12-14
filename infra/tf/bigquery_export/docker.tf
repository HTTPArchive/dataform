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

# Calculate hash of source files using git (respects .gitignore)
data "external" "source_hash" {
  program = [
    "bash",
    "-c",
    "cd ../${var.function_name}/ && echo '{\"hash\":\"'$(git ls-files -s | sha1sum | cut -c1-8)'\"}'"
  ]
}

# Build Docker image
resource "docker_image" "function_image" {
  name = "${var.region}-docker.pkg.dev/${var.project}/dataform/${var.function_name}"

  build {
    context    = "../${var.function_name}/"
    platform   = "linux/amd64"
  }
  triggers = {
    source_hash = data.external.source_hash.result.hash
  }
}

resource "docker_registry_image" "registry_image" {
  name = docker_image.function_image.name
}
