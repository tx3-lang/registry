resource "kubernetes_deployment" "this" {
  metadata {
    name      = local.name
    namespace = var.namespace
    labels    = local.labels
  }

  spec {
    replicas = var.replicas
    selector {
      match_labels = local.labels
    }

    template {
      metadata {
        name   = local.name
        labels = local.labels
      }

      spec {
        restart_policy = "Always"

        container {
          name              = "main"
          image             = var.image
          image_pull_policy = "IfNotPresent"

          env {
            name  = "REGISTRY_HOST"
            value = var.registry_host
          }

          env {
            name  = "REGISTRY_PROTOCOL"
            value = var.registry_protocol
          }

          env {
            name = "PG_USER"
            value_from {
              secret_key_ref {
                name = var.db_credentials_secret
                key  = "username"
              }
            }
          }

          env {
            name = "PG_PASSWORD"
            value_from {
              secret_key_ref {
                name = var.db_credentials_secret
                key  = "password"
              }
            }
          }

          # Zalando operator passwords are not guaranteed URL-safe. If a generated
          # password contains ':', '@', '/' or '?', this connection string will be
          # malformed. Mitigation if it ever bites: switch to PgConnectOptions or
          # URL-encode PG_PASSWORD in an init container.
          env {
            name  = "DATABASE_URL"
            value = "postgresql://$(PG_USER):$(PG_PASSWORD)@${var.db_host}:${var.db_port}/${var.db_name}?sslmode=disable"
          }

          resources {
            limits   = var.resources.limits
            requests = var.resources.requests
          }
        }

        dynamic "toleration" {
          for_each = var.tolerations

          content {
            effect   = toleration.value.effect
            key      = toleration.value.key
            operator = toleration.value.operator
            value    = toleration.value.value
          }
        }
      }
    }
  }
}
