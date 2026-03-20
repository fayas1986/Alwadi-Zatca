SELECT 'ERP Configs' as category, environment, base_url, is_active FROM erp_configurations WHERE company_id = 38
UNION ALL
SELECT 'Certificates' as category, type as environment, common_name as base_url, is_active FROM certificates WHERE company_id = 38;
