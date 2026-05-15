output "credentials_secret_name" {
  value = "${var.owner_user}.${var.name}.credentials.postgresql.acid.zalan.do"
}

output "service_host" {
  value = "${var.name}.${var.namespace}.svc.cluster.local"
}

output "service_port" {
  value = 5432
}

output "db_name" {
  value = var.db_name
}

output "owner_user" {
  value = var.owner_user
}
