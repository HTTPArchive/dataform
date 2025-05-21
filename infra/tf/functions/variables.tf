variable "project" {
  type = string
}

variable "function_identity" {
  type = string
}

variable "location" {
  type = string
}

variable "edit_datasets" {
  type    = list(string)
  default = []
}
