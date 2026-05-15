locals {
  config_map_name = "${var.name}-config"
}

resource "kubernetes_config_map" "tracker_config" {
  metadata {
    name      = local.config_map_name
    namespace = var.namespace
  }

  data = {
    "tracker.toml" = templatefile("${path.module}/tracker.toml.tpl", {
      upstream_endpoint  = var.upstream_endpoint
      upstream_profile   = var.upstream_profile
      upstream_api_key   = var.upstream_api_key
      upstream_intersect = var.upstream_intersect
      upstream_addresses = var.upstream_filter_addresses
      oci_registry_url   = var.oci_registry_url
      include_scopes     = var.oci_include_scopes
      include_names      = var.oci_include_names
      exclude_scopes     = var.oci_exclude_scopes
      exclude_names      = var.oci_exclude_names
      profile_override   = var.oci_profile_override
    })
  }
}
