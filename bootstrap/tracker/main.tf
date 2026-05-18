variable "namespace" {
  type    = string
  default = "telchar"
}

variable "name" {
  type    = string
  default = "telchar-tracker"
}

variable "image" {
  type = string
}

variable "replicas" {
  type    = number
  default = 1
}

variable "db_host" {
  type = string
}

variable "db_port" {
  type    = number
  default = 5432
}

variable "db_name" {
  type = string
}

variable "db_credentials_secret" {
  type = string
}

variable "upstream_endpoint" {
  type = string
}

variable "upstream_profile" {
  type    = string
  default = "mainnet"
}

variable "upstream_api_key" {
  type        = string
  default     = ""
  sensitive   = true
  description = "Demeter UTxORPC API key. Leave empty when talking to the cluster-internal UTxORPC service, which does not require authentication."
}

variable "upstream_intersect" {
  type        = string
  default     = "tip"
  description = "Resume point for the UTxORPC stream. Only the tag value \"tip\" is supported through this variable; slot/hash-based intersect points are not exposed here."
}

variable "upstream_filter_addresses" {
  type    = list(string)
  default = []
}

variable "oci_registry_url" {
  type    = string
  default = "http://telchar-registry.telchar.svc.cluster.local:5000"
}

variable "oci_include_scopes" {
  type    = list(string)
  default = []
}

variable "oci_include_names" {
  type    = list(string)
  default = []
}

variable "oci_exclude_scopes" {
  type    = list(string)
  default = []
}

variable "oci_exclude_names" {
  type    = list(string)
  default = []
}

variable "oci_profile_override" {
  type = list(object({
    match   = string
    profile = string
  }))
  default = []
}

variable "rust_log" {
  type    = string
  default = "info,tx3_registry_tracker=debug"
}

variable "resources" {
  type = object({
    requests = object({
      cpu    = optional(string)
      memory = string
    })
    limits = object({
      cpu    = optional(string)
      memory = string
    })
  })
  default = {
    requests = {
      cpu    = "100m"
      memory = "256Mi"
    }
    limits = {
      cpu    = "1000m"
      memory = "1Gi"
    }
  }
}

variable "tolerations" {
  type = list(object({
    effect   = string
    key      = string
    operator = string
    value    = optional(string)
  }))
  default = [
    {
      effect   = "NoSchedule"
      key      = "demeter.run/compute-profile"
      operator = "Equal"
      value    = "general-purpose"
    },
    {
      effect   = "NoSchedule"
      key      = "demeter.run/compute-arch"
      operator = "Equal"
      value    = "x86"
    },
    {
      effect   = "NoSchedule"
      key      = "demeter.run/availability-sla"
      operator = "Equal"
      value    = "best-effort"
    }
  ]
}
