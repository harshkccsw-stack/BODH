package main

import (
	"fmt"
	"log"
	"net/http"

	"github.com/go-chi/chi/v5"
	chimiddleware "github.com/go-chi/chi/v5/middleware"

	"github.com/go-chi/cors"

	"github.com/bodh-psychometric/bodhassess-api/internal/config"
	"github.com/bodh-psychometric/bodhassess-api/internal/database"
	"github.com/bodh-psychometric/bodhassess-api/internal/handlers"
)

func main() {
	cfg := config.Load()
	db := database.NewPostgresPool(cfg.DatabaseURL())
	defer db.Close()

	r := chi.NewRouter()

	// Middleware
	r.Use(chimiddleware.Logger)
	r.Use(chimiddleware.Recoverer)
	r.Use(chimiddleware.RequestID)
	r.Use(chimiddleware.RealIP)
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   []string{"http://localhost:3000", "http://localhost:3001"},
		AllowedMethods:   []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type", "X-Tenant-ID"},
		ExposedHeaders:   []string{"Link"},
		AllowCredentials: true,
		MaxAge:           300,
	}))

	// Handlers
	healthH := handlers.NewHealthHandler(db)
	questionnairesCatalogH := handlers.NewQuestionnairesCatalogHandler(db)
	sessionsH := handlers.NewSessionsHandler(db)
	itemsH := handlers.NewItemsHandler(db)
<<<<<<< HEAD
	takeH := handlers.NewSessionsTakeHandler(db)
	reportsH := handlers.NewReportsHandler(db)
	analyticsH := handlers.NewAnalyticsHandler(db)
	surveysH := handlers.NewSurveysHandler(db)
	adminH := handlers.NewAdminHandler(db)
=======
	uploadH := handlers.NewUploadHandler("./uploads", "http://localhost:"+cfg.AppPort)
	qualitiesH := handlers.NewQualitiesHandler(db)
	verticalsH := handlers.NewVerticalsHandler(db)
	respondentsH := handlers.NewRespondentsHandler(db)
	practitionersH := handlers.NewPractitionersHandler(db)
	groupsH := handlers.NewGroupsHandler(db)
	assessmentsH := handlers.NewAssessmentsHandler(db)
	questionnairesH := handlers.NewQuestionnairesHandler(db)
	itemDisplayH := handlers.NewItemDisplayHandler(db)
	demoFieldsH := handlers.NewDemographicFieldsHandler(db)

	// Static files for uploaded media
	fileServer := http.FileServer(http.Dir("./uploads"))
	r.Handle("/uploads/*", http.StripPrefix("/uploads/", fileServer))
>>>>>>> 8390f94fe2e576279e937e9972afbf6bff638992

	// Routes
	r.Route("/api/v1", func(r chi.Router) {
		r.Get("/health", healthH.Check)

		r.Post("/upload", uploadH.Upload)

		r.Route("/questionnaires-catalog", func(r chi.Router) {
			r.Get("/", questionnairesCatalogH.List)
			r.Post("/", itemsH.CreateInstrument)
			r.Get("/{id}", questionnairesCatalogH.GetByID)
			r.Get("/{instrumentId}/items", itemsH.ListByInstrument)
			r.Post("/{instrumentId}/items", itemsH.CreateItem)
			r.Post("/{instrumentId}/items/bulk", itemsH.BulkCreateItems)
		})

		r.Route("/sessions", func(r chi.Router) {
			r.Get("/", sessionsH.List)
			r.Post("/", sessionsH.Create)
			r.Get("/{id}", sessionsH.GetByID)
			r.Get("/{id}/items", takeH.GetItems)
			r.Post("/{id}/start", takeH.Start)
			r.Post("/{id}/responses", takeH.SaveResponse)
			r.Post("/{id}/complete", takeH.Complete)
		})

		r.Route("/reports", func(r chi.Router) {
			r.Get("/", reportsH.List)
			r.Post("/generate", reportsH.GenerateFromSession)
			r.Get("/{id}", reportsH.GetByID)
		})

		r.Route("/analytics", func(r chi.Router) {
			r.Get("/overview", analyticsH.Overview)
			r.Get("/sessions-by-vertical", analyticsH.SessionsByVertical)
			r.Get("/sessions-timeseries", analyticsH.SessionsTimeSeries)
		})

		r.Route("/surveys", func(r chi.Router) {
			r.Get("/", surveysH.List)
			r.Post("/", surveysH.Create)
			r.Get("/{id}", surveysH.GetByID)
			r.Post("/{id}/publish", surveysH.Publish)
			r.Post("/{id}/responses", surveysH.SubmitResponse)
			r.Get("/{id}/responses", surveysH.ListResponses)
		})

		r.Route("/admin", func(r chi.Router) {
			r.Get("/practitioners", adminH.ListPractitioners)
			r.Post("/practitioners", adminH.CreatePractitioner)
			r.Get("/respondents", adminH.ListRespondents)
			r.Post("/respondents", adminH.CreateRespondent)
			r.Post("/users/{id}/set-active", adminH.SetActive)
		})

		r.Route("/qualities", func(r chi.Router) {
			r.Get("/", qualitiesH.List)
			r.Post("/", qualitiesH.Create)
			r.Get("/{id}", qualitiesH.Get)
			r.Put("/{id}", qualitiesH.Update)
			r.Delete("/{id}", qualitiesH.Delete)
		})

		r.Route("/verticals", func(r chi.Router) {
			r.Get("/", verticalsH.List)
			r.Post("/", verticalsH.Create)
			r.Get("/{id}", verticalsH.Get)
			r.Delete("/{id}", verticalsH.Delete)
		})

		r.Route("/respondents", func(r chi.Router) {
			r.Get("/", respondentsH.List)
			r.Post("/", respondentsH.Create)
			r.Post("/login", respondentsH.Login)
			r.Post("/logout", respondentsH.Logout)
			r.Get("/me", respondentsH.Me)
			r.Get("/{id}", respondentsH.Get)
			r.Put("/{id}", respondentsH.Update)
			r.Delete("/{id}", respondentsH.Delete)
		})

		r.Route("/practitioners", func(r chi.Router) {
			r.Get("/", practitionersH.List)
			r.Post("/", practitionersH.Create)
			r.Get("/{id}", practitionersH.Get)
			r.Put("/{id}", practitionersH.Update)
			r.Delete("/{id}", practitionersH.Delete)
		})

		r.Route("/groups", func(r chi.Router) {
			r.Get("/", groupsH.List)
			r.Post("/", groupsH.Create)
			r.Get("/{id}", groupsH.Get)
			r.Put("/{id}", groupsH.Update)
			r.Delete("/{id}", groupsH.Delete)
		})

		r.Route("/assessments", func(r chi.Router) {
			r.Get("/", assessmentsH.List)
			r.Post("/", assessmentsH.Create)
			r.Post("/bulk", assessmentsH.BulkCreate)
			r.Get("/{id}", assessmentsH.Get)
			r.Put("/{id}", assessmentsH.Update)
			r.Delete("/{id}", assessmentsH.Delete)
		})

		r.Route("/questionnaires", func(r chi.Router) {
			r.Get("/", questionnairesH.List)
			r.Post("/", questionnairesH.Upsert)
			r.Get("/by-name", questionnairesH.GetByName)
			r.Get("/{id}", questionnairesH.Get)
			r.Delete("/{id}", questionnairesH.Delete)
		})

		r.Route("/item-display", func(r chi.Router) {
			r.Get("/", itemDisplayH.List)
			r.Post("/override", itemDisplayH.UpsertOverride)
			r.Post("/{id}/delete", itemDisplayH.MarkDeleted)
			r.Delete("/{id}", itemDisplayH.Clear)
		})

		r.Route("/demographic-fields", func(r chi.Router) {
			r.Get("/", demoFieldsH.List)
			r.Post("/", demoFieldsH.Upsert)
			r.Delete("/{id}", demoFieldsH.Delete)
		})
	})

	addr := ":" + cfg.AppPort
	fmt.Printf("\n  BodhAssess API v1.0.0\n")
	fmt.Printf("  Environment: %s\n", cfg.AppEnv)
	fmt.Printf("  Listening:   http://localhost%s\n", addr)
	fmt.Printf("  Health:      http://localhost%s/api/v1/health\n\n", addr)

	log.Fatal(http.ListenAndServe(addr, r))
}
