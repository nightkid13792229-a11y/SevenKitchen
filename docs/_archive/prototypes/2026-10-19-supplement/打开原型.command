#!/bin/bash
cd "$(dirname "$0")" || exit 1
PORT=8765
while lsof -i :$PORT >/dev/null 2>&1; do PORT=$((PORT+1)); done
python3 -m http.server $PORT >/tmp/sevenkitchen-prototype.log 2>&1 &
SERVER_PID=$!
sleep 1
open "http://127.0.0.1:$PORT/index.html"
echo "原型已打开：http://127.0.0.1:$PORT/index.html"
echo "服务进程：$SERVER_PID"
echo "要停止服务，运行：kill $SERVER_PID"
