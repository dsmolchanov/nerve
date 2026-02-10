package main

import (
	"context"
	"log"
	"os"

	"neuralmail/internal/config"
	"neuralmail/internal/reconcile"
	"neuralmail/internal/store"
)

func main() {
	cfg, err := config.Load(os.Getenv("NM_CONFIG"))
	if err != nil {
		log.Fatalf("config error: %v", err)
	}

	st, err := store.Open(cfg.Database.DSN)
	if err != nil {
		log.Fatalf("store error: %v", err)
	}
	defer st.Close()

	ctx := context.Background()
	if err := store.Migrate(ctx, st.DB()); err != nil {
		log.Fatalf("migration error: %v", err)
	}

	svc := reconcile.NewService(st)
	report, err := svc.Run(ctx)
	if err != nil {
		log.Fatalf("reconciliation failed: %v", err)
	}
	log.Printf("reconciliation complete: counters_repaired=%d periods_rolled=%d", report.CountersRepaired, report.PeriodsRolled)
}
