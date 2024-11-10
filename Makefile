FN_NAME = dataform-trigger
FN_SRC = ./infra/dataform-trigger/

.PHONY: *

start:
	npx functions-framework --target=$(FN_NAME) --source=$(FN_SRC) --signature-type=http --port=8080 --debug

tf_plan:
	terraform -chdir=infra/tf init -upgrade && terraform -chdir=infra/tf plan \
		-var="FUNCTION_NAME=$(FN_NAME)" \
		-var="FUNCTION_SRC=$(FN_SRC)"

tf_apply:
	terraform -chdir=infra/tf init && terraform -chdir=infra/tf apply -auto-approve \
		-var="FUNCTION_NAME=$(FN_NAME)" \
		-var="FUNCTION_SRC=$(FN_SRC)"
