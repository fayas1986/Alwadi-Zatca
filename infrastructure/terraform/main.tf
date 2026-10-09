terraform {
  required_version = ">= 1.5.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 3.0"
    }
  }
}

variable "customer_spec" {
  type = object({
    customer_id          = string
    customer_legal_name  = string
    cloud_provider       = string
    region               = string
    environment          = string
    application_version  = string
    db_database_name     = string
  })
  description = "Validated Customer Deployment Specification"
}

module "aws_zatca_deployment" {
  count  = var.customer_spec.cloud_provider == "aws" ? 1 : 0
  source = "./modules/aws_zatca"

  customer_id         = var.customer_spec.customer_id
  customer_legal_name = var.customer_spec.customer_legal_name
  region              = var.customer_spec.region
  environment         = var.customer_spec.environment
  db_database_name    = var.customer_spec.db_database_name
}

module "azure_zatca_deployment" {
  count  = var.customer_spec.cloud_provider == "azure" ? 1 : 0
  source = "./modules/azure_zatca"

  customer_id         = var.customer_spec.customer_id
  customer_legal_name = var.customer_spec.customer_legal_name
  region              = var.customer_spec.region
  environment         = var.customer_spec.environment
  db_database_name    = var.customer_spec.db_database_name
}

output "deployment_summary" {
  value = {
    customer_id    = var.customer_spec.customer_id
    cloud_provider = var.customer_spec.cloud_provider
    region         = var.customer_spec.region
    status         = "PROVISIONED"
  }
}
