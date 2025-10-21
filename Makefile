.PHONY: *

clean:
	rm -rf ./infra/bigquery-export/node_modules
	rm -rf ./infra/dataform-service/node_modules

tf_plan:
	terraform -chdir=infra/tf init -upgrade && terraform -chdir=infra/tf plan

tf_apply:
	terraform -chdir=infra/tf init && terraform -chdir=infra/tf apply -auto-approve
