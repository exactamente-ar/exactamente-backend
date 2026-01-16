package handlers

import (
	"strings"

	"github.com/exactamente-backend/classes"
	"github.com/gin-gonic/gin"
)

func SetupMainRoutes(r *gin.Engine) {
	// different routes for main service
	r.GET("/", func(ctx *gin.Context) {
		ctx.JSON(200, gin.H{"message": classes.Data.University})
	})
	mainService(r.Group("/api"))
}

func mainService(r *gin.RouterGroup) {
	r.Any("/*path", func(c *gin.Context) {
		aux := strings.TrimPrefix(c.Param("path"), "/") // this because split recognizes the first / as an empty string
		path := strings.Split(aux, "/")

		// We use the initialized Data structure as the entry point.
		if classes.Data == nil {
			// This case happens if InitData() was not called.
			c.JSON(500, gin.H{"error": "Data structure not initialized"})
			return
		}
		classes.Data.SearchByPath(path)(c)
	})
}
