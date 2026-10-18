.PHONY: rotate-doppler-github-token

# Recreates the Doppler service token and updates GitHub environment secret DOPPLER_TOKEN.
rotate-doppler-github-token:
	@echo "This runs: bash scripts/bootstrap-run.sh bash scripts/bootstrap-tofu-apply.sh -replace=doppler_service_token.github_actions_production (preflight, restore, apply, backup)"
	@printf 'Type rotate to confirm: '; read confirm; \
	if [ "$$confirm" != "rotate" ]; then echo "Aborted."; exit 1; fi; \
	bash scripts/bootstrap-run.sh bash scripts/bootstrap-tofu-apply.sh -replace=doppler_service_token.github_actions_production
