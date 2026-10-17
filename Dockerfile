FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PORT=8080 \
    APP_HOME=/app

WORKDIR $APP_HOME

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application files
COPY config.py .
COPY tax.py .
COPY emi.py .
COPY extract.py .
COPY translate.py .
COPY offer.py .
COPY auditor.py .
COPY plan.py .
COPY main.py .
COPY static/ ./static/
COPY samples/ ./samples/

EXPOSE 8080

CMD exec uvicorn main:app --host 0.0.0.0 --port ${PORT:-8080}
