#!/usr/bin/env bash
set -euo pipefail

# Directory of this script
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${DIR}/../../.." && pwd)"

echo "=== Checking Java installation ==="
if command -v brew >/dev/null 2>&1; then
    if ! brew list openjdk@17 >/dev/null 2>&1; then
        echo "Installing OpenJDK 17 via Homebrew..."
        brew install openjdk@17
    else
        echo "OpenJDK 17 is already installed."
    fi
    JAVA_HOME_PATH="$(brew --prefix openjdk@17)"
elif [ -d "/usr/lib/jvm/java-21-openjdk-amd64" ]; then
    JAVA_HOME_PATH="/usr/lib/jvm/java-21-openjdk-amd64"
    echo "Found OpenJDK 21 at ${JAVA_HOME_PATH}"
elif [ -d "/usr/lib/jvm/java-17-openjdk-amd64" ]; then
    JAVA_HOME_PATH="/usr/lib/jvm/java-17-openjdk-amd64"
    echo "Found OpenJDK 17 at ${JAVA_HOME_PATH}"
else
    JAVA_HOME_PATH="${JAVA_HOME:-}"
fi

echo "Configuring JAVA_HOME=${JAVA_HOME_PATH}"
export JAVA_HOME="${JAVA_HOME_PATH}"
export PATH="${JAVA_HOME}/bin:${PATH}"

echo "=== Configuring Python Virtual Environment ==="
VENV_DIR="${REPO_ROOT}/.venv_lakehouse"

if [ ! -d "${VENV_DIR}" ]; then
    echo "Creating virtual environment at ${VENV_DIR} with Python 3.12..."
    uv venv --python /usr/local/bin/python3.12 "${VENV_DIR}"
fi

echo "Installing PySpark and Iceberg dependencies..."
uv pip install --python "${VENV_DIR}/bin/python" "pyspark==4.0.4" "google-auth" "pyiceberg"

echo "=== Environment Ready ==="
echo "To activate:"
echo "  export JAVA_HOME=${JAVA_HOME_PATH}"
echo "  export PATH=\${JAVA_HOME}/bin:\${PATH}"
echo "  source ${VENV_DIR}/bin/activate"
