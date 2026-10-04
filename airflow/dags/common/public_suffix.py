"""Public Suffix List synchronization utilities for BigQuery."""

from typing import Any, Dict, List
import urllib.request
import idna
from google.cloud import bigquery

PSL_URL = "https://publicsuffix.org/list/public_suffix_list.dat"


def fetch_public_suffix_list(url: str = PSL_URL) -> List[Dict[str, Any]]:
    """Fetch the full Public Suffix List and parse ICANN and PRIVATE domain sections."""
    req = urllib.request.Request(
        url,
        headers={"User-Agent": "HTTPArchive-Airflow/1.0 (+https://httparchive.org)"},
    )
    with urllib.request.urlopen(req) as resp:
        text = resp.read().decode("utf-8")

    current_section = None
    rules: List[Dict[str, Any]] = []
    seen = set()

    for raw_line in text.splitlines():
        line = raw_line.strip()
        if line.startswith("// ===BEGIN ICANN DOMAINS==="):
            current_section = "ICANN"
            continue
        elif line.startswith("// ===END ICANN DOMAINS==="):
            current_section = None
            continue
        elif line.startswith("// ===BEGIN PRIVATE DOMAINS==="):
            current_section = "PRIVATE"
            continue
        elif line.startswith("// ===END PRIVATE DOMAINS==="):
            current_section = None
            continue

        if not current_section or not line or line.startswith("//"):
            continue

        is_exception = line.startswith("!")
        is_wildcard = line.startswith("*.")

        if is_exception:
            rule = line[1:]
        elif is_wildcard:
            rule = line[2:]
        else:
            rule = line

        puny = idna.encode(rule).decode("ascii")
        key = (puny, is_wildcard, is_exception, current_section)
        if key not in seen:
            seen.add(key)
            rules.append({
                "suffix": puny,
                "is_wildcard": is_wildcard,
                "is_exception": is_exception,
                "is_private": current_section == "PRIVATE",
                "section": current_section,
            })

    return rules


def sync_public_suffix_list(
    project_id: str,
    dataset_id: str = "urls",
    table_name: str = "public_suffix_list",
) -> int:
    """Download and load the full Public Suffix List (ICANN + private) into BigQuery."""
    rules = fetch_public_suffix_list()
    client = bigquery.Client(project=project_id)
    table_id = f"{project_id}.{dataset_id}.{table_name}"

    job_config = bigquery.LoadJobConfig(
        schema=[
            bigquery.SchemaField(
                "suffix",
                "STRING",
                mode="REQUIRED",
                description="Domain public suffix in ASCII punycode",
            ),
            bigquery.SchemaField(
                "is_wildcard",
                "BOOLEAN",
                mode="REQUIRED",
                description="Whether suffix is a wildcard rule (*.)",
            ),
            bigquery.SchemaField(
                "is_exception",
                "BOOLEAN",
                mode="REQUIRED",
                description="Whether suffix is an exception rule (!)",
            ),
            bigquery.SchemaField(
                "is_private",
                "BOOLEAN",
                mode="REQUIRED",
                description="Whether suffix is in the PRIVATE section",
            ),
            bigquery.SchemaField(
                "section",
                "STRING",
                mode="REQUIRED",
                description="Public Suffix List section (ICANN or PRIVATE)",
            ),
        ],
        write_disposition=bigquery.WriteDisposition.WRITE_TRUNCATE,
    )

    job = client.load_table_from_json(rules, table_id, job_config=job_config)
    job.result()
    return len(rules)


# Backward-compatibility alias
sync_public_suffix_private = sync_public_suffix_list
