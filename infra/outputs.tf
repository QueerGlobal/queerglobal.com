output "worker_name" {
  value       = cloudflare_workers_script.coming_soon.script_name
  description = "Deployed Workers script name."
}

output "custom_domain_hostname" {
  value       = cloudflare_workers_custom_domain.coming_soon.hostname
  description = "Production hostname for the coming-soon page."
}
