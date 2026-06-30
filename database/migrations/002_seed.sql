INSERT INTO roles (name) VALUES ('admin')
ON CONFLICT (name) DO NOTHING;

INSERT INTO roles (name) VALUES ('staff')
ON CONFLICT (name) DO NOTHING;
