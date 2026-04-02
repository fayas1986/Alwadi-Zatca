SELECT c.environment, COUNT(i.id) as invoice_count
FROM invoices i
JOIN companies c ON i.company_id = c.id 
GROUP BY c.environment;

SELECT environment, is_active, COUNT(*) as config_count
FROM erp_configurations
GROUP BY environment, is_active;
