FUNCTION_NAME = dataform-trigger
FUNCTION_SRC = ./infra/dataform-trigger/

.PHONY: *

start:
	npx functions-framework --target=$(FUNCTION_NAME) --source=$(FUNCTION_SRC) --signature-type=http --port=8080 --debug

tf_plan:
	terraform -chdir=infra/tf init -upgrade && terraform -chdir=infra/tf plan \
		-var="FUNCTION_NAME=$(FUNCTION_NAME)" \
		-var="FUNCTION_SRC=$(FUNCTION_SRC)"

tf_apply:
	terraform -chdir=infra/tf init && terraform -chdir=infra/tf apply -auto-approve \
		-var="FUNCTION_NAME=$(FUNCTION_NAME)" \
		-var="FUNCTION_SRC=$(FUNCTION_SRC)"
