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
    "cd ./${var.function_name}/src/ && echo '{\"hash\":\"'$(git ls-files -s | sha1sum | cut -c1-8)'\"}'"
  ]
}

# Build Docker image
resource "docker_image" "function_image" {
  # hash added to image tag to force rebuilds ans service image updates when source changes
  name = "${var.region}-docker.pkg.dev/${var.project}/dataform/${var.function_name}:${data.external.source_hash.result.hash}"

  build {
    context    = "./${var.function_name}/src/"
    platform   = "linux/amd64"
  }
}

resource "docker_registry_image" "registry_image" {
  name = docker_image.function_image.name
}
