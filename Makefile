clean:
	rm -rf ./infra/bigquery-export/node_modules
	rm -rf ./infra/dataform-service/node_modules

tf_plan:
	cd infra && terraform init -upgrade && terraform plan

tf_apply:
	cd infra && terraform init && terraform apply -auto-approve
