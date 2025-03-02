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

bigquery_export_deploy:
	cd infra/bigquery-export && npm run buildpack

bigquery_export_spark_deploy:
	cd infra/bigquery_export_spark && gcloud builds submit --region=global --tag us-docker.pkg.dev/httparchive/bigquery-spark-procedures/firestore_export:latest
