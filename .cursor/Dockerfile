# QueerGlobal shared Cloud Agent base image.
#
# One image, reused across every repo in the QueerGlobal org, so that a
# Cloud Agent working on any repo (Go services, the React frontend, the
# static site, the artwork API, docs) starts from the same toolchain.
#
# Language runtimes and stable system tooling live here. Repo-specific
# dependency installation belongs in each repo's environment.json `install`,
# and long-running dev servers belong in `terminals`.
FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive
ENV GO_VERSION=1.22.5
ENV NODE_MAJOR=20

# System packages + common CLI tooling shared across the org.
RUN apt-get update && apt-get install -y --no-install-recommends \
        ca-certificates \
        curl \
        wget \
        gnupg \
        git \
        build-essential \
        make \
        jq \
        unzip \
        zip \
        bash \
        python3 \
        python3-pip \
        python3-venv \
        shellcheck \
        docker.io \
        docker-compose-v2 \
        docker-buildx \
        fuse-overlayfs \
    && rm -rf /var/lib/apt/lists/*

# Go (pinned to match hub-framework's toolchain and go-jsonschema/.tool-versions).
RUN curl -fsSL "https://go.dev/dl/go${GO_VERSION}.linux-amd64.tar.gz" -o /tmp/go.tgz \
    && tar -C /usr/local -xzf /tmp/go.tgz \
    && rm /tmp/go.tgz

# Node.js LTS via NodeSource.
RUN curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

# golangci-lint (pinned to match go-jsonschema/.tool-versions).
RUN curl -fsSL https://raw.githubusercontent.com/golangci/golangci-lint/master/install.sh \
        | sh -s -- -b /usr/local/bin v1.59.1

# The ubuntu:24.04 image ships a non-root "ubuntu" user (uid 1000).
# Allow it to use the Docker socket for repos that run docker/compose.
RUN usermod -aG docker ubuntu

# Make Go and user-installed Go binaries available on PATH for every user.
ENV PATH="/usr/local/go/bin:/home/ubuntu/go/bin:${PATH}"
ENV GOPATH="/home/ubuntu/go"

USER ubuntu
