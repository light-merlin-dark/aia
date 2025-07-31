#!/bin/bash

# Quick setup script for production tests
# This creates a minimal config to bypass the setup wizard

CONFIG_DIR="$HOME/.aia"
mkdir -p "$CONFIG_DIR"

# Create a minimal SQLite database with OpenRouter configured
cat > /tmp/setup.sql << 'EOF'
CREATE TABLE IF NOT EXISTS services (
  name TEXT PRIMARY KEY,
  api_key TEXT NOT NULL,
  endpoint TEXT
);

CREATE TABLE IF NOT EXISTS models (
  service_name TEXT,
  model_name TEXT,
  PRIMARY KEY (service_name, model_name)
);

CREATE TABLE IF NOT EXISTS global_config (
  key TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS model_pricing (
  service_name TEXT,
  model_name TEXT,
  input_cost_per_million REAL,
  output_cost_per_million REAL,
  PRIMARY KEY (service_name, model_name)
);

-- Insert OpenRouter service (API key will come from environment)
INSERT OR REPLACE INTO services (name, api_key, endpoint) 
VALUES ('openrouter', 'ENV:AIA_OPENROUTER_API_KEY', 'https://openrouter.ai/api/v1');

-- Insert models
INSERT OR REPLACE INTO models (service_name, model_name) VALUES ('openrouter', 'google/gemini-2.5-pro');
INSERT OR REPLACE INTO models (service_name, model_name) VALUES ('openrouter', 'google/gemini-2.5-flash');

-- Set default service
INSERT OR REPLACE INTO services (name, api_key) VALUES ('default', '');
INSERT OR REPLACE INTO global_config (key, value) VALUES ('defaultService', 'openrouter');

-- Enable plugins
INSERT OR REPLACE INTO global_config (key, value) VALUES ('plugins', '{"enabled":["openrouter"],"disabled":[]}');
EOF

# Create the database
sqlite3 "$CONFIG_DIR/config.db" < /tmp/setup.sql

echo "✅ Test configuration created at $CONFIG_DIR/config.db"