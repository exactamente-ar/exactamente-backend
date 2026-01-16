include .env
# make sure that you can create multiple conteiners, with one its enough, and meke sure that is on in docker
up:
	@echo "Ensuring no conflicting containers are running..."
	-@docker stop ${DB_CONTAINER_NAME} > /dev/null 2>&1
	@echo "Starting containers..."
	docker-compose up --build -d --remove-orphans

down:
	@echo "Stoping containers..."
	docker-compose down

build:
	go build -o ${BINARY} ./cmd/api/

start:
	@env MONGO_DB_USERNAME=${MONGO_DB_USERNAME} MONGO_DB_PASSWORD=${MONGO_DB_PASSWORD} MONGO_DB_NAME=${MONGO_DB_NAME} ./${BINARY} 

restart: build start 

format_all_code:
	go fmt ./...

# connection string for external tools like MongoDB Compass
# mongodb://admin:password@localhost:27017/exactamente?authSource=admin&readPreference=primary&appname=MongDB%20Compass&directConnection=true&ssl=false