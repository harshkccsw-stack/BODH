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
	instrumentsH := handlers.NewInstrumentsHandler(db)
	sessionsH := handlers.NewSessionsHandler(db)
	itemsH := handlers.NewItemsHandler(db)
	takeH := handlers.NewSessionsTakeHandler(db)
	reportsH := handlers.NewReportsHandler(db)
	analyticsH := handlers.NewAnalyticsHandler(db)
	surveysH := handlers.NewSurveysHandler(db)
	adminH := handlers.NewAdminHandler(db)

	// Routes
	r.Route("/api/v1", func(r chi.Router) {
		r.Get("/health", healthH.Check)

		r.Route("/instruments", func(r chi.Router) {
			r.Get("/", instrumentsH.List)
			r.Post("/", itemsH.CreateInstrument)
			r.Get("/{id}", instrumentsH.GetByID)
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
	})

	addr := ":" + cfg.AppPort
	fmt.Printf("\n  BodhAssess API v1.0.0\n")
	fmt.Printf("  Environment: %s\n", cfg.AppEnv)
	fmt.Printf("  Listening:   http://localhost%s\n", addr)
	fmt.Printf("  Health:      http://localhost%s/api/v1/health\n\n", addr)

	log.Fatal(http.ListenAndServe(addr, r))
}
