.PHONY: build run run-debug stop restart logs clean rebuild help build-dev gh-pages deploy-gh-pages rebuild-all build-debug test test-verbose

# Docker image name
IMAGE_NAME := pong
CONTAINER_NAME := pong-container
HOST_PORT := 8080
CONTAINER_PORT := 80

# Git remote for GitHub Pages
GH_PAGES_REMOTE := upstream
GH_PAGES_BRANCH := main

help: ## Show this help message
	@echo 'Usage: make [target]'
	@echo ''
	@echo 'Targets:'
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z_-]+:.*?## / {printf "  %-15s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

test: ## Run the test suite
	npm test -- --run

test-verbose: ## Run the test suite with max verbosity (npm silly, vitest verbose, shell -x)
	set -x; npm run test --loglevel silly -- --run --reporter=verbose

build: ## Build the Docker image
	@echo "Building Docker image..."
	docker build -t $(IMAGE_NAME) .
	@echo "Build complete!"

run: ## Run the container on localhost:8080
	@echo "Starting container..."
	docker run -d \
		--name $(CONTAINER_NAME) \
		-p $(HOST_PORT):$(CONTAINER_PORT) \
		--rm \
		$(IMAGE_NAME)
	@echo "Container running on http://localhost:$(HOST_PORT)"
	@echo "Use 'make stop' to stop the container"

run-debug: ## Run the container with verbose debug mode
	@echo "Starting container in debug mode..."
	docker run -d \
		--name $(CONTAINER_NAME) \
		-p $(HOST_PORT):$(CONTAINER_PORT) \
		--rm \
		-e NGINX_DEBUG=1 \
		$(IMAGE_NAME) \
		sh -c "nginx -V && nginx -t -c /etc/nginx/nginx.conf && nginx -g 'daemon off; error_log /dev/stderr debug;'"
	@echo "Container running in debug mode on http://localhost:$(HOST_PORT)"
	@echo "Use 'make stop' to stop the container"
	@echo "Use 'make logs' to view debug logs"

stop: ## Stop and remove the running container
	@echo "Stopping container..."
	-docker stop $(CONTAINER_NAME) 2>/dev/null || true
	-docker rm $(CONTAINER_NAME) 2>/dev/null || true
	@echo "Container stopped"

restart: ## Force kill any running instances and start the container
	@echo "Force killing any running instances..."
	-docker kill $(CONTAINER_NAME) 2>/dev/null || true
	-docker rm -f $(CONTAINER_NAME) 2>/dev/null || true
	@echo "Starting container..."
	docker run -d \
		--name $(CONTAINER_NAME) \
		-p $(HOST_PORT):$(CONTAINER_PORT) \
		--rm \
		$(IMAGE_NAME)
	@echo "Container restarted on http://localhost:$(HOST_PORT)"

logs: ## View container logs
	docker logs -f $(CONTAINER_NAME)

clean: ## Remove the Docker image
	@echo "Removing Docker image..."
	-docker rmi $(IMAGE_NAME)
	@echo "Clean complete!"

rebuild: clean build ## Rebuild the Docker image from scratch

# Development build targets
build-dev: ## Build for development (Vite bundle to dist/)
	@echo "Building development bundle..."
	npm run build
	@echo "Development build complete! Output: dist/"

# GitHub Pages build targets
gh-pages: ## Build inline HTML for GitHub Pages (debug screens disabled)
	@echo "Building GitHub Pages inline HTML..."
	DISABLE_DEBUG=1 npm run build:gh-pages
	@echo ""
	@echo "✓ GitHub Pages build complete!"
	@echo "  Output: index.html"
	@echo ""
	@git status --short index.html

deploy-gh-pages: gh-pages ## Build inline HTML and push to GitHub Pages
	@echo ""
	@echo "Deploying to GitHub Pages..."
	@echo ""
	@git add index.html
	@git diff --cached --stat index.html
	@echo ""
	@read -p "Commit and push to $(GH_PAGES_REMOTE)/$(GH_PAGES_BRANCH)? [y/N] " -n 1 -r; \
	echo; \
	if [[ $$REPLY =~ ^[Yy]$$ ]]; then \
		git commit -m "Update GitHub Pages inline HTML" || true; \
		git push $(GH_PAGES_REMOTE) $(GH_PAGES_BRANCH); \
		echo ""; \
		echo "✓ Deployed to GitHub Pages!"; \
		echo "  URL: https://kainswor.github.io/pong/"; \
		echo "  (may take 1-5 minutes to appear)"; \
	else \
		echo "Deployment cancelled."; \
		git reset HEAD index.html; \
	fi

rebuild-all: clean build-dev gh-pages ## Rebuild both Docker and GitHub Pages versions
	@echo ""
	@echo "✓ All builds complete!"
	@echo "  Docker image: $(IMAGE_NAME)"
	@echo "  Vite bundle: dist/"
	@echo "  GitHub Pages: index.html"

build-debug: ## Build all three (dist, gh-pages, docker) with debug screens enabled
	@echo "Building with debug screens enabled..."
	@echo "[1/3] Vite dist..."
	npm run build
	@echo "[2/3] GitHub Pages..."
	npm run build:gh-pages
	@echo "[3/3] Docker image..."
	docker build --build-arg DISABLE_DEBUG=0 -t $(IMAGE_NAME) .
	@echo ""
	@echo "✓ build-debug complete: dist/, index.html, $(IMAGE_NAME)"
