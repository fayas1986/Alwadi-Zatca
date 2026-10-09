# AWS Infrastructure Module for Dedicated Customer ZATCA Environment (Region: me-central-1 / me-south-1)
variable "customer_id" { type = string }
variable "customer_legal_name" { type = string }
variable "region" { type = string }
variable "environment" { type = string }
variable "db_database_name" { type = string }

# VPC & Private Subnets
resource "aws_vpc" "customer_vpc" {
  cidr_block           = "10.0.0.0/16"
  enable_dns_support   = true
  enable_dns_hostnames = true

  tags = {
    Name        = "vpc-${var.customer_id}"
    Customer    = var.customer_id
    Environment = var.environment
  }
}

# Dedicated PostgreSQL RDS Instance in Private Subnet
resource "aws_db_instance" "customer_postgres" {
  allocated_storage      = 20
  max_allocated_storage  = 100
  engine                 = "postgres"
  engine_version         = "16"
  instance_class         = "db.t4g.micro"
  db_name                = var.db_database_name
  username               = "zatca_admin"
  password               = "ProtectedSecret#2026!KSA"
  skip_final_snapshot    = true
  storage_encrypted      = true
  publicly_accessible    = false

  tags = {
    Name        = "rds-${var.customer_id}"
    Customer    = var.customer_id
    Environment = var.environment
  }
}

# AWS Secrets Manager Secret for DB Connection
resource "aws_secretsmanager_secret" "db_credentials" {
  name = "zatca/${var.customer_id}/db-credentials"
}

output "rds_endpoint" {
  value = aws_db_instance.customer_postgres.endpoint
}
