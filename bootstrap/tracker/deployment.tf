resource "kubernetes_deployment" "tracker" {
  metadata {
    name      = var.name
    namespace = var.namespace
    labels    = { role = var.name }
  }

  spec {
    replicas = var.replicas

    selector {
      match_labels = { role = var.name }
    }

    template {
      metadata {
        labels = { role = var.name }
      }

      spec {
        restart_policy = "Always"

        container {
          name              = "main"
          image             = var.image
          image_pull_policy = "IfNotPresent"
          args              = ["/etc/tracker/tracker.toml"]

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

          env {
            name  = "RUST_LOG"
            value = var.rust_log
          }

          resources {
            limits   = var.resources.limits
            requests = var.resources.requests
          }

          volume_mount {
            name       = "config"
            mount_path = "/etc/tracker/tracker.toml"
            sub_path   = "tracker.toml"
          }
        }

        volume {
          name = "config"
          config_map {
            name = local.config_map_name
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
