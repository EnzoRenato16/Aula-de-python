-- Runs once, when the Postgres volume of docker compose is created.
-- The web tests drop and recreate the schema of this separate database.
CREATE DATABASE raiox_test OWNER raiox;
