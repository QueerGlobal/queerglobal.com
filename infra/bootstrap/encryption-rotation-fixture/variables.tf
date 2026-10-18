variable "bootstrap_state_passphrase" {
  type      = string
  sensitive = true
}

variable "bootstrap_state_passphrase_previous" {
  type      = string
  sensitive = true
  default   = ""
}
