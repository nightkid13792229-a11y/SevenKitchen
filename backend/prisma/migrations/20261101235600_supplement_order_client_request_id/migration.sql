ALTER TABLE "supplement_order" ADD COLUMN "client_request_id" VARCHAR(64);

CREATE UNIQUE INDEX "supplement_order_user_id_client_request_id_key"
  ON "supplement_order"("user_id", "client_request_id");
