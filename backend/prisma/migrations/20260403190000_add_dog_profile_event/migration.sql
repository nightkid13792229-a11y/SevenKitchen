CREATE TABLE "dog_profile_event" (
  "id" TEXT NOT NULL,
  "customer_id" TEXT NOT NULL,
  "dog_id" TEXT,
  "event_name" TEXT NOT NULL,
  "mode" TEXT NOT NULL,
  "entry_source" TEXT,
  "step_name" TEXT,
  "module_name" TEXT,
  "has_draft" BOOLEAN,
  "calc_status" TEXT,
  "submit_status" TEXT,
  "properties" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "dog_profile_event_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "dog_profile_event_event_name_created_at_idx"
ON "dog_profile_event"("event_name", "created_at");

CREATE INDEX "dog_profile_event_customer_id_created_at_idx"
ON "dog_profile_event"("customer_id", "created_at");

CREATE INDEX "dog_profile_event_dog_id_created_at_idx"
ON "dog_profile_event"("dog_id", "created_at");
