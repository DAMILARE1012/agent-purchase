FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

# DejaVu has the naira sign, for catalog images.
RUN apt-get update \
    && apt-get install -y --no-install-recommends fonts-dejavu-core \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /srv
COPY requirements.txt .
RUN pip install -r requirements.txt
COPY app ./app
COPY tests ./tests
RUN useradd --create-home --uid 10001 app
USER app

EXPOSE 8200
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8200"]
