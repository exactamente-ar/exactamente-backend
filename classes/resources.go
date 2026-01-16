package classes

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
)

type Resource struct {
	ID   string `json:"_id,omitempty" bson:"_id,omitempty"`
	Name string `json:"name" bson:"name"`
	Type string `json:"type" bson:"type"`
	URL  string `json:"url" bson:"url"`
}

func (r *Resource) FillData(data bson.M, context *DataContext) error {
	// This is the base case of the recursion.
	// It only needs to parse its own simple fields.
	// The context parameter is present to satisfy the ClassMaster interface.
	if id, ok := data["_id"].(primitive.ObjectID); ok {
		r.ID = id.Hex()
	}
	if name, ok := data["name"].(string); ok {
		r.Name = name
	}
	if typeVal, ok := data["type"].(string); ok {
		r.Type = typeVal
	}
	if url, ok := data["url"].(string); ok {
		r.URL = url
	}
	return nil
}

// SearchByPath for a Resource. Since it's the last element in the chain,
// it doesn't search further. It returns its own data. Any further path
// is considered a "not found" error.
func (r *Resource) SearchByPath(path []string) gin.HandlerFunc {
	if len(path) == 0 || path[0] == "" {
		return func(c *gin.Context) {
			c.JSON(http.StatusOK, r)
		}
	}

	return func(c *gin.Context) {
		c.JSON(http.StatusNotFound, gin.H{"error": "Cannot search beyond a resource"})
	}
}
