[upstream]
endpoint  = ${jsonencode(upstream_endpoint)}
profile   = ${jsonencode(upstream_profile)}
%{ if upstream_api_key != "" ~}
api_key   = ${jsonencode(upstream_api_key)}
%{ endif ~}
intersect = ${jsonencode(upstream_intersect)}

[upstream.filter]
addresses = ${jsonencode(upstream_addresses)}

[storage]
# The DATABASE_URL env var overrides this value at runtime (see config.rs:114).
database_url = ""

[oci]
registry_url   = ${jsonencode(oci_registry_url)}
include_scopes = ${jsonencode(include_scopes)}
include_names  = ${jsonencode(include_names)}
exclude_scopes = ${jsonencode(exclude_scopes)}
exclude_names  = ${jsonencode(exclude_names)}

%{ for o in profile_override ~}
[[oci.profile_override]]
match   = ${jsonencode(o.match)}
profile = ${jsonencode(o.profile)}
%{ endfor ~}
