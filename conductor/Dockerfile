FROM python:3.12-slim

# Install system dependencies required for eccodes/cfgrib
RUN apt-get update && apt-get install -y \
    libeccodes0 \
    libeccodes-tools \
    && rm -rf /var/lib/apt/lists/*

# Install uv
RUN pip install uv

# Set working directory
WORKDIR /app

# Copy dependency files
COPY pyproject.toml uv.lock README.md ./

# Install dependencies
RUN uv sync --frozen

# Copy source code
COPY . .

# Set entrypoint
ENTRYPOINT ["uv", "run", "mag-slicer"]
CMD ["--help"]
