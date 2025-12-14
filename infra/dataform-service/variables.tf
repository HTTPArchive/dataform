variable "project" {
  description = "The GCP project ID"
  type        = string
}

variable "region" {
  description = "The GCP region"
  type        = string
}

variable "location" {
  type = string
}

variable "function_name" {
  description = "The name of the function"
  type        = string
}

variable "function_identity" {
  description = "The service account email for the function"
  type        = string
}

