FROM node:20-slim

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHON_BIN=/opt/ai-venv/bin/python \
    PATH="/opt/ai-venv/bin:${PATH}" \
    MOAN_FILTER=1 \
    TFHUB_CACHE_DIR=/tmp/tfhub_modules

RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    python3 \
    python3-venv \
    fonts-dejavu-core \
    git \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

RUN git config --global url."https://github.com/".insteadOf "ssh://git@github.com/"

WORKDIR /app

COPY requirements-ai-filter.txt ./requirements-ai-filter.txt
RUN python3 -m venv /opt/ai-venv \
    && /opt/ai-venv/bin/python -m pip install --no-cache-dir --upgrade pip \
    && /opt/ai-venv/bin/python -m pip install --no-cache-dir -r requirements-ai-filter.txt

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

CMD ["node", "index.js"]
