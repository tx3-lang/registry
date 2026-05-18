variable "namespace" {
  type = string
}

variable "name" {
  type    = string
  default = "telchar-postgres"
}

variable "db_name" {
  type    = string
  default = "tracker"
}

variable "owner_user" {
  type    = string
  default = "tracker"
}

variable "team_id" {
  type    = string
  default = "telchar"
}

variable "pg_version" {
  type        = string
  default     = "15"
  description = "PostgreSQL major version. Must match the major encoded in docker_image (e.g. spilo-15 → 15). Named pg_version because `version` is reserved by Terraform module meta-arguments. Cap is operator-dependent: the postgres-operator running in m2-prod-7xjh33 only supports up to 15 at the time of writing."
}

variable "replicas" {
  type    = number
  default = 1
}

variable "volume" {
  type = object({
    storage_class = string
    size          = string
  })
  default = {
    storage_class = "fast"
    size          = "20Gi"
  }
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
      memory = "2Gi"
    }
    limits = {
      cpu    = "2000m"
      memory = "4Gi"
    }
  }
}

variable "params" {
  type    = map(string)
  default = {}
}

variable "docker_image" {
  type        = string
  default     = "ghcr.io/zalando/spilo-15:3.2-p1"
  description = "Spilo image. Major version must match pg_version (e.g. spilo-15 for pg_version=15). Matches the image used by ext-balius in the same cluster."
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
      key      = "demeter.run/workload"
      operator = "Equal"
      value    = "mem-intensive"
      effect   = "NoSchedule"
    },
    {
      effect   = "NoSchedule"
      key      = "demeter.run/compute-profile"
      operator = "Exists"
    },
    {
      effect   = "NoSchedule"
      key      = "demeter.run/compute-arch"
      operator = "Equal"
      value    = "arm64"
    },
    {
      effect   = "NoSchedule"
      key      = "demeter.run/availability-sla"
      operator = "Equal"
      value    = "consistent"
    }
  ]
}
