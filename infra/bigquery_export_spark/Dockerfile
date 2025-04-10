# Dataproc image example: https://cloud.google.com/dataproc-serverless/docs/guides/custom-containers
# Recommendation: Use Debian 12.
FROM debian:12-slim
# python:3.12-slim

# Suppress interactive prompts
ENV DEBIAN_FRONTEND=noninteractive

# Install utilities required by Spark scripts.
RUN apt-get update && apt-get install -y procps=\* tini=\* libjemalloc2=\* \
  && apt-get clean \
  && rm -rf /var/lib/apt/lists/*

# Enable jemalloc2 as default memory allocator
ENV LD_PRELOAD=/usr/lib/x86_64-linux-gnu/libjemalloc.so.2

# Install and configure Miniconda3.
ENV CONDA_HOME=/opt/miniforge3
ENV PYSPARK_PYTHON=${CONDA_HOME}/bin/python
ENV PATH=${CONDA_HOME}/bin:${PATH}
ADD https://github.com/conda-forge/miniforge/releases/latest/download/Miniforge3-Linux-x86_64.sh .
RUN bash Miniforge3-Linux-x86_64.sh -b -p /opt/miniforge3 \
  && ${CONDA_HOME}/bin/conda config --system --set always_yes True \
  && ${CONDA_HOME}/bin/conda config --system --set auto_update_conda False \
  && ${CONDA_HOME}/bin/conda config --system --set channel_priority strict

WORKDIR /app
COPY requirements.txt .

# Install pip packages.
RUN ${PYSPARK_PYTHON} -m pip install --no-cache-dir -r requirements.txt

# Create the 'spark' group/user.
# The GID and UID must be 1099. Home directory is required.
RUN groupadd -g 1099 spark
RUN useradd -u 1099 -g 1099 -d /home/spark -m spark
USER spark
