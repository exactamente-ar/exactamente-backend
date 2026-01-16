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

// the multi Functions for university
var extraFunctionU map[string]func(*University) gin.HandlerFunc

func init() { // initialize the extra functions map automatically
	extraFunctionU = map[string]func(*University) gin.HandlerFunc{ // add the extra functions here with their keys
		"create": CreateFaculty,
	}
}

type University struct {
	ID       string              `json:"_id" bson:"_id"`
	Name     string              `json:"name" bson:"name"`
	Pathname string              `json:"pathname" bson:"pathname"`
	Faculty  map[string]*Faculty `json:"faculty,omitempty" bson:"faculty,omitempty"`
}

func (u *University) FillData(data bson.M, context *DataContext) error {
	// 1. Parse simple fields from the university document itself.
	if id, ok := data["_id"].(primitive.ObjectID); ok {
		u.ID = id.Hex()
	}
	if name, ok := data["name"].(string); ok {
		u.Name = name
	}
	if pathname, ok := data["pathname"].(string); ok {
		u.Pathname = pathname
	}

	// 2. Initialize the Faculty map. This is crucial.
	u.Faculty = make(map[string]*Faculty)

	// 3. Look for the array of faculty IDs in the BSON data.
	if facultyRefs, ok := data["faculty"].(bson.A); ok {
		// 4. Iterate over the array of references (ObjectIDs).
		for _, ref := range facultyRefs {
			if facultyID, ok := ref.(primitive.ObjectID); ok {
				// 5. Look up the full faculty document in our cached context.
				if facultyDoc, found := context.Faculties[facultyID]; found {

					newFaculty := &Faculty{}
					// 6. Recursively call FillData for the faculty.
					if err := newFaculty.FillData(facultyDoc, context); err != nil {
						// Log the error but continue, so one bad faculty doesn't stop everything.
						fmt.Printf("error filling faculty %s: %v\n", facultyID.Hex(), err)
						continue
					}

					// 7. Add the populated faculty to the map.
					u.Faculty[newFaculty.Pathname] = newFaculty
				}
			}
		}
	}

	return nil
}

// SearchByPath for a University handles the next path segment.
func (u *University) SearchByPath(path []string) gin.HandlerFunc { // Method receiver updated
	// If there are no more path segments, we are at the University level.
	if len(path) == 0 || path[0] == "" {
		return func(c *gin.Context) {
			c.JSON(http.StatusOK, gin.H{
				"name":    u.Name,
				"faculty": u.Faculty,
			})
		}
	}

	// The first part of the path is the key for the faculty.
	Key := path[0]
	var OK bool
	faculty, OK := u.Faculty[Key]
	if OK {
		return faculty.SearchByPath(path[1:])
	}

	// Delegate the rest of the path to the found object.
	extraFunction, OK := extraFunctionU[Key]
	if OK {
		return extraFunction(u)
	}

	return func(c *gin.Context) {
		c.JSON(http.StatusNotFound, gin.H{"error": fmt.Sprintf("faculty '%s' not found", Key)})
	}
}

func CreateFaculty(u *University) gin.HandlerFunc {
	return func(c *gin.Context) {
		var newFacultyData bson.M
		if err := c.ShouldBindJSON(&newFacultyData); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body: " + err.Error()})
			return
		}

		pathname, ok := newFacultyData["pathname"].(string)
		if !ok || pathname == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Missing or invalid required field: pathname"})
			return
		}

		if _, exists := u.Faculty[pathname]; exists {
			c.JSON(http.StatusConflict, gin.H{"error": fmt.Sprintf("Faculty with pathname '%s' already exists in this university", pathname)})
			return
		}

		createdDoc, err := db.CreateChildAndLink(u.ID, u, newFacultyData, "faculty")
		if err != nil {
			log.Printf("Failed to create faculty in database: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create faculty in database: " + err.Error()})
			return
		}

		newFaculty := &Faculty{}
		if err := newFaculty.FillData(createdDoc, &DataContext{}); err != nil {
			log.Printf("DB insert succeeded, but failed to create in-memory instance for faculty: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update in-memory data for new faculty"})
			return
		}

		u.Faculty[newFaculty.Pathname] = newFaculty

		log.Printf("Faculty '%s' created and loaded in memory.", newFaculty.Pathname)

		c.JSON(http.StatusCreated, gin.H{
			"message":    "Faculty created successfully and loaded in memory",
			"facultyId":  newFaculty.ID,
			"pathName":   newFaculty.Pathname,
			"university": u.Name,
		})
	}
}
