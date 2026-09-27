#!/bin/sh
# Runs once, on the first start of an empty Postgres volume.
# Keycloak keeps its data in its own database and user, separate from the app.
set -e
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<SQL
CREATE USER "$KEYCLOAK_DB_USER" WITH PASSWORD '$KEYCLOAK_DB_PASSWORD';
CREATE DATABASE "$KEYCLOAK_DB_NAME" OWNER "$KEYCLOAK_DB_USER";
SQL
