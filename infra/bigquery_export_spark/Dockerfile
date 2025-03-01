# Recommendation: Use Debian 12.
FROM python:3.12-slim

# Suppress interactive prompts
ENV DEBIAN_FRONTEND=noninteractive

# Install utilities required by Spark scripts.
RUN apt update && apt install -y procps tini libjemalloc2

# Enable jemalloc2 as default memory allocator
ENV LD_PRELOAD=/usr/lib/x86_64-linux-gnu/libjemalloc.so.2

# Install packages.
RUN pip install --no-cache-dir \
    google-cloud-bigquery \
    google-cloud-storage \
    google-cloud-firestore \
    grpcio \
    google-cloud-secret-manager

# Create the 'spark' group/user.
# The GID and UID must be 1099. Home directory is required.
RUN groupadd -g 1099 spark
RUN useradd -u 1099 -g 1099 -d /home/spark -m spark
USER spark
