package template

import (
	"context"
	"log"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

func CollectionLecture(db *mongo.Database) {
	ctx := context.TODO()

	jsonSchema := bson.M{
		"bsonType": "object",
		"required": []string{"name", "pathname"},
		"properties": bson.M{
			"_id": bson.M{
				"bsonType": "objectId",
			},
			"name": bson.M{
				"bsonType":    "string",
				"description": "must be a string and is required",
			},
			"pathname": bson.M{
				"bsonType":    "string",
				"description": "must be a string and is required",
			},
			"resources": bson.M{
				"bsonType": "array",
				"items": bson.M{
					"bsonType": "objectId",
				},
			},
		},
	}

	opts := options.CreateCollection().SetValidator(bson.M{"$jsonSchema": jsonSchema})

	err := db.CreateCollection(ctx, "lectures", opts)
	if err != nil {
		log.Println("Collection 'lectures' already exists.")
		return
	}
	log.Println("Collection 'lecture' created correctly")
}
