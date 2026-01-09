#!/bin/bash
cd /Users/zhaochen/Documents/SevenKitchen/backend
DATABASE_URL="postgres://user:pass@127.0.0.1:5433/sevenkitchen" ORDER_REPO=prisma ADDRESS_REPO=prisma pnpm start:dev > /tmp/prisma-start.log 2>&1 &
PID=$!
sleep 10
kill $PID 2>/dev/null || true
wait $PID 2>/dev/null || true
cat /tmp/prisma-start.log | head -100


