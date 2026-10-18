.PHONY: rotate-doppler-github-token

# Recreates the Doppler service token and updates GitHub environment secret DOPPLER_TOKEN.
rotate-doppler-github-token:
	@echo "This runs: tofu -chdir=infra/bootstrap apply -replace=doppler_service_token.github_actions_production"
	@printf 'Type rotate to confirm: '; read confirm; \
	if [ "$$confirm" != "rotate" ]; then echo "Aborted."; exit 1; fi; \
	tofu -chdir=infra/bootstrap apply -replace=doppler_service_token.github_actions_production
