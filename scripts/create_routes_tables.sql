-- Rota Katılım Özelliği için veritabanı tabloları
-- Çalıştırmak için: mysql -u root gezgin < scripts/create_routes_tables.sql

-- routes tablosu: Kullanıcıların oluşturduğu rotalar
CREATE TABLE IF NOT EXISTS routes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  owner_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- route_participants tablosu: Rota katılımcıları
-- UNIQUE KEY ile aynı kullanıcının aynı rotaya birden fazla katılması engellenir
CREATE TABLE IF NOT EXISTS route_participants (
  id INT AUTO_INCREMENT PRIMARY KEY,
  route_id INT NOT NULL,
  user_id INT NOT NULL,
  joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (route_id) REFERENCES routes(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY unique_participation (route_id, user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
