resource "kubernetes_manifest" "postgres" {
  field_manager {
    force_conflicts = true
  }
  manifest = {
    "apiVersion" = "acid.zalan.do/v1"
    "kind"       = "postgresql"
    "metadata" = {
      "name"      = var.name
      "namespace" = var.namespace
    }
    "spec" = {
      "env" : [
        {
          "name" : "ALLOW_NOSSL"
          "value" : "true"
        }
      ]
      "numberOfInstances"         = var.replicas
      "enableMasterLoadBalancer"  = false
      "enableReplicaLoadBalancer" = false
      "allowedSourceRanges"       = null
      "dockerImage"               = var.docker_image
      "teamId"                    = var.team_id
      "tolerations"               = var.tolerations
      "databases" = {
        (var.db_name) = var.owner_user
      }
      "postgresql" = {
        "version"    = var.pg_version
        "parameters" = var.params
      }
      "users" = {
        (var.owner_user) = [
          "superuser",
          "createdb",
          "login"
        ]
      }
      "resources" = {
        "limits"   = var.resources.limits
        "requests" = var.resources.requests
      }
      "volume" = {
        "storageClass" = var.volume.storage_class
        "size"         = var.volume.size
      }
      "sidecars" = [
        {
          name : "exporter"
          image : "quay.io/prometheuscommunity/postgres-exporter:v0.12.0"
          env : [
            {
              name : "DATA_SOURCE_URI"
              value : "localhost:5432/${var.db_name}?sslmode=disable"
            },
            {
              name : "DATA_SOURCE_USER"
              value : "$(POSTGRES_USER)"
            },
            {
              name : "DATA_SOURCE_PASS"
              value : "$(POSTGRES_PASSWORD)"
            },
            {
              name : "PG_EXPORTER_CONSTANT_LABELS"
              value : "service=${var.name}"
            }
          ]
          ports : [
            {
              name : "metrics"
              containerPort : 9187
            }
          ]
        }
      ]
    }
  }
}
