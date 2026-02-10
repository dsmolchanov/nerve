package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"neuralmail/internal/auth"
	"neuralmail/internal/billing"
	"neuralmail/internal/cloudapi"
	"neuralmail/internal/config"
	"neuralmail/internal/store"
)

func main() {
	cfg, err := config.Load(os.Getenv("NM_CONFIG"))
	if err != nil {
		log.Fatalf("config error: %v", err)
	}

	ctx, cancel := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer cancel()

	st, err := store.Open(cfg.Database.DSN)
	if err != nil {
		log.Fatalf("store error: %v", err)
	}
	defer st.Close()

	if err := store.Migrate(ctx, st.DB()); err != nil {
		log.Fatalf("migration error: %v", err)
	}

	authSvc := auth.NewService(cfg, st)
	billingSvc := billing.NewStripeService(cfg, st)
	tokenSvc := cloudapi.NewTokenService(st)
	handler := cloudapi.NewHandler(cfg, st, authSvc, billingSvc, tokenSvc)

	mux := http.NewServeMux()
	mux.HandleFunc("/healthz", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
	})
	handler.RegisterRoutes(mux)

	srv := &http.Server{
		Addr:              cfg.HTTP.Addr,
		Handler:           mux,
		ReadHeaderTimeout: 5 * time.Second,
	}

	go func() {
		<-ctx.Done()
		_ = srv.Shutdown(context.Background())
	}()

	log.Printf("nerve-control-plane listening on %s", cfg.HTTP.Addr)
	if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatalf("server error: %v", err)
	}
}
