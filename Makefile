GCP_PROJECT ?= $(shell gcloud config get-value project)
GCP_REGION = us-central1
FUNCTION_IDENTITY = cloud-function@httparchive.iam.gserviceaccount.com
FUNCTION_NAME = dataformTrigger
FUNCTION_SRC = infra/trigger_function

.PHONY: *

start:
	npx functions-framework --target=$(FUNCTION_NAME) --source=$(FUNCTION_SRC) --signature-type=http --port=8080 --debug

tf_plan:
	terraform -chdir=infra/tf init -upgrade && terraform -chdir=infra/tf plan

tf_apply:
	terraform -chdir=infra/tf init && terraform -chdir=infra/tf apply -auto-approve

deploy_fn:
	gcloud functions deploy $(FUNCTION_NAME) \
		--runtime=nodejs20 \
		--region=$(GCP_REGION) \
		--source=$(FUNCTION_SRC) \
		--trigger-http \
		--run-service-account=$(FUNCTION_IDENTITY) \
		--memory=256MB \
		--timeout=120s \
		--max-instances=1 \
		--gen2 \
		--quiet
