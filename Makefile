clean:
	rm -rf ./infra/bigquery-export/node_modules
	rm -rf ./infra/dataform-service/node_modules

tf_init:
	cd infra && terraform init -upgrade

tf_lint:
	cd infra && terraform fmt -check && terraform validate

tf_plan:
	cd infra && terraform plan

tf_apply:
	cd infra && terraform apply -auto-approve
