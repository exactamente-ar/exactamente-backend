package handlers

import (
	"fmt"

	"github.com/gin-gonic/gin"
)

func RouterHandlers() {
	errCh := make(chan error, 2)

	// Lanzar Servidor Principal
	go func() {
		r := gin.Default()
		SetupMainRoutes(r)
		fmt.Println("🌐 Apollo Wiki corriendo en :8080")
		errCh <- r.Run(":8080")
	}()

	// Lanzar Servidor de Administración
	go func() {
		r := gin.Default()
		SetupAdminRoutes(r)
		fmt.Println("⚙️ Apollo Admin corriendo en :8081")
		errCh <- r.Run(":8081")
	}()

	// Bloqueante: Si cualquiera de los dos falla, el programa termina y avisa
	if err := <-errCh; err != nil {
		fmt.Printf("❌ Error crítico en el backend: %v\n", err)
	}
}
