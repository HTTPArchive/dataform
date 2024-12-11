.PHONY: *

clean:
	rm -rf ./infra/dataform-trigger/node_modules
	rm -rf ./infra/dataform-export/node_modules
	rm -rf ./infra/bigquery-export/node_modules
	rm -rf infra/tf/tmp/*

tf_plan:
	terraform -chdir=infra/tf init -upgrade && terraform -chdir=infra/tf plan

tf_apply:
	terraform -chdir=infra/tf init && terraform -chdir=infra/tf apply -auto-approve
