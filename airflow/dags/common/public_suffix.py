"""Public Suffix List synchronization utilities for BigQuery."""

from typing import Any, Dict, List
import urllib.request
import idna
from google.cloud import bigquery

PSL_URL = "https://publicsuffix.org/list/public_suffix_list.dat"


def fetch_psl_private_domains(url: str = PSL_URL) -> List[Dict[str, Any]]:
    """Fetch the Public Suffix List and parse the PRIVATE DOMAINS section."""
    req = urllib.request.Request(
        url,
        headers={"User-Agent": "HTTPArchive-Airflow/1.0 (+https://httparchive.org)"},
    )
    with urllib.request.urlopen(req) as resp:
        text = resp.read().decode("utf-8")

    begin = text.find("// ===BEGIN PRIVATE DOMAINS===")
    end = text.find("// ===END PRIVATE DOMAINS===")
    if begin == -1 or end == -1:
        raise ValueError("PRIVATE DOMAINS section not found in Public Suffix List")

    rules: List[Dict[str, Any]] = []
    seen = set()
    for raw_line in text[begin:end].splitlines():
        line = raw_line.strip()
        if not line or line.startswith("//"):
            continue
        if line.startswith("!"):
            raise ValueError(f"Exception rules are not supported: {line}")
        is_wildcard = line.startswith("*.")
        rule = line[2:] if is_wildcard else line
        puny = idna.encode(rule).decode("ascii")
        key = (puny, is_wildcard)
        if key not in seen:
            seen.add(key)
            rules.append({"suffix": puny, "is_wildcard": is_wildcard})

    return rules


def sync_public_suffix_private(
    project_id: str,
    dataset_id: str = "urls",
    table_name: str = "public_suffix_private",
) -> int:
    """Download and load private public suffix rules into BigQuery."""
    rules = fetch_psl_private_domains()
    client = bigquery.Client(project=project_id)
    table_id = f"{project_id}.{dataset_id}.{table_name}"

    job_config = bigquery.LoadJobConfig(
        schema=[
            bigquery.SchemaField(
                "suffix",
                "STRING",
                mode="REQUIRED",
                description="Private domain public suffix (ASCII punycode)",
            ),
            bigquery.SchemaField(
                "is_wildcard",
                "BOOLEAN",
                mode="REQUIRED",
                description="Whether suffix is a wildcard rule (*.)",
            ),
        ],
        write_disposition=bigquery.WriteDisposition.WRITE_TRUNCATE,
    )

    job = client.load_table_from_json(rules, table_id, job_config=job_config)
    job.result()
    return len(rules)
