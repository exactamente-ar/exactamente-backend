package db

import (
	"context"
	"fmt"
	"log"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
)

// CreateChildAndLink se encarga de crear un nuevo documento hijo y, opcionalmente,
// vincularlo a un documento padre mediante su ObjectID.
// NOTE: Las operaciones de inserción y actualización no son atómicas para mantener
// la compatibilidad con instancias standalone de MongoDB. Para atomicidad, se requeriría
// un replica set y la reintroducción de transacciones.
//
// Parameters:
//
//	db: La conexión a la base de datos.
//	parent: La instancia del struct padre en memoria (ej: *classes.University).
//	        Si es nil, significa que el documento a crear no tiene un padre directo (ej: una University).
//	childData: Los datos del nuevo documento hijo, recibidos del cuerpo de la petición.
//	childCollectionName: El nombre de la colección donde se insertará el hijo (ej: "lectures").
//
// Returns:
//
//	bson.M: El documento hijo creado, incluyendo su _id generado.
//	error: Un error si la operación falla.
func CreateChildAndLink(
	parentID string,
	parent interface{}, // Puede ser *classes.University, *classes.Faculty, etc., o nil para la raíz
	childData bson.M,
	childCollectionName string,
) (bson.M, error) {

	DB, cleanup := DBConnection()
	defer cleanup()

	if DB == nil {
		return nil, fmt.Errorf("error: Database connection not initialized")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	// Paso 1: Insertar el nuevo documento hijo.
	result, err := DB.Collection(childCollectionName).InsertOne(ctx, childData)
	if err != nil {
		return nil, fmt.Errorf("failed to insert new document into %s collection: %w", childCollectionName, err)
	}

	newObjectID, ok := result.InsertedID.(primitive.ObjectID)
	if !ok {
		return nil, fmt.Errorf("inserted ID is not an ObjectID")
	}

	// Actualizar el childData con el ID generado para el retorno.
	childData["_id"] = newObjectID

	// Paso 2: Si hay un padre, vincular el hijo a él.
	if parent != nil {
		var parentCollectionName string
		var parentIDField string = "_id"
		var parentLinkField string // El campo del padre donde se guarda el ID del hijo (ej: "faculty", "lectures")

		// FIX: Correctly determine parent collection and link field based on child collection
		switch childCollectionName {
		case "faculty": // Parent is University
			parentCollectionName = "University"
			parentLinkField = "faculty"
		case "lectures": // Parent is Faculty
			parentCollectionName = "faculty"
			parentLinkField = "lectures"
		case "resources": // Parent is Lecture
			parentCollectionName = "lectures"
			parentLinkField = "resources"
		default:
			return nil, fmt.Errorf("unsupported child collection for linking: %s", childCollectionName)
		}

		// FIX: Convert parentID string to ObjectID and use it
		parentObjectID, err := primitive.ObjectIDFromHex(parentID)
		if err != nil {
			return nil, fmt.Errorf("invalid parent ID: %w", err)
		}

		log.Printf("Linking new child %s to parent %s in collection %s", newObjectID.Hex(), parentObjectID.Hex(), parentCollectionName)

		// Ejecutar la actualización en el documento padre para añadir la referencia.
		// ADVERTENCIA: Esta operación no es atómica con la inserción anterior.
		_, err = DB.Collection(parentCollectionName).UpdateOne(
			ctx,
			bson.M{parentIDField: parentObjectID},
			bson.M{"$push": bson.M{parentLinkField: newObjectID}},
		)
		if err != nil {
			// En este punto, el documento hijo fue creado pero no pudo ser vinculado al padre.
			// Esto deja un documento "huérfano".
			log.Printf("CRITICAL: Child document %s was created but failed to link to parent %s: %v", newObjectID.Hex(), parentObjectID.Hex(), err)
			return nil, fmt.Errorf("failed to link child to parent document: %w", err)
		}
	}

	return childData, nil
}
