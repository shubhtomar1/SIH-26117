FROM python:3.11-slim
WORKDIR /srv
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY app ./app
COPY run.py ./
# OLLAMA_URL points to Ollama on the HOST machine (install Ollama separately).
# On Linux also add: extra_hosts: ["host.docker.internal:host-gateway"]
ENV OLLAMA_URL=http://host.docker.internal:11434
ENV MODE=MVP_MOCK
VOLUME ["/srv/data", "/srv/logs"]
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
