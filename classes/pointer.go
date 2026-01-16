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

// DataContext holds all the secondary collections cached in memory for fast lookups.
type DataContext struct {
	Faculties map[primitive.ObjectID]bson.M
	Lectures  map[primitive.ObjectID]bson.M
	Resources map[primitive.ObjectID]bson.M
}

var extraFunctionP map[string]func() gin.HandlerFunc

func init() { // initialize the extra functions map automatically
	extraFunctionP = map[string]func() gin.HandlerFunc{ // add the extra functions here with their keys
		"create": func() gin.HandlerFunc { return CreateUniversity() },
	}
}

// Pointer is the root of the data structure, holding all University.
type Pointer struct {
	University map[string]*University `json:"University" , bson:"University"`
}

// Data is the global, initialized instance of our data structure.
var Data *Pointer

func (p *Pointer) FillData(UniversityRaw bson.M, context *DataContext) error {
	// The key for the map is the University's pathname.
	pathname, ok := UniversityRaw["pathname"].(string) // may can change in the future the wey to check
	if !ok || pathname == "" {
		return fmt.Errorf("University document has an invalid or empty 'pathname' field")
	}

	// Create a new University instance and fill it with data.
	// The FillData method will recursively handle faculties, lectures, etc. using the context.
	newUniversity := &University{}
	if err := newUniversity.FillData(UniversityRaw, context); err != nil {
		return fmt.Errorf("failed to fill data for University '%s': \"%w\"", pathname, err)
	}

	// Check for duplicate pathNames and append a number if necessary.
	originalPathname := pathname // this method can be dismiss but correct an error
	counter := 2
	_, exists := p.University[pathname]
	for exists {
		pathname = fmt.Sprintf("%s-%d", originalPathname, counter)
		_, exists = p.University[pathname]
		counter++
	}

	// Add the fully populated University to the pointer's University map.
	p.University[pathname] = newUniversity
	return nil
}

// SearchByPath is the entry point for the search. It starts the search from the root pointer.
func (p *Pointer) SearchByPath(path []string) gin.HandlerFunc {
	if len(path) == 0 || path[0] == "" {
		return func(c *gin.Context) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Path is empty"})
		}
	}

	// The first part of the path is the key for the University.
	Key := path[0]
	var OK bool
	University, OK := p.University[Key]

	if OK {
		return University.SearchByPath(path[1:])
	}

	// Delegate the rest of the path to the found object.
	extraFunction, OK := extraFunctionP[Key]

	if OK {
		return extraFunction()
	}

	return func(c *gin.Context) {
		c.JSON(http.StatusNotFound, gin.H{"error": fmt.Sprintf("University '%s' not found", Key)})
	}
}

func CreateUniversity() gin.HandlerFunc {
	return func(c *gin.Context) {
		var newUniversityData bson.M
		if err := c.ShouldBindJSON(&newUniversityData); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body: " + err.Error()})
			return
		}

		pathname, ok := newUniversityData["pathname"].(string)
		if !ok || pathname == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Missing or invalid required field: pathname"})
			return
		}

		// Check for existence without explicit concurrency control for now, as per instruction
		_, exists := Data.University[pathname]
		if exists {
			c.JSON(http.StatusConflict, gin.H{"error": fmt.Sprintf("University with pathname '%s' already exists", pathname)})
			return
		}

		DB, cleanup := db.DBConnection()
		defer cleanup()

		if DB == nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Database connection not initialized"})
			return
		}

		// Call the centralized DB operation function
		// For creating a University, the parent is 'nil'.
		createdDoc, err := db.CreateChildAndLink("", nil, newUniversityData, "University")
		if err != nil {
			log.Printf("Failed to create university in database: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create university in database: " + err.Error()})
			return
		}

		// Create the Go struct instance from the data returned by the DB layer
		newUniversity := &University{}
		// We use an empty DataContext because a new university has no children to look up yet.
		if err := newUniversity.FillData(createdDoc, &DataContext{}); err != nil {
			log.Printf("DB insert succeeded, but failed to create in-memory instance: %v", err)
			// This case is critical: the data is in the DB but not in memory. Requires careful handling.
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update in-memory data for new University"})
			return
		}

		// Add the new university to the global Data map
		Data.University[newUniversity.Pathname] = newUniversity

		log.Printf("University '%s' created and loaded in memory.", newUniversity.Pathname)

		c.JSON(http.StatusCreated, gin.H{
			"message":      "University created successfully and loaded in memory",
			"universityId": newUniversity.ID,
			"pathName":     newUniversity.Pathname,
		})
	}
}
