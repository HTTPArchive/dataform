FN_NAME = dataform-trigger

.PHONY: *

start:
	npx functions-framework --target=$(FN_NAME) --source=./infra/dataform-trigger/ --signature-type=http --port=8080 --debug

tf_plan:
	terraform -chdir=infra/tf init -upgrade && terraform -chdir=infra/tf plan \
		-var="FUNCTION_NAME=$(FN_NAME)"

tf_apply:
	terraform -chdir=infra/tf init && terraform -chdir=infra/tf apply -auto-approve \
		-var="FUNCTION_NAME=$(FN_NAME)"
