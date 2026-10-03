"""Shared configuration and default settings for HTTP Archive Airflow pipelines."""

from datetime import timedelta
import os
from airflow.models import Variable

# GCP & Dataform defaults (can be overridden via Airflow Variables or environment variables)
PROJECT_ID = Variable.get("GCP_PROJECT", default_var=os.environ.get("GCP_PROJECT", "httparchive"))
DATAFORM_REGION = Variable.get("DATAFORM_REGION", default_var="us-central1")
DATAFORM_REPOSITORY = Variable.get("DATAFORM_REPOSITORY", default_var="crawl-data")
DATAFORM_RELEASE_CONFIG = Variable.get("DATAFORM_RELEASE_CONFIG", default_var="production")

# Pub/Sub defaults
CRAWL_COMPLETE_SUBSCRIPTION = Variable.get(
    "CRAWL_COMPLETE_SUBSCRIPTION", default_var="airflow-crawl-complete"
)

DEFAULT_DAG_ARGS = {
    "owner": "httparchive",
    "depends_on_past": False,
    "email_on_failure": False,
    "email_on_retry": False,
    "retries": 2,
    "retry_delay": timedelta(minutes=5),
}
