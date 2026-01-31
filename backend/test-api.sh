#!/bin/bash

TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJjMTZiMTkwNi1mMTEyLTQ1NjUtYjM5MS00Y2YyYWRkYzRlNWUiLCJjdXN0b21lcklkIjoiYzE2YjE5MDYtZjExMi00NTY1LWIzOTEtNGNmMmFkY2M0ZTVlIiwiaWF0IjoxNzM4MzczMzYzLCJleHAiOjE3Mzg5NzgxNjN9.SnER6Gj1sJx-Xmz8GuRUcS9pS5rHIhddD3we_xqHvVI"

curl -s "http://localhost:3001/api/v1/users/me" \
  -H "Authorization: Bearer ${TOKEN}"
