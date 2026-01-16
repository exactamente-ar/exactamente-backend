package main

import (
	"github.com/exactamente-backend/cmd/setup"
	"github.com/exactamente-backend/handlers"
)

// only for call external function for session initialization
func main() {
	// setup initialization of all mechanism
	setup.Setup()

	// handle routes and servers
	handlers.RouterHandlers()
}
