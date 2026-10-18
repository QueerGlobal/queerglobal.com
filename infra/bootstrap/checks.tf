check "doppler_deploy_config_isolated_from_bootstrap" {
  assert {
    condition     = var.doppler_config != var.doppler_bootstrap_config
    error_message = "doppler_config and doppler_bootstrap_config must differ so the deploy service token cannot target bootstrap secrets."
  }
}
