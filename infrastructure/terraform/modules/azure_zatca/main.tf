# Azure Infrastructure Module for Dedicated Customer ZATCA Environment (Region: saudiarabiaeast)
variable "customer_id" { type = string }
variable "customer_legal_name" { type = string }
variable "region" { type = string }
variable "environment" { type = string }
variable "db_database_name" { type = string }

resource "azurerm_resource_group" "customer_rg" {
  name     = "rg-zatca-${var.customer_id}"
  location = var.region

  tags = {
    Customer    = var.customer_id
    Environment = var.environment
  }
}

resource "azurerm_postgresql_flexible_server" "customer_pg_server" {
  name                   = "psql-zatca-${var.customer_id}"
  resource_group_name    = azurerm_resource_group.customer_rg.name
  location               = azurerm_resource_group.customer_rg.location
  version                = "16"
  administrator_login    = "zatca_admin"
  administrator_password = "ProtectedSecret#2026!Azure"
  storage_mb             = 32768
  sku_name               = "B_Standard_B1ms"
}

resource "azurerm_postgresql_flexible_server_database" "customer_db" {
  name      = var.db_database_name
  server_id = azurerm_postgresql_flexible_server.customer_pg_server.id
  collation = "en_US.utf8"
  charset   = "utf8"
}

output "azure_postgres_fqdn" {
  value = azurerm_postgresql_flexible_server.customer_pg_server.fqdn
}
