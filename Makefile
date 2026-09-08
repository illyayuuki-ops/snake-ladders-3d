.PHONY: help run-local run-docker build-backend smoke

help:
	@echo "Snakes & Ladders 3D — Makefile targets"
	@echo ""
	@echo "  make run-local    Start backend (Maven) + frontend (Python HTTP server)"
	@echo "  make run-docker   docker-compose up --build"
	@echo "  make build-backend mvn -f backend clean package -DskipTests"
	@echo "  make smoke        Run health checks against local services"

run-local:
	@echo "[1/2] Starting backend on :8080 ..."
	@cd backend && start "backend" cmd /c "mvn spring-boot:run"
	@timeout /t 5 /nobreak >nul
	@echo "[2/2] Starting frontend on :8000 ..."
	@cd frontend && start "frontend" cmd /c "python -m http.server 8000"
	@echo "Open http://localhost:8000"

run-docker:
	docker-compose up --build

build-backend:
	mvn -f backend clean package -DskipTests

smoke:
	@echo "Checking backend health ..."
	curl -sSf http://localhost:8080/actuator/health || (echo "Backend not reachable on :8080" && exit 1)
	@echo "Checking frontend ..."
	curl -sSf http://localhost:8000/index.html || (echo "Frontend not reachable on :8000" && exit 1)
	@echo "Smoke checks passed."
