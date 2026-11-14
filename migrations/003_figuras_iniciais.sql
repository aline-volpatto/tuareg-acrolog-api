-- Migração 003: figuras iniciais do app antigo (legado/script.js)

INSERT INTO figures (name) VALUES
  ('Parafuso'),
  ('Looping'),
  ('Curva de competição'),
  ('Meio cubano'),
  ('Oito cubano'),
  ('Meio cubano invertido'),
  ('Dente de tubarão'),
  ('Dente de tubarão invertido'),
  ('Hammerhead'),
  ('Golden fish'),
  ('Tonneau primeiro tipo'),
  ('Tonneau segundo tipo'),
  ('Tonneau terceiro tipo'),
  ('Sequência Básica'),
  ('Sequência Sport'),
  ('Sequência Intermediária'),
  ('Sequência Avançada'),
  ('Linha de 45 graus')
ON CONFLICT (name) DO NOTHING;