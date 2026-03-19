# Stage: runtime
FROM python:3.12-slim

# Prevents Python from writing .pyc files and enables stdout/stderr logging
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

# Install OS-level dependencies needed by some Python packages
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies first (layer-cached unless requirements change)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of the source code
COPY . .

EXPOSE 8000

# Run migrations then start gunicorn.
# - The "app.wsgi" refers to backend/app/wsgi.py (Django's WSGI entry point).
# - 0.0.0.0:8000 binds to all interfaces so Docker can route traffic into the container.
CMD ["sh", "-c", "python manage.py migrate --noinput && gunicorn app.wsgi:application --bind 0.0.0.0:8000 --workers 2"]
