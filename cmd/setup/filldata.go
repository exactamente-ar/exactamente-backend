package setup

import (
	"context"
	"log"

	"github.com/exactamente-backend/classes"
	"github.com/exactamente-backend/db"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
)

// FillDataDB connects to MongoDB, pre-caches all secondary collections into memory,
// fetches University data, and uses the recursive FillData methods with the cached
// context to populate the global classes.Data pointer.
func FillDataDB(database *mongo.Database) {
	log.Println("Starting data loading process with in-memory caching strategy...")

	// Step 1: Cache the secondary collections using the new centralized function.
	facultiesCache, err := db.CacheCollection(database, "faculty")
	if err != nil {
		log.Fatalf("Failed to cache 'faculty' collection: %v", err)
	}
	log.Printf("Cached %d documents from 'faculty'", len(facultiesCache))

	lecturesCache, err := db.CacheCollection(database, "lectures")
	if err != nil {
		log.Fatalf("Failed to cache 'lectures' collection: %v", err)
	}
	log.Printf("Cached %d documents from 'lectures'", len(lecturesCache))

	resourcesCache, err := db.CacheCollection(database, "resources")
	if err != nil {
		log.Fatalf("Failed to cache 'resources' collection: %v", err)
	}
	log.Printf("Cached %d documents from 'resources'", len(resourcesCache))

	// Step 2: Create the DataContext to pass the caches around.
	dataContext := &classes.DataContext{
		Faculties: facultiesCache,
		Lectures:  lecturesCache,
		Resources: resourcesCache,
	}

	// Step 3: Initialize the root pointer.
	classes.Data = &classes.Pointer{
		University: make(map[string]*classes.University),
	}

	// Step 4: Iterate over the primary collection (University) and build the data structure.
	collection := database.Collection("University") // TODO change to be defined in .env
	cursor, err := collection.Find(context.TODO(), bson.D{})
	if err != nil {
		log.Fatalf("Failed to find University in DB: %v", err)
	}
	defer cursor.Close(context.TODO())

	for cursor.Next(context.TODO()) {
		var UniversityRaw bson.M
		if err := cursor.Decode(&UniversityRaw); err != nil {
			log.Printf("Warning: failed to decode a University document: %v", err)
			continue
		}

		// Call FillData with the document and the context containing all cached data.
		if err := classes.Data.FillData(UniversityRaw, dataContext); err != nil {
			log.Printf("Warning: %v", err)
			continue
		}
	}

	if err := cursor.Err(); err != nil {
		log.Fatalf("Cursor error after iteration: %v", err)
	}

	log.Println("Successfully loaded and structured all data from DB into classes.Data.")
}
