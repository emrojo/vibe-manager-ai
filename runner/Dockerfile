FROM python:3.12-slim

# Install git, curl, ca-certificates
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /runner

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY run_task.py .

ENV PYTHONUNBUFFERED=1

CMD ["python", "run_task.py"]
