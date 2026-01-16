package handlers

import (

	"github.com/gin-gonic/gin"
)

func SetupAdminRoutes(r *gin.Engine) {
	insertAdminRoutes(r.Group("/admin")) // admin only becos i don't no what else to put here
}

func insertAdminRoutes(r *gin.RouterGroup) {
	// rest of the code remains unchanged
}
