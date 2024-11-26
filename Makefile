.PHONY: *

tf_plan:
	terraform -chdir=infra/tf init -upgrade && terraform -chdir=infra/tf plan

tf_apply:
	terraform -chdir=infra/tf init && terraform -chdir=infra/tf apply -auto-approve
