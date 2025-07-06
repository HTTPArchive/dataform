variable "project" {
  type = string
}

variable "function_identity" {
  type = string
}

variable "edit_datasets" {
  type    = list(string)
  default = []
}
