# ---------- Config ----------
IMAGE_NAME=routing-simulator
CONTAINER_NAME=routing-simulator-container
HOST_PORT=8080
CONTAINER_PORT=80

# ---------- Docker workflow ----------

dockerbuild:
	docker build -t $(IMAGE_NAME) .

dockerrun:
	# stop and remove any previous container
	-docker stop $(CONTAINER_NAME)
	-docker rm $(CONTAINER_NAME)
	# run new container
	docker run -d --name $(CONTAINER_NAME) -p $(HOST_PORT):$(CONTAINER_PORT) $(IMAGE_NAME)
	@echo "Docker container running at http://localhost:$(HOST_PORT)"

dockerstop:
	-docker stop $(CONTAINER_NAME)
	-docker rm $(CONTAINER_NAME)

# ---------- Local development ----------
run:
	# install dependencies if missing
	if [ ! -d "node_modules" ]; then npm ci; fi
	# start Vite dev server
	npm run dev

