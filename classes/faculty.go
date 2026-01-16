package classes

import (
	"fmt"
	"log"
	"net/http"

	"github.com/exactamente-backend/db"

	"github.com/gin-gonic/gin"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
)

var extraFunctionF map[string]func(*Faculty) gin.HandlerFunc

func init() {
	extraFunctionF = map[string]func(*Faculty) gin.HandlerFunc{
		"create": CreateLecture,
	}
}

type Faculty struct {
	ID       string `json:"_id,omitempty" bson:"_id,omitempty"`
	Name     string `json:"name" bson:"name"`
	Pathname string `json:"pathname" bson:"pathname"`

	Lectures map[string]*Lecture `json:"lectures,omitempty" bson:"lectures,omitempty"`
}

func (f *Faculty) FillData(data bson.M, context *DataContext) error {
	// 1. Parse simple fields
	if id, ok := data["_id"].(primitive.ObjectID); ok {
		f.ID = id.Hex()
	}
	if name, ok := data["name"].(string); ok {
		f.Name = name
	}
	if pathname, ok := data["pathname"].(string); ok {
		f.Pathname = pathname
	}

	// 2. Initialize map
	f.Lectures = make(map[string]*Lecture)

	// 3. Look for array of lecture IDs
	if lectureRefs, ok := data["lectures"].(bson.A); ok {
		for _, ref := range lectureRefs {
			if lectureID, ok := ref.(primitive.ObjectID); ok {
				// 4. Look up in cache
				if lectureDoc, found := context.Lectures[lectureID]; found {

					newLecture := &Lecture{}
					// 5. Recursive call
					if err := newLecture.FillData(lectureDoc, context); err != nil {
						fmt.Printf("error filling lecture %s: %v\n", lectureID.Hex(), err)
						continue
					}

					// 6. Add to map
					f.Lectures[newLecture.Pathname] = newLecture
				}
			}
		}
	}
	return nil
}

func (f *Faculty) SearchByPath(path []string) gin.HandlerFunc {
	if len(path) == 0 || path[0] == "" {
		return func(c *gin.Context) {
			c.JSON(http.StatusOK, gin.H{
				"name":     f.Name,
				"lectures": f.Lectures,
			})
		}
	}

	lectureKey := path[0]

	lecture, ok := f.Lectures[lectureKey]
	if ok {
		return lecture.SearchByPath(path[1:])
	}

	extraFunction, ok := extraFunctionF[lectureKey]
	if ok {
		return extraFunction(f)
	}

	return func(c *gin.Context) {
		c.JSON(http.StatusNotFound, gin.H{"error": fmt.Sprintf("Lecture '%s' not found", lectureKey)})
	}
}

func CreateLecture(f *Faculty) gin.HandlerFunc {
	return func(c *gin.Context) {
		var newLectureData bson.M
		if err := c.ShouldBindJSON(&newLectureData); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body: " + err.Error()})
			return
		}

		pathname, ok := newLectureData["pathname"].(string)
		if !ok || pathname == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Missing or invalid required field: pathname"})
			return
		}

		if _, exists := f.Lectures[pathname]; exists {
			c.JSON(http.StatusConflict, gin.H{"error": fmt.Sprintf("Lecture with pathname '%s' already exists in this faculty", pathname)})
			return
		}

		createdDoc, err := db.CreateChildAndLink(f.ID, f, newLectureData, "lectures")
		if err != nil {
			log.Printf("Failed to create lecture in database: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create lecture in database: " + err.Error()})
			return
		}

		newLecture := &Lecture{}
		if err := newLecture.FillData(createdDoc, &DataContext{}); err != nil {
			log.Printf("DB insert succeeded, but failed to create in-memory instance for lecture: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update in-memory data for new lecture"})
			return
		}

		f.Lectures[newLecture.Pathname] = newLecture

		log.Printf("Lecture '%s' created and loaded in memory.", newLecture.Pathname)

		c.JSON(http.StatusCreated, gin.H{
			"message":   "Lecture created successfully and loaded in memory",
			"lectureId": newLecture.ID,
			"pathName":  newLecture.Pathname,
			"faculty":   f.Name,
		})
	}
}
