package db

import (
	"context"
	"log"
	"os"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"

	"github.com/exactamente-backend/db/template"
)

func ConnectToMongo() (*mongo.Client, error) {
	// MongoDb connection string or the correct url for the database
	clientOptions := options.Client().ApplyURI("mongodb://localhost:27017") // TODO change to be defined in .env

	// getting username and password from .env if not found use defaults
	USERNAME := os.Getenv("MONGO_DB_USERNAME")
	if USERNAME == "" {
		USERNAME = "admin" // Default username
	}
	PASSWORD := os.Getenv("MONGO_DB_PASSWORD")
	if PASSWORD == "" {
		PASSWORD = "password" // Default password
	}

	clientOptions.SetAuth(options.Credential{
		Username: USERNAME,
		Password: PASSWORD,
	})

	client, err := mongo.Connect(context.Background(), clientOptions)
	if err != nil {
		return nil, err
	}

	log.Println("Connected to mongo...")
	check := client.Ping(context.Background(), nil)
	if check != nil {
		log.Fatalf("failed to ping mongo: %v", check) // Use log.Fatalf for critical errors
	}

	return client, nil
}

func InitCollections(db *mongo.Database) {
	template.CollectionUniversity(db)
	template.CollectionFaculty(db)
	template.CollectionLecture(db)
	template.CollectionResource(db)
}

func DBConnection() (*mongo.Database, func()) {
	mongoClient, err := ConnectToMongo()
	if err != nil {
		log.Panicf("failed to connect to mongo: %v", err)
	}

	dbName := os.Getenv("MONGO_DB_NAME")
	if dbName == "" {
		dbName = "exactamente" // Default name
	}

	db := mongoClient.Database(dbName)

	// The cleanup function will be called by the caller, usually in a defer statement in main.
	cleanup := func() {
		ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
		defer cancel()
		log.Println("Closing mongo connection...")
		if err := mongoClient.Disconnect(ctx); err != nil {
			log.Fatalf("failed to disconnect from mongo: %v", err)
		}
	}

	return db, cleanup
}

// CacheCollection fetches all documents from a given collection and stores them in a map,
// keyed by their `_id`. This creates an in-memory cache for fast lookups.
func CacheCollection(db *mongo.Database, collectionName string) (map[primitive.ObjectID]bson.M, error) {
	cache := make(map[primitive.ObjectID]bson.M)
	cursor, err := db.Collection(collectionName).Find(context.TODO(), bson.D{})
	if err != nil {
		return nil, err
	}
	defer cursor.Close(context.TODO())

	for cursor.Next(context.TODO()) {
		var doc bson.M
		if err := cursor.Decode(&doc); err != nil {
			log.Printf("Warning: failed to decode a document from '%s': %v", collectionName, err)
			continue
		}
		id, ok := doc["_id"].(primitive.ObjectID)
		if !ok {
			log.Printf("Warning: document in '%s' is missing or has invalid _id", collectionName)
			continue
		}
		cache[id] = doc
	}
	return cache, cursor.Err()
}
