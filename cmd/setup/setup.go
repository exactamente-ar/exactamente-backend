package setup

import "github.com/exactamente-backend/db"

// part to check all issues with imports and cyclic dependencies and report them before they happen
func Setup() { // TODO an custom error logger report
	// open database connection
	DB, close := db.DBConnection()
	defer close() // close database connection in the end of the program

	// initialize collections
	db.InitCollections(DB)

	// load initial data from database
	FillDataDB(DB)

}
