package classes

import (
	"fmt"
	"net/http"

	"github.com/gin-gonic/gin"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
)

type Lecture struct {
	ID        string               `json:"_id,omitempty" bson:"_id,omitempty"`
	Name      string               `json:"name" bson:"name"`
	Pathname  string               `json:"pathname" bson:"pathname"`
	Resources map[string]*Resource `json:"resources,omitempty" bson:"resources,omitempty"`
}

func (l *Lecture) FillData(data bson.M, context *DataContext) error {
	// 1. Parse simple fields
	if id, ok := data["_id"].(primitive.ObjectID); ok {
		l.ID = id.Hex()
	}
	if name, ok := data["name"].(string); ok {
		l.Name = name
	}
	if pathname, ok := data["pathname"].(string); ok {
		l.Pathname = pathname
	}

	// 2. Initialize map
	l.Resources = make(map[string]*Resource)

	// 3. Look for array of resource IDs
	if resourceRefs, ok := data["resources"].(bson.A); ok {
		for _, ref := range resourceRefs {
			if resourceID, ok := ref.(primitive.ObjectID); ok {
				// 4. Look up in cache
				if resourceDoc, found := context.Resources[resourceID]; found {

					newResource := &Resource{}
					// 5. Recursive call
					if err := newResource.FillData(resourceDoc, context); err != nil {
						fmt.Printf("error filling resource %s: %v\n", resourceID.Hex(), err)
						continue
					}

					// 6. Add to map
					// Resources don't have a Pathname, so we use their ID as the key.
					l.Resources[newResource.ID] = newResource
				}
			}
		}
	}
	return nil
}

func (l *Lecture) SearchByPath(path []string) gin.HandlerFunc {
	if len(path) == 0 || path[0] == "" {
		return func(c *gin.Context) {
			c.JSON(http.StatusOK, gin.H{
				"name":    l.Name,
				"faculty": l.Resources, // This will be 'resources' in JSON
			})
		}
	}

	resourceKey := path[0]
	resource, ok := l.Resources[resourceKey]

	if !ok {
		return func(c *gin.Context) {
			c.JSON(http.StatusNotFound, gin.H{"error": fmt.Sprintf("Resource '%s' not found", resourceKey)})
		}
	}

	return resource.SearchByPath(path[1:])
}
