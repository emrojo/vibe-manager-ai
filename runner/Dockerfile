FROM python:3.12-slim

# Install git, curl, ca-certificates
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Create non-root runner user (UID 10001)
RUN groupadd -g 10001 runner && \
    useradd -u 10001 -g runner -m -d /home/runner -s /bin/bash runner

# Configure safe.directory for git
RUN git config --system --add safe.directory '*'

WORKDIR /runner

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY run_task.py .

# Prepare directories and permissions
RUN mkdir -p /runner_workspace /tmp && \
    chown -R runner:runner /runner /runner_workspace /home/runner /tmp

USER runner
ENV HOME=/home/runner
ENV PYTHONUNBUFFERED=1

CMD ["python", "run_task.py"]
