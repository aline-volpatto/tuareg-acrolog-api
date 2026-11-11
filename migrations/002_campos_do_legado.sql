ALTER TABLE flights
  ADD COLUMN engine_start TIME,
  ADD COLUMN engine_stop TIME;

ALTER TABLE flights
  ADD COLUMN flight_hours NUMERIC(5,2) CHECK (flight_hours > 0 AND flight_hours <= 24);

UPDATE flights
  SET flight_hours = ROUND(duration_minutes / 60.0, 2)
  WHERE duration_minutes IS NOT NULL;

ALTER TABLE flights DROP COLUMN duration_minutes;

ALTER TABLE maneuvers
  ADD COLUMN repeat BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE figures (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE hour_credits (
  id SERIAL PRIMARY KEY,
  student_id INTEGER NOT NULL REFERENCES students(id),
  hours NUMERIC(6,2) NOT NULL CHECK (hours > 0),
  credit_date DATE NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);