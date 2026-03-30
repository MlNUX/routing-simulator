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
	npm run dev -- --host

test:
	# run vitest in watch mode
	npm run test

test-run:
	# run vitest once
	npm run test:run

test-ui:
	# run vitest UI
	npm run test:ui
	
docu:
	# generate docs from component comments + start local docs site
	# install dependencies if missing
	if [ ! -d "node_modules" ]; then npm install --legacy-peer-deps; fi
	npm run docs:dev

clean-install:
	# remove all deps and reinstall cleanly
	rm -rf node_modules package-lock.json
	npm install --legacy-peer-deps
