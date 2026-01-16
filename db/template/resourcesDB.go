package template

import (
	"context"
	"log"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

func CollectionResource(db *mongo.Database) {
	ctx := context.TODO()

	jsonSchema := bson.M{
		"bsonType": "object",
		"required": []string{"name", "type", "url"},
		"properties": bson.M{
			"_id": bson.M{
				"bsonType": "objectId",
			},
			"name": bson.M{
				"bsonType":    "string",
				"description": "must be a string and is required",
			},
			"type": bson.M{
				"bsonType":    "string",
				"description": "must be a string and is required",
			},
			"url": bson.M{
				"bsonType":    "string",
				"description": "must be a string and is required",
			},
		},
	}

	opts := options.CreateCollection().SetValidator(bson.M{"$jsonSchema": jsonSchema})

	err := db.CreateCollection(ctx, "resources", opts)
	if err != nil {
		log.Println("Collection 'resources' already exists.")
		return
	}
	log.Println("Collection 'resource' created correctly")
}
